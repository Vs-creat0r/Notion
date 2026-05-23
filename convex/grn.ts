import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Helper function to get current user
async function getCurrentUser(ctx: any) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        throw new ConvexError("Not authenticated");
    }

    const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", identity.subject))
        .first();

    if (!user) {
        throw new ConvexError("User not found");
    }

    return user;
}

// Helper function to generate GRN Number in format GRN-001, GRN-002, etc.
async function generateGRNNumber(ctx: any): Promise<string> {
    // Optimization: query only the latest GRN and extract its number
    const latestGRN = await ctx.db
        .query("grns")
        .order("desc")
        .first();

    let maxNumber = 0;
    if (latestGRN) {
        // Match any trailing digits after "GRN-" (handles GRN-001, GRN-2026-0001, etc.)
        const numMatch = latestGRN.grnNumber.match(/(\d+)$/);
        if (numMatch) {
            maxNumber = parseInt(numMatch[1], 10);
        }
    }
    const nextNumber = maxNumber + 1;
    return `GRN-${nextNumber.toString().padStart(3, "0")}`;
}

export const getPendingPOsForGRN = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const currentUser = await ctx.db
            .query("users")
            .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", identity.subject))
            .first();

        if (!currentUser || (currentUser.role !== "site_engineer" && currentUser.role !== "manager" && currentUser.role !== "purchase_officer")) {
            return [];
        }

        // Get all ordered POs
        const orderedPOs = await ctx.db
            .query("purchaseOrders")
            .withIndex("by_status", (q) => q.eq("status", "ordered"))
            .collect();

        const pendingPOs = [];

        for (const po of orderedPOs) {
            // Get all GRNs for this PO to calculate received quantity
            const grns = await ctx.db
                .query("grns")
                .withIndex("by_po_id", (q) => q.eq("poId", po._id))
                .collect();

            const receivedQuantity = grns.reduce((sum, grn) => sum + ((grn as any).receivedQuantity || 0), 0);
            const remainingQuantity = ((po as any).quantity || 0) - receivedQuantity;

            if (remainingQuantity > 0) {
                const vendor = (po as any).vendorId ? await ctx.db.get((po as any).vendorId) : null;
                const request = (po as any).requestId ? await ctx.db.get((po as any).requestId) : null;
                const site = (po as any).deliverySiteId
                    ? await ctx.db.get((po as any).deliverySiteId)
                    : (request && (request as any).siteId ? await ctx.db.get((request as any).siteId) : null);

                pendingPOs.push({
                    ...po,
                    vendor,
                    request,
                    site,
                    receivedQuantity,
                    remainingQuantity
                });
            }
        }

        return pendingPOs.sort((a, b) => b._creationTime - a._creationTime);
    },
});

export const getAllGRNs = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const currentUser = await ctx.db
            .query("users")
            .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", identity.subject))
            .first();

        if (!currentUser || (currentUser.role !== "site_engineer" && currentUser.role !== "manager" && currentUser.role !== "purchase_officer")) {
            return [];
        }

        // Extreme limit (jugad) to prevent Convex internal DB operation limits (1000)
        // 50 records * ~5 lookups per record = 250 DB operations. Safe.
        const grns = await ctx.db.query("grns").order("desc").take(50);

        const safeGet = async (tableName: keyof import("./_generated/dataModel").DataModel, idStr: any) => {
            if (!idStr) return null;
            try {
                const normalizedId = ctx.db.normalizeId(tableName, idStr);
                return normalizedId ? await ctx.db.get(normalizedId) : null;
            } catch (e) {
                return null;
            }
        };

        return Promise.all(
            grns.map(async (grn) => {
                const po = await safeGet("purchaseOrders", (grn as any).poId);
                const vendor = po ? await safeGet("vendors", (po as any).vendorId) : null;
                const site = await safeGet("sites", (grn as any).siteId);
                const creator = await safeGet("users", (grn as any).createdBy);
                const request = po ? await safeGet("requests", (po as any).requestId) : null;

                return {
                    ...grn,
                    po,
                    vendor,
                    site,
                    creator,
                    request
                };
            })
        );
    },
});

export const createGRN = mutation({
    args: {
        poId: v.id("purchaseOrders"),
        receivedQuantity: v.number(),
        invoiceNo: v.optional(v.string()),
        invoiceDate: v.optional(v.number()),
        siteId: v.optional(v.id("sites")),
        invoicePhoto: v.optional(v.object({
            imageUrl: v.string(),
            imageKey: v.string(),
        })),
        itemName: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const currentUser = await getCurrentUser(ctx);

        if (currentUser.role !== "site_engineer" && currentUser.role !== "manager" && currentUser.role !== "purchase_officer") {
            throw new ConvexError("Unauthorized");
        }

        const po = await ctx.db.get(args.poId);
        if (!po) {
            throw new ConvexError("Purchase Order not found");
        }

        if (args.receivedQuantity <= 0) {
            throw new ConvexError("Received quantity must be greater than 0");
        }

        // Calculate current received
        const existingGRNs = await ctx.db
            .query("grns")
            .withIndex("by_po_id", (q) => q.eq("poId", args.poId))
            .collect();

        const currentReceived = existingGRNs.reduce((sum, g) => sum + g.receivedQuantity, 0);

        if (currentReceived + args.receivedQuantity > po.quantity) {
            throw new ConvexError(`Cannot receive more than PO quantity. Remaining: ${po.quantity - currentReceived}`);
        }

        const grnNumber = await generateGRNNumber(ctx);
        const now = Date.now();

        const grnId = await ctx.db.insert("grns", {
            grnNumber,
            poId: args.poId,
            receivedQuantity: args.receivedQuantity,
            invoiceNo: args.invoiceNo,
            invoiceDate: args.invoiceDate,
            siteId: args.siteId || po.deliverySiteId,
            invoicePhoto: args.invoicePhoto,
            itemName: args.itemName || po.itemDescription,
            status: "completed",
            createdBy: currentUser._id,
            createdAt: now,
            updatedAt: now,
        });

        const newReceivedTotal = currentReceived + args.receivedQuantity;

        // If fully received, update PO and Request status
        if (newReceivedTotal >= po.quantity) {
            await ctx.db.patch(args.poId, {
                status: "delivered",
                actualDeliveryDate: now,
                updatedAt: now,
            });

            if (po.requestId) {
                await ctx.db.patch(po.requestId, {
                    status: "delivered",
                    deliveryMarkedAt: now,
                    updatedAt: now,
                });
            }
        } else {
            // Partially received, update request status to delivery_processing
            if (po.requestId) {
                await ctx.db.patch(po.requestId, {
                    status: "delivery_processing",
                    updatedAt: now,
                });
            }
        }

        // Add to log
        await ctx.db.insert("request_notes", {
            requestNumber: (po.requestId ? (await ctx.db.get(po.requestId))?.requestNumber : po.poNumber) || "SYSTEM",
            userId: currentUser._id,
            role: currentUser.role,
            type: "log",
            content: `Created GRN ${grnNumber} for ${args.receivedQuantity} unit(s)`,
            status: newReceivedTotal >= po.quantity ? "delivered" : "ordered",
            createdAt: now,
        });

        return { grnId, grnNumber };
    },
});

// New mutation: Create GRN from Pending PO page delivery
// This creates a GRN for each item being delivered
export const createGRNFromDelivery = mutation({
    args: {
        poNumber: v.string(),
        requestId: v.id("requests"),
        deliveryQuantity: v.number(),
        invoiceNo: v.optional(v.string()),
        invoiceDate: v.optional(v.number()),
        invoicePhoto: v.optional(v.object({
            imageUrl: v.string(),
            imageKey: v.string(),
        })),
    },
    handler: async (ctx, args) => {
        const currentUser = await getCurrentUser(ctx);

        if (currentUser.role !== "site_engineer" && currentUser.role !== "manager" && currentUser.role !== "purchase_officer") {
            throw new ConvexError("Unauthorized");
        }

        if (args.deliveryQuantity <= 0) {
            throw new ConvexError("Delivery quantity must be greater than 0");
        }

        // Find the PO for this request
        const request = await ctx.db.get(args.requestId);
        if (!request) {
            throw new ConvexError("Request not found");
        }

        // Find PO by poNumber and requestId
        const allPOs = await ctx.db
            .query("purchaseOrders")
            .withIndex("by_po_number", (q) => q.eq("poNumber", args.poNumber))
            .collect();

        // Find the PO that matches this request
        let po = allPOs.find(p => p.requestId === args.requestId);

        // If no direct match, try finding any PO with this number
        if (!po && allPOs.length > 0) {
            po = allPOs[0];
        }

        if (!po) {
            throw new ConvexError(`Purchase Order ${args.poNumber} not found`);
        }

        // Calculate current received
        const existingGRNs = await ctx.db
            .query("grns")
            .withIndex("by_po_id", (q) => q.eq("poId", po._id))
            .collect();

        const currentReceived = existingGRNs.reduce((sum, g) => sum + g.receivedQuantity, 0);

        if (currentReceived + args.deliveryQuantity > po.quantity) {
            throw new ConvexError(`Cannot receive more than PO quantity. Remaining: ${po.quantity - currentReceived}`);
        }

        const grnNumber = await generateGRNNumber(ctx);
        const now = Date.now();

        // Get site info
        const siteId = po.deliverySiteId || request.siteId;

        const grnId = await ctx.db.insert("grns", {
            grnNumber,
            poId: po._id,
            receivedQuantity: args.deliveryQuantity,
            invoiceNo: args.invoiceNo,
            invoiceDate: args.invoiceDate,
            siteId: siteId,
            invoicePhoto: args.invoicePhoto,
            itemName: request.itemName || po.itemDescription,
            status: "completed",
            createdBy: currentUser._id,
            createdAt: now,
            updatedAt: now,
        });

        const newReceivedTotal = currentReceived + args.deliveryQuantity;

        // If fully received, update PO status
        if (newReceivedTotal >= po.quantity) {
            await ctx.db.patch(po._id, {
                status: "delivered",
                actualDeliveryDate: now,
                updatedAt: now,
            });
        }

        // Update request status - Handle split if partial delivery
        if (args.deliveryQuantity < request.quantity) {
            // SPLIT: Create new request for the DELIVERED portion
            const { _id, _creationTime, ...requestData } = request;
            await ctx.db.insert("requests", {
                ...requestData,
                quantity: args.deliveryQuantity,
                status: "delivered",
                deliveryMarkedAt: now,
                updatedAt: now,
            });

            // REDUCE original request and mark as partially delivered
            await ctx.db.patch(request._id, {
                quantity: request.quantity - args.deliveryQuantity,
                status: "delivery_processing",
                updatedAt: now,
            });
        } else {
            // FULL delivery - Update existing request
            await ctx.db.patch(args.requestId, {
                status: "delivered",
                deliveryMarkedAt: now,
                updatedAt: now,
            });
        }

        // Add to log
        await ctx.db.insert("request_notes", {
            requestNumber: request.requestNumber || "SYSTEM",
            userId: currentUser._id,
            role: currentUser.role,
            type: "log",
            content: `Created GRN ${grnNumber} — Delivered ${args.deliveryQuantity} ${request.unit || 'unit(s)'} of ${request.itemName}`,
            status: "delivered",
            createdAt: now,
        });

        return { grnId, grnNumber };
    },
});

export const updateGRN = mutation({
    args: {
        grnId: v.id("grns"),
        invoiceNo: v.optional(v.string()),
        invoiceDate: v.optional(v.number()),
        clearInvoiceDate: v.optional(v.boolean()),
        invoicePhoto: v.optional(v.object({
            imageUrl: v.string(),
            imageKey: v.string(),
        })),
    },
    handler: async (ctx, args) => {
        const currentUser = await getCurrentUser(ctx);

        if (currentUser.role !== "site_engineer" && currentUser.role !== "manager" && currentUser.role !== "purchase_officer") {
            throw new ConvexError("Unauthorized");
        }

        const grn = await ctx.db.get(args.grnId);
        if (!grn) {
            throw new ConvexError("GRN not found");
        }

        const updates: any = { updatedAt: Date.now() };
        if (args.invoiceNo !== undefined) updates.invoiceNo = args.invoiceNo;
        if (args.clearInvoiceDate) {
            updates.invoiceDate = undefined;
        } else if (args.invoiceDate !== undefined) {
            updates.invoiceDate = args.invoiceDate;
        }
        if (args.invoicePhoto !== undefined) updates.invoicePhoto = args.invoicePhoto;

        await ctx.db.patch(args.grnId, updates);
    },
});

