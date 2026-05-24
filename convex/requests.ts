/**
 * Material Requests Management Functions
 * 
 * Handles CRUD operations for material requests.
 * Site Engineers can create requests.
 * Managers can approve/reject requests.
 * Site Engineers can mark deliveries.
 */

import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// Helper function to get current user
async function getCurrentUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
    .first();

  if (!user) {
    throw new ConvexError("User not found");
  }

  return user;
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get sites assigned to current user
 * Returns empty array if user has no assigned sites
 */
export const getUserAssignedSites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return [];

    if (!currentUser.assignedSites || currentUser.assignedSites.length === 0) {
      return [];
    }

    // Fetch site details for assigned sites
    const sites = await Promise.all(
      currentUser.assignedSites.map(async (siteId: Id<"sites">) => {
        const site = await ctx.db.get(siteId);
        return site;
      })
    );

    // Filter out inactive sites and null values
    return sites.filter((site) => site && site.isActive);
  },
});

/**
 * Get projects assigned to current user (site engineer)
 * Returns all projects if user is purchase_officer/manager (for RFQ)
 */
export const getUserAssignedProjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return [];

    // Purchase officers and managers see all projects
    if (currentUser.role === "purchase_officer" || currentUser.role === "manager") {
      return await ctx.db.query("projects").collect();
    }

    // Site engineers see only their assigned projects
    const assignedProjectIds: Id<"projects">[] = (currentUser as any).assignedProjects || [];
    if (assignedProjectIds.length === 0) return [];

    const projects = await Promise.all(
      assignedProjectIds.map((id) => ctx.db.get(id))
    );
    return projects.filter(Boolean);
  },
});

/**
 * Get requests associated with a specific project
 */
export const getRequestsByProjectId = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return [];

    const requests = await ctx.db
      .query("requests")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    return requests;
  },
});

/**
 * Get inventory items for autocomplete suggestions
 * Returns all active inventory items with their names and units
 */
export const getInventoryItemsForAutocomplete = query({
  args: {
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return [];

    // All roles can view inventory for autocomplete
    let items = await ctx.db
      .query("inventory")
      .withIndex("by_is_active", (q) => q.eq("isActive", true))
      .collect();

    // Filter by search query if provided
    if (args.searchQuery && args.searchQuery.trim()) {
      const query = args.searchQuery.toLowerCase().trim();
      items = items.filter((item) =>
        item.itemName.toLowerCase().includes(query)
      );
    }

    // Return simplified item data for autocomplete
    return items.map((item) => ({
      _id: item._id,
      itemName: item.itemName,
      unit: item.unit || "",
      centralStock: item.centralStock || 0,
      imageUrl: (item as any).images?.[0]?.imageUrl || null,
      description: item.description || "",
      hsnSacCode: item.hsnSacCode || "",
      images: (item as any).images?.map((img: any) => ({ imageUrl: img.imageUrl, imageKey: img.imageKey })) || [],
    }));
  },
});

/**
 * Get all requests created by current user (Site Engineer)
 */
export const getUserRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return [];

    const requests = await ctx.db
      .query("requests")
      .withIndex("by_created_by", (q) => q.eq("createdBy", currentUser._id))
      .order("desc")
      .collect();

    // Gather request numbers for efficient notes counting
    const requestNumbers = [...new Set(requests.map((r) => r.requestNumber))];
    const notesCounts = new Map<string, number>();

    await Promise.all(
      requestNumbers.map(async (num) => {
        const notes = await ctx.db
          .query("request_notes")
          .withIndex("by_request_number", (q) => q.eq("requestNumber", num))
          .collect();
        // Only count user-written notes (type=="note"), not audit logs
        notesCounts.set(num, notes.filter(n => n.type === "note").length);
      })
    );

    // Fetch related data (site, creator, approver)
    const requestsWithDetails = await Promise.all(
      requests.map(async (request) => {
        const site = await ctx.db.get(request.siteId);
        const project = request.projectId ? await ctx.db.get(request.projectId) : null;
        const creator = await ctx.db.get(request.createdBy);
        const approver = request.approvedBy
          ? await ctx.db.get(request.approvedBy)
          : null;

        // Fetch vendor information from cost comparison
        let selectedVendorId: Id<"vendors"> | null = null;
        let vendorQuotes: Array<{ vendorId: Id<"vendors">, unitPrice: number, amount?: number, unit?: string }> = [];
        const costComparison = await ctx.db
          .query("costComparisons")
          .withIndex("by_request_id", (q) => q.eq("requestId", request._id))
          .first();

        if (costComparison) {
          // If approved, use selected vendor
          if (costComparison.status === "cc_approved" && costComparison.selectedVendorId) {
            selectedVendorId = costComparison.selectedVendorId;
          }
          // Always populate vendorQuotes if they exist
          if (costComparison.vendorQuotes && costComparison.vendorQuotes.length > 0) {
            vendorQuotes = costComparison.vendorQuotes;
            // If checking for draft/pending default selection (only if not already approved)
            if (!selectedVendorId) {
              selectedVendorId = costComparison.vendorQuotes[0].vendorId;
            }
          }
        }

        return {
          ...request,
          site: site
            ? {
              _id: site._id,
              name: site.name,
              code: site.code,
              address: site.address,
            }
            : null,
          project: project
            ? {
              _id: project._id,
              name: project.name,
              location: project.location,
            }
            : null,
          creator: creator
            ? {
              _id: creator._id,
              fullName: creator.fullName,
              role: creator.role,
              profileImage: creator.profileImage,
            }
            : null,
          approver: approver
            ? {
              _id: approver._id,
              fullName: approver.fullName,
              role: approver.role,
              profileImage: approver.profileImage,
            }
            : null,
          selectedVendorId,
          vendorQuotes,
          notesCount: notesCounts.get(request.requestNumber) || 0,
        };
      })
    );

    return requestsWithDetails;
  },
});

/**
 * Get requests ready for cost comparison (Purchase Officer view)
 */
export const getRequestsReadyForCC = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return [];

    // Only purchase officers can view these requests
    if (currentUser.role !== "purchase_officer") {
      return [];
    }

    const requests = await ctx.db
      .query("requests")
      .withIndex("by_status", (q) => q.eq("status", "ready_for_cc"))
      .order("desc")
      .collect();

    // Fetch related data
    // Gather request numbers for efficient notes counting
    const requestNumbers = [...new Set(requests.map((r) => r.requestNumber))];
    const notesCounts = new Map<string, number>();

    await Promise.all(
      requestNumbers.map(async (num) => {
        const notes = await ctx.db
          .query("request_notes")
          .withIndex("by_request_number", (q) => q.eq("requestNumber", num))
          .collect();
        // Only count user-written notes (type=="note"), not audit logs
        notesCounts.set(num, notes.filter(n => n.type === "note").length);
      })
    );

    const requestsWithDetails = await Promise.all(
      requests.map(async (request) => {
        const site = await ctx.db.get(request.siteId);
        const project = request.projectId ? await ctx.db.get(request.projectId) : null;
        const creator = await ctx.db.get(request.createdBy);
        const approver = request.approvedBy
          ? await ctx.db.get(request.approvedBy)
          : null;

        // Fetch vendor information from cost comparison
        let selectedVendorId: Id<"vendors"> | null = null;
        let vendorQuotes: Array<{ vendorId: Id<"vendors">, unitPrice: number, amount?: number, unit?: string }> = [];
        const costComparison = await ctx.db
          .query("costComparisons")
          .withIndex("by_request_id", (q) => q.eq("requestId", request._id))
          .first();

        if (costComparison) {
          // If approved, use selected vendor
          if (costComparison.status === "cc_approved" && costComparison.selectedVendorId) {
            selectedVendorId = costComparison.selectedVendorId;
          }
          // Always populate vendorQuotes if they exist
          if (costComparison.vendorQuotes && costComparison.vendorQuotes.length > 0) {
            vendorQuotes = costComparison.vendorQuotes;
            // If checking for draft/pending default selection (only if not already approved)
            if (!selectedVendorId) {
              selectedVendorId = costComparison.vendorQuotes[0].vendorId;
            }
          }
        }

        return {
          ...request,
          site: site
            ? {
              _id: site._id,
              name: site.name,
              code: site.code,
              address: site.address,
            }
            : null,
          project: project
            ? {
              _id: project._id,
              name: project.name,
              location: project.location,
            }
            : null,
          creator: creator
            ? {
              _id: creator._id,
              fullName: creator.fullName,
              role: creator.role,
              profileImage: creator.profileImage,
            }
            : null,
          approver: approver
            ? {
              _id: approver._id,
              fullName: approver.fullName,
              role: approver.role,
              profileImage: approver.profileImage,
            }
            : null,
          selectedVendorId,
          vendorQuotes,
          notesCount: notesCounts.get(request.requestNumber) || 0,
        };
      })
    );

    return requestsWithDetails;
  },
});

/**
 * Get requests by status for purchase officer dashboard
 */
export const getPurchaseRequestsByStatus = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("pending"),
        v.literal("rejected"),
        v.literal("recheck"),
        v.literal("ready_for_cc"),
        v.literal("cc_pending"),
        v.literal("cc_approved"),
        v.literal("cc_rejected"),
        v.literal("ready_for_po"),
        v.literal("pending_po"),
        v.literal("rejected_po"),
        v.literal("ready_for_delivery"),
        v.literal("delivery_stage"),
        v.literal("delivery_processing"),
        v.literal("out_for_delivery")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return [];

    // Only purchase officers and managers can view these requests
    if (currentUser.role !== "purchase_officer" && currentUser.role !== "manager") {
      return [];
    }

    let requests;
    if (args.status) {
      if (args.status === "draft") {
        // Special case for drafts: ONLY show drafts created by the Purchase Officer themselves
        requests = await ctx.db
          .query("requests")
          .withIndex("by_created_by", (q) => q.eq("createdBy", currentUser._id))
          .order("desc")
          .collect();
        requests = requests.filter((r) => r.status === "draft");
      } else {
        // TypeScript guard: ensure status is defined before using it
        const status = args.status;
        requests = await ctx.db
          .query("requests")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .collect();
      }
    } else {
      // Get all requests first
      const allRequests = await ctx.db
        .query("requests")
        .collect();

      // Identify "Active Purchase Groups":
      // A group is active if it contains at least one item in a purchase-relevant status
      const purchaseRelevantStatuses = new Set([
        "recheck",
        "ready_for_cc",
        "cc_rejected",
        "cc_pending",
        "cc_approved",
        "ready_for_po",
        "pending_po",
        "rejected_po",
        "ready_for_delivery",
        "delivery_stage",
        "delivered",
        "sign_pending",
        "sign_rejected",
        "delivery_processing",
        "out_for_delivery"
      ]);

      const activeRequestNumbers = new Set<string>();

      // First pass: Find all request numbers that have at least one purchase-relevant item
      // OR if it's a draft created by me
      for (const r of allRequests) {
        if (purchaseRelevantStatuses.has(r.status)) {
          activeRequestNumbers.add(r.requestNumber);
        } else if (r.status === "draft" && r.createdBy === currentUser._id) {
          activeRequestNumbers.add(r.requestNumber);
        }
      }

      // Second pass: Filter to include ALL items belonging to active groups
      // Exception: Do not show drafts created by others even if the group is active
      requests = allRequests.filter((r) => {
        if (!activeRequestNumbers.has(r.requestNumber)) return false;

        // Hide drafts from other users
        if (r.status === "draft" && r.createdBy !== currentUser._id) return false;

        return true;
      });
    }

    // Fetch related data
    // Gather request numbers for efficient notes counting
    const requestNumbers = [...new Set(requests.map((r) => r.requestNumber))];
    const notesCounts = new Map<string, number>();

    await Promise.all(
      requestNumbers.map(async (num) => {
        const notes = await ctx.db
          .query("request_notes")
          .withIndex("by_request_number", (q) => q.eq("requestNumber", num))
          .collect();
        // Only count user-written notes (type=="note"), not audit logs
        notesCounts.set(num, notes.filter(n => n.type === "note").length);
      })
    );

    const requestsWithDetails = await Promise.all(
      requests.map(async (request) => {
        const site = await ctx.db.get(request.siteId);
        const creator = await ctx.db.get(request.createdBy);
        const approver = request.approvedBy
          ? await ctx.db.get(request.approvedBy)
          : null;

        // Fetch vendor information from cost comparison
        let selectedVendorId: Id<"vendors"> | null = null;
        let vendorQuotes: Array<{ vendorId: Id<"vendors">, unitPrice: number, amount?: number, unit?: string }> = [];
        const costComparison = await ctx.db
          .query("costComparisons")
          .withIndex("by_request_id", (q) => q.eq("requestId", request._id))
          .first();

        if (costComparison) {
          // If approved, use selected vendor
          if (costComparison.status === "cc_approved" && costComparison.selectedVendorId) {
            selectedVendorId = costComparison.selectedVendorId;
          }
          // Always populate vendorQuotes if they exist
          if (costComparison.vendorQuotes && costComparison.vendorQuotes.length > 0) {
            vendorQuotes = costComparison.vendorQuotes;
            // If checking for draft/pending default selection (only if not already approved)
            if (!selectedVendorId) {
              selectedVendorId = costComparison.vendorQuotes[0].vendorId;
            }
          }
        }



        // Fetch related Purchase Order linkage
        let poId: Id<"purchaseOrders"> | null = null;
        let poNumber: string | null = null;
        if (["pending_po", "ready_for_delivery", "delivery_stage", "delivery_processing", "out_for_delivery", "delivered", "sign_pending", "sign_rejected"].includes(request.status)) {
          let po = await ctx.db
            .query("purchaseOrders")
            .withIndex("by_request_id", (q) => q.eq("requestId", request._id))
            .first();

          // Fallback: If not found (e.g. split item), check siblings by requestNumber
          if (!po) {
            const siblings = await ctx.db.query("requests")
              .withIndex("by_request_number", (q) => q.eq("requestNumber", request.requestNumber))
              .collect();

            for (const sibling of siblings) {
              if (sibling._id === request._id) continue;
              const siblingPO = await ctx.db.query("purchaseOrders")
                .withIndex("by_request_id", (q) => q.eq("requestId", sibling._id))
                .first();
              if (siblingPO) {
                po = siblingPO;
                break;
              }
            }
          }

          if (po) {
            poId = po._id;
            poNumber = po.poNumber;
          }
        }

        let dcId: Id<"deliveries"> | null = null;
        let dcNumber: string | null = null;
        if (request.deliveryId) {
          const delivery = await ctx.db.get(request.deliveryId);
          if (delivery) {
            dcId = delivery._id;
            dcNumber = delivery.deliveryId;
          }
        } else if (poId) {
          const delivery = await ctx.db
            .query("deliveries")
            .withIndex("by_po_id", (q) => q.eq("poId", poId))
            .first();
          if (delivery) {
            dcId = delivery._id;
            dcNumber = delivery.deliveryId;
          }
        }

        return {
          ...request,
          poId,
          poNumber,
          ccId: costComparison ? costComparison._id : null,
          ccNumber: costComparison?.ccNumber || null,
          dcId,
          dcNumber,
          project: request.projectId ? await ctx.db.get(request.projectId) : null,
          site: site
            ? {
              _id: site._id,
              name: site.name,
              code: site.code,
              address: site.address,
            }
            : null,
          creator: creator
            ? {
              _id: creator._id,
              fullName: creator.fullName,
              role: creator.role,
              profileImage: creator.profileImage,
              username: creator.username,
            }
            : null,
          approver: approver
            ? {
              _id: approver._id,
              fullName: approver.fullName,
              role: approver.role,
              profileImage: approver.profileImage,
            }
            : null,
          selectedVendorId,
          vendorQuotes,
          isSplitApproved: request.isSplitApproved ?? (costComparison?.managerNotes?.includes("Split Fulfillment Approved") || false),
          notesCount: notesCounts.get(request.requestNumber) || 0,
        };
      })
    );

    return requestsWithDetails;
  },
});

/**
 * Get all requests (Manager view)
 */
export const getAllRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return [];

    // Only managers and purchase officers can view all requests
    if (currentUser.role !== "manager" && currentUser.role !== "purchase_officer") {
      return [];
    }

    const requests = await ctx.db
      .query("requests")
      .withIndex("by_created_at")
      .order("desc")
      .collect();

    // Gather request numbers for efficient notes counting
    const requestNumbers = [...new Set(requests.map((r) => r.requestNumber))];
    const notesCounts = new Map<string, number>();

    await Promise.all(
      requestNumbers.map(async (num) => {
        const notes = await ctx.db
          .query("request_notes")
          .withIndex("by_request_number", (q) => q.eq("requestNumber", num))
          .collect();
        // Only count user-written notes (type=="note"), not audit logs
        notesCounts.set(num, notes.filter(n => n.type === "note").length);
      })
    );

    // Fetch related data (site, creator, approver)
    const requestsWithDetails = await Promise.all(
      requests.map(async (request) => {
        const site = await ctx.db.get(request.siteId);
        const creator = await ctx.db.get(request.createdBy);
        const approver = request.approvedBy
          ? await ctx.db.get(request.approvedBy)
          : null;

        // Fetch vendor information from cost comparison
        let selectedVendorId: Id<"vendors"> | null = null;
        let vendorQuotes: Array<{ vendorId: Id<"vendors">, unitPrice: number, amount?: number, unit?: string }> = [];
        const costComparison = await ctx.db
          .query("costComparisons")
          .withIndex("by_request_id", (q) => q.eq("requestId", request._id))
          .first();

        if (costComparison) {
          // If approved, use selected vendor
          if (costComparison.status === "cc_approved" && costComparison.selectedVendorId) {
            selectedVendorId = costComparison.selectedVendorId;
          }
          // Always populate vendorQuotes if they exist
          if (costComparison.vendorQuotes && costComparison.vendorQuotes.length > 0) {
            vendorQuotes = costComparison.vendorQuotes;
            // If checking for draft/pending default selection (only if not already approved)
            if (!selectedVendorId) {
              selectedVendorId = costComparison.vendorQuotes[0].vendorId;
            }
          }
        }

        // Fetch related Purchase Order linkage
        let poId: Id<"purchaseOrders"> | null = null;
        let poNumber: string | null = null;
        if (["pending_po", "ready_for_delivery", "delivery_stage", "delivery_processing", "out_for_delivery", "delivered", "sign_pending", "sign_rejected"].includes(request.status)) {
          let po = await ctx.db
            .query("purchaseOrders")
            .withIndex("by_request_id", (q) => q.eq("requestId", request._id))
            .first();

          // Fallback: If not found (e.g. split item), check siblings by requestNumber
          if (!po) {
            const siblings = await ctx.db.query("requests")
              .withIndex("by_request_number", (q) => q.eq("requestNumber", request.requestNumber))
              .collect();

            for (const sibling of siblings) {
              if (sibling._id === request._id) continue;
              const siblingPO = await ctx.db.query("purchaseOrders")
                .withIndex("by_request_id", (q) => q.eq("requestId", sibling._id))
                .first();
              if (siblingPO) {
                po = siblingPO;
                break;
              }
            }
          }

          if (po) {
            poId = po._id;
            poNumber = po.poNumber;
          }
        }

        let dcId: Id<"deliveries"> | null = null;
        let dcNumber: string | null = null;
        if (request.deliveryId) {
          const delivery = await ctx.db.get(request.deliveryId);
          if (delivery) {
            dcId = delivery._id;
            dcNumber = delivery.deliveryId;
          }
        } else if (poId) {
          const delivery = await ctx.db
            .query("deliveries")
            .withIndex("by_po_id", (q) => q.eq("poId", poId))
            .first();
          if (delivery) {
            dcId = delivery._id;
            dcNumber = delivery.deliveryId;
          }
        }

        return {
          ...request,
          poId,
          poNumber,
          ccId: costComparison ? costComparison._id : null,
          ccNumber: costComparison?.ccNumber || null,
          dcId,
          dcNumber,
          project: request.projectId ? await ctx.db.get(request.projectId) : null,
          site: site
            ? {
              _id: site._id,
              name: site.name,
              code: site.code,
              address: site.address,
            }
            : null,
          creator: creator
            ? {
              _id: creator._id,
              fullName: creator.fullName,
              role: creator.role,
              profileImage: creator.profileImage,
              username: creator.username,
            }
            : null,
          approver: approver
            ? {
              _id: approver._id,
              fullName: approver.fullName,
              profileImage: approver.profileImage,
            }
            : null,
          selectedVendorId,
          vendorQuotes,
          isSplitApproved: request.isSplitApproved ?? (costComparison?.managerNotes?.includes("Split Fulfillment Approved") || false),
          notesCount: notesCounts.get(request.requestNumber) || 0,
        };
      })
    );

    return requestsWithDetails;
  },
});

/**
 * Get all requests by request number (for drafts with multiple items)
 */
export const getRequestsByRequestNumber = query({
  args: { requestNumber: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return [];

    const requests = await ctx.db
      .query("requests")
      .withIndex("by_request_number", (q) => q.eq("requestNumber", args.requestNumber))
      .collect();

    // Check permissions: Site engineers can only view their own requests
    if (
      currentUser.role === "site_engineer" &&
      requests.length > 0 &&
      requests[0].createdBy !== currentUser._id
    ) {
      return [];
    }

    // Sort by itemOrder (1, 2, 3...) or createdAt as fallback
    requests.sort((a, b) => {
      const orderA = a.itemOrder ?? a.createdAt;
      const orderB = b.itemOrder ?? b.createdAt;
      return orderA - orderB;
    });

    // Fetch related data
    const requestsWithDetails = await Promise.all(
      requests.map(async (request) => {
        const site = await ctx.db.get(request.siteId);

        // Fetch cost comparison to check for split approval and vendor quotes
        const costComparison = await ctx.db
          .query("costComparisons")
          .withIndex("by_request_id", (q) => q.eq("requestId", request._id))
          .first();

        const project = request.projectId
          ? await ctx.db.get(request.projectId)
          : null;

        return {
          ...request,
          project: project
            ? {
              _id: project._id,
              name: project.name,
              location: (project as any).location,
            }
            : null,
          site: site
            ? {
              _id: site._id,
              name: site.name,
              code: site.code,
              address: site.address,
            }
            : null,
          vendorQuotes: costComparison?.vendorQuotes || [],
          selectedVendorId: costComparison?.selectedVendorId || null,
          isSplitApproved: request.isSplitApproved ?? (costComparison?.managerNotes?.includes("Split Fulfillment Approved") || false),
        };
      })
    );

    return requestsWithDetails;
  },
});

/**
 * Get single request by ID
 */
export const getRequestById = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return null;

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      return null;
    }

    // Check permissions: Site engineers can only view their own requests
    // Managers can view all requests
    if (
      currentUser.role === "site_engineer" &&
      request.createdBy !== currentUser._id
    ) {
      return null;
    }

    // Fetch related data
    const site = await ctx.db.get(request.siteId);
    const creator = await ctx.db.get(request.createdBy);
    const approver = request.approvedBy
      ? await ctx.db.get(request.approvedBy)
      : null;
    const project = request.projectId
      ? await ctx.db.get(request.projectId)
      : null;

    return {
      ...request,
      project: project
        ? {
          _id: project._id,
          name: project.name,
          location: (project as any).location,
        }
        : null,
      site: site
        ? {
          _id: site._id,
          name: site.name,
          code: site.code,
          address: site.address,
        }
        : null,
      creator: creator
        ? {
          _id: creator._id,
          fullName: creator.fullName,
          profileImage: creator.profileImage,
        }
        : null,
      approver: approver
        ? {
          _id: approver._id,
          fullName: approver.fullName,
          profileImage: approver.profileImage,
        }
        : null,
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new material request (Site Engineer only)
 */
export const createMaterialRequest = mutation({
  args: {
    siteId: v.id("sites"),
    itemName: v.string(),
    description: v.string(),
    specsBrand: v.optional(v.string()),
    quantity: v.number(),
    unit: v.string(),
    requiredBy: v.number(),
    isUrgent: v.boolean(),
    photos: v.optional(
      v.array(
        v.object({
          imageUrl: v.string(),
          imageKey: v.string(),
        })
      )
    ),
    notes: v.optional(v.string()),
    requestNumber: v.optional(v.string()), // Optional: if provided, use this request number
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only site engineers can create requests
    if (currentUser.role !== "site_engineer") {
      throw new ConvexError("Unauthorized: Only site engineers can create requests");
    }

    // Verify site exists and is assigned to user
    const site = await ctx.db.get(args.siteId);
    if (!site || !site.isActive) {
      throw new ConvexError("Site not found or inactive");
    }

    if (
      !currentUser.assignedSites ||
      !currentUser.assignedSites.includes(args.siteId)
    ) {
      throw new ConvexError("Unauthorized: Site not assigned to you");
    }

    // Use provided request number or generate a new one
    let requestNumber: string;
    if (args.requestNumber) {
      requestNumber = args.requestNumber;
    } else {
      // Generate unique sequential request number (001, 002, 003, etc.)
      const allRequests = await ctx.db.query("requests").collect();

      // Find the highest existing request number (if in numeric format)
      let maxNumber = 0;
      for (const request of allRequests) {
        // Try to parse as a 3-digit number (001, 002, etc.)
        const numMatch = request.requestNumber.match(/^(\d{3})$/);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      }

      // Generate next sequential number with leading zeros
      const nextNumber = maxNumber + 1;
      requestNumber = nextNumber.toString().padStart(3, "0");
    }

    const now = Date.now();

    // Create request
    const requestId = await ctx.db.insert("requests", {
      requestNumber,
      createdBy: currentUser._id,
      siteId: args.siteId,
      itemName: args.itemName,
      description: args.description,
      specsBrand: args.specsBrand,
      quantity: args.quantity,
      unit: args.unit,
      requiredBy: args.requiredBy,
      isUrgent: args.isUrgent,
      photos: args.photos,
      status: "pending",
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    // AUDIT LOG: Request Created
    await ctx.db.insert("request_notes", {
      requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      status: "pending",
      type: "log",
      content: `Request #${requestNumber} submitted${args.isUrgent ? " (Urgent)" : ""}. Item: ${args.itemName}, Qty: ${args.quantity} ${args.unit}.`,
      createdAt: now,
    });

    return { requestId, requestNumber };
  },
});

/**
 * Create multiple material requests with the same request number (Site Engineer only)
 */
export const createMultipleMaterialRequests = mutation({
  args: {
    requiredBy: v.number(),
    items: v.array(
      v.object({
        siteId: v.union(v.id("sites"), v.string()), // Allow empty string for RFQ mode
        itemName: v.string(),
        description: v.string(),
        quantity: v.number(),
        unit: v.string(),
        notes: v.optional(v.string()),
        isUrgent: v.boolean(),
        photos: v.optional(
          v.array(
            v.object({
              imageUrl: v.string(),
              imageKey: v.string(),
            })
          )
        ),
        projectId: v.optional(v.union(v.id("projects"), v.string())),
      })
    ),
    orderNote: v.optional(v.string()),
    isRFQ: v.optional(v.boolean()), // Flag to indicate this is an RFQ
    projectId: v.optional(v.id("projects")), // Optional project association
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Site engineers can create normal requests, purchase officers can create RFQ requests
    if (currentUser.role !== "site_engineer" && !(args.isRFQ && currentUser.role === "purchase_officer")) {
      throw new ConvexError("Unauthorized: Only site engineers can create requests");
    }

    if (args.items.length === 0) {
      throw new ConvexError("At least one item is required");
    }

    // Generate unique sequential request number (001, 002, 003, etc.)
    const allRequests = await ctx.db.query("requests").collect();

    // Find the highest existing request number (if in numeric format)
    let maxNumber = 0;
    for (const request of allRequests) {
      // Try to parse as a 3-digit number (001, 002, etc.)
      const numMatch = request.requestNumber.match(/^(\d{3})$/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    // Generate next sequential number with leading zeros
    const nextNumber = maxNumber + 1;
    const requestNumber = nextNumber.toString().padStart(3, "0");

    const now = Date.now();
    const requestIds: Id<"requests">[] = [];

    // For RFQ mode, get a placeholder site if needed
    let placeholderSite: any = null;
    if (args.isRFQ) {
      placeholderSite = await ctx.db
        .query("sites")
        .withIndex("by_is_active", (q) => q.eq("isActive", true))
        .first();

      if (!placeholderSite) {
        throw new ConvexError("No active site found. Please create a site first.");
      }
    }

    // Create all requests with the same request number
    for (let i = 0; i < args.items.length; i++) {
      const item = args.items[i];

      // Determine which siteId to use
      let effectiveSiteId: Id<"sites">;

      // For RFQ mode, use placeholder site if no site provided
      if (args.isRFQ && (typeof item.siteId === "string" && item.siteId === "")) {
        effectiveSiteId = placeholderSite._id;
      } else if (typeof item.siteId === "string") {
        // This shouldn't happen, but handle it gracefully
        effectiveSiteId = placeholderSite._id;
      } else {
        effectiveSiteId = item.siteId;
      }

      // Verify site exists and is active
      const site = await ctx.db.get(effectiveSiteId);
      if (!site || !site.isActive) {
        throw new ConvexError(`Item ${i + 1}: Site not found or inactive`);
      }

      // Only check site assignment for normal requests, not RFQ
      if (!args.isRFQ) {
        if (
          !currentUser.assignedSites ||
          !currentUser.assignedSites.includes(effectiveSiteId)
        ) {
          throw new ConvexError(`Item ${i + 1}: Site not assigned to you`);
        }
      }

      // Determine which projectId to use
      let effectiveProjectId: Id<"projects"> | undefined = undefined;
      if (item.projectId) {
        const normalized = ctx.db.normalizeId("projects", item.projectId);
        if (normalized) {
          effectiveProjectId = normalized;
        }
      }
      if (!effectiveProjectId && args.projectId) {
        effectiveProjectId = args.projectId;
      }

      const requestId = await ctx.db.insert("requests", {
        requestNumber,
        createdBy: currentUser._id,
        siteId: effectiveSiteId,
        itemName: item.itemName,
        description: item.description,
        specsBrand: undefined,
        quantity: item.quantity,
        unit: item.unit,
        requiredBy: args.requiredBy,
        isUrgent: item.isUrgent,
        photos: item.photos,
        itemOrder: i + 1, // Sequential order: 1, 2, 3...
        status: args.isRFQ ? "ready_for_cc" : "pending", // RFQ goes directly to ready_for_cc
        notes: item.notes,
        isRFQ: args.isRFQ || undefined, // Mark as RFQ if applicable
        projectId: effectiveProjectId, // Associate with project if provided
        createdAt: now,
        updatedAt: now,
      });
      requestIds.push(requestId);
    }

    // Create order note if provided
    if (args.orderNote && args.orderNote.trim().length > 0) {
      await ctx.db.insert("request_notes", {
        requestNumber,
        userId: currentUser._id,
        role: currentUser.role,
        status: args.isRFQ ? "ready_for_cc" : "pending",
        type: "note",
        content: args.orderNote,
        createdAt: now,
      });
    }

    // AUDIT LOG: Request Created
    await ctx.db.insert("request_notes", {
      requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      status: args.isRFQ ? "ready_for_cc" : "pending",
      type: "log",
      content: args.isRFQ
        ? `RFQ #${requestNumber} created with ${args.items.length} item(s). Ready for Cost Comparison.`
        : `Request #${requestNumber} submitted with ${args.items.length} item(s).`,
      createdAt: now,
    });

    return { requestIds, requestNumber };
  },
});

/**
 * Save multiple material requests as draft (Site Engineer only)
 */
export const saveMultipleMaterialRequestsAsDraft = mutation({
  args: {
    requiredBy: v.number(),
    items: v.array(
      v.object({
        siteId: v.id("sites"),
        itemName: v.string(),
        description: v.string(),
        quantity: v.number(),
        unit: v.string(),
        notes: v.optional(v.string()),
        isUrgent: v.boolean(),
        photos: v.optional(
          v.array(
            v.object({
              imageUrl: v.string(),
              imageKey: v.string(),
            })
          )
        ),
        projectId: v.optional(v.union(v.id("projects"), v.string())),
      })
    ),
    orderNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only site engineers can save drafts
    if (currentUser.role !== "site_engineer") {
      throw new ConvexError("Unauthorized: Only site engineers can save drafts");
    }

    if (args.items.length === 0) {
      throw new ConvexError("At least one item is required");
    }

    // Generate temporary draft ID (DRAFT-001, DRAFT-002, etc.)
    // Only count other drafts to generate sequential draft numbers
    const allDrafts = await ctx.db
      .query("requests")
      .withIndex("by_status", (q) => q.eq("status", "draft"))
      .collect();

    let maxDraftNumber = 0;
    for (const draft of allDrafts) {
      const draftMatch = draft.requestNumber.match(/^DRAFT-(\d{3})$/);
      if (draftMatch) {
        const num = parseInt(draftMatch[1], 10);
        if (num > maxDraftNumber) {
          maxDraftNumber = num;
        }
      }
    }

    const nextDraftNumber = maxDraftNumber + 1;
    const requestNumber = `DRAFT-${nextDraftNumber.toString().padStart(3, "0")}`;

    const now = Date.now();
    const requestIds: Id<"requests">[] = [];

    // Create all requests with draft status
    for (let i = 0; i < args.items.length; i++) {
      const item = args.items[i];

      // Verify each item's site exists and is assigned to user
      const site = await ctx.db.get(item.siteId);
      if (!site || !site.isActive) {
        throw new ConvexError(`Item ${i + 1}: Site not found or inactive`);
      }
      if (
        !currentUser.assignedSites ||
        !currentUser.assignedSites.includes(item.siteId)
      ) {
        throw new ConvexError(`Item ${i + 1}: Site not assigned to you`);
      }

      // Determine which projectId to use
      let effectiveProjectId: Id<"projects"> | undefined = undefined;
      if (item.projectId) {
        const normalized = ctx.db.normalizeId("projects", item.projectId);
        if (normalized) {
          effectiveProjectId = normalized;
        }
      }

      const requestId = await ctx.db.insert("requests", {
        requestNumber,
        createdBy: currentUser._id,
        siteId: item.siteId,
        itemName: item.itemName,
        description: item.description,
        specsBrand: undefined,
        quantity: item.quantity,
        unit: item.unit,
        requiredBy: args.requiredBy,
        isUrgent: item.isUrgent,
        photos: item.photos,
        itemOrder: i + 1,
        status: "draft",
        notes: item.notes,
        projectId: effectiveProjectId,
        createdAt: now,
        updatedAt: now,
      });
      requestIds.push(requestId);
    }

    // Create order note if provided
    if (args.orderNote && args.orderNote.trim().length > 0) {
      await ctx.db.insert("request_notes", {
        requestNumber,
        userId: currentUser._id,
        role: currentUser.role,
        status: "draft",
        type: "note",
        content: args.orderNote,
        createdAt: now,
      });
    }

    // AUDIT LOG: Draft Created
    await ctx.db.insert("request_notes", {
      requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      status: "draft",
      type: "log",
      content: `Draft created with ${args.items.length} item(s).`,
      createdAt: now,
    });

    return { requestIds, requestNumber };
  },
});

/**
 * Update request status (approve/reject) - Manager only
 */
export const updateRequestStatus = mutation({
  args: {
    requestId: v.id("requests"),
    status: v.union(
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("direct_po"),
      v.literal("delivery_stage"),
      v.literal("ready_for_po"),
      v.literal("recheck")
    ),
    rejectionReason: v.optional(v.string()),
    directAction: v.optional(v.union(
      v.literal("delivery"),
      v.literal("po"),
      v.literal("all"),
      v.literal("split_po"),
      v.literal("split_delivery"),
      v.literal("split_po_delivery")
    )),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only managers can approve/reject, Purchase Officers can mark direct PO
    if (currentUser.role !== "manager" && !(currentUser.role === "purchase_officer" && args.status === "ready_for_po")) {
      throw new ConvexError("Unauthorized: Only managers (or Purchase Officers for Direct PO) can update request status");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    // Status validation
    if (currentUser.role === "manager") {
      // Manager can update from pending, approved (correction), or recheck (re-evaluation)
      const allowed = ["pending", "approved", "recheck"];
      if (!allowed.includes(request.status)) throw new ConvexError("Request status can only be updated from pending, approved, or recheck");
    } else {
      // Purchase Officer
      const allowed = ["recheck", "ready_for_cc", "cc_pending", "cc_rejected"];
      if (!allowed.includes(request.status)) throw new ConvexError("Purchase Officer can only update from recheck/cc stages");
    }

    const now = Date.now();

    // Determine new status based on action
    let newStatus: string = args.status;
    let directAction = args.directAction;

    if (currentUser.role === "manager") {
      if (args.status === "approved") {
        newStatus = "recheck"; // Normal approval -> Recheck
      } else if (args.status === "direct_po") {
        newStatus = "recheck"; // Goes to Purchaser (Recheck) with PO flag
        directAction = "po";
      } else if (args.status === "delivery_stage") {
        newStatus = "recheck"; // Goes to Purchaser (Recheck) with Delivery flag
        directAction = "delivery";
      } else {
        newStatus = "rejected";
      }
    } else if (args.status === "ready_for_po") {
      // Purchase Officer Direct PO
      newStatus = "ready_for_po";
      if (!directAction) directAction = "po";
    }

    // Update request
    const updates: any = {
      status: newStatus,
      updatedAt: now,
    };

    if (currentUser.role === "manager") {
      updates.approvedBy = currentUser._id;
      updates.approvedAt = now;
      updates.rejectionReason = args.status === "rejected" ? args.rejectionReason : undefined;
    }

    if (directAction) {
      updates.directAction = directAction;
    }

    await ctx.db.patch(args.requestId, updates);

    // Add rejection note to timeline
    if (args.status === "rejected" && args.rejectionReason) {
      // Check if a similar note was just added to avoid duplicates if multiple calls happen quickly
      const recentNotes = await ctx.db
        .query("request_notes")
        .withIndex("by_request_number", (q) => q.eq("requestNumber", request!.requestNumber))
        .order("desc")
        .take(1);

      const content = `[Item #${request?.itemOrder ?? 1}] Rejected: ${args.rejectionReason}`;
      const isDuplicate = recentNotes.length > 0 &&
        recentNotes[0].content === content &&
        (now - recentNotes[0].createdAt) < 5000;

      if (!isDuplicate) {
        await ctx.db.insert("request_notes", {
          requestNumber: request.requestNumber,
          userId: currentUser._id,
          role: currentUser.role,
          status: "rejected",
          type: "log",
          content: content,
          createdAt: now,
        });
      }
    }

    return { success: true };
  },
});

/**
 * Bulk update request status (approve/reject multiple items) - Manager only
 */
export const bulkUpdateRequestStatus = mutation({
  args: {
    requestIds: v.array(v.id("requests")),
    status: v.union(
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("direct_po"),
      v.literal("delivery_stage"),
      v.literal("recheck")
    ),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only managers can approve/reject requests
    if (currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only managers can update request status");
    }

    if (args.requestIds.length === 0) {
      throw new ConvexError("No requests selected");
    }

    const now = Date.now();

    // Determine new status and flags
    let newStatus: string;
    let directAction: "po" | "delivery" | "all" | undefined = undefined;

    if (args.status === "approved") {
      newStatus = "recheck"; // Standard approval flow -> Recheck
    } else if (args.status === "direct_po") {
      newStatus = "recheck";
      directAction = "po";
    } else if (args.status === "delivery_stage") {
      newStatus = "recheck";
      directAction = "delivery";
    } else if (args.status === "recheck") {
      newStatus = "recheck";
      // Do NOT overwrite directAction here. It is handled finely by updateRequestDetails on the frontend before calling this.
    } else {
      newStatus = "rejected";
    }

    const updates: any = {
      status: newStatus,
      approvedBy: currentUser._id,
      approvedAt: now,
      rejectionReason:
        args.status === "rejected" ? args.rejectionReason : undefined,
      updatedAt: now,
    };

    if (directAction) {
      updates.directAction = directAction;
    }

    const processedRequestNumbers = new Set<string>();

    // Process all requests in parallel
    await Promise.all(
      args.requestIds.map(async (requestId) => {
        const request = await ctx.db.get(requestId);
        if (!request) return; // Skip invalid

        await ctx.db.patch(requestId, updates);
        processedRequestNumbers.add(request.requestNumber);

        // AUDIT LOG: Bulk Action (Individual)
        let logContent = "";
        if (args.status === "approved") logContent = `[Item #${request.itemOrder ?? 1}] Bulk Approved by Manager.`;
        else if (args.status === "direct_po") logContent = `[Item #${request.itemOrder ?? 1}] Bulk Marked for Direct PO.`;
        else if (args.status === "delivery_stage") logContent = `[Item #${request.itemOrder ?? 1}] Bulk Marked for Delivery Stage.`;
        else if (args.status === "recheck") logContent = `[Item #${request.itemOrder ?? 1}] Bulk Sent for Recheck.`;

        if (logContent) {
          await ctx.db.insert("request_notes", {
            requestNumber: request.requestNumber,
            userId: currentUser._id,
            role: currentUser.role,
            status: newStatus,
            type: "log",
            content: logContent,
            createdAt: now,
          });
        }
      })
    );

    // Add rejection notes to timeline (grouped by request number)
    if (args.status === "rejected" && args.rejectionReason) {
      for (const requestNumber of processedRequestNumbers) {
        // Check for duplicates
        const recentNotes = await ctx.db
          .query("request_notes")
          .withIndex("by_request_number", (q) => q.eq("requestNumber", requestNumber))
          .order("desc")
          .take(1);

        const content = `Rejected (Bulk): ${args.rejectionReason}`;
        const isDuplicate = recentNotes.length > 0 &&
          recentNotes[0].content === content &&
          (now - recentNotes[0].createdAt) < 5000;

        if (!isDuplicate) {
          await ctx.db.insert("request_notes", {
            requestNumber: requestNumber,
            userId: currentUser._id,
            role: currentUser.role,
            status: "rejected",
            type: "log",
            content: content,
            createdAt: now,
          });
        }
      }
    }

    return { success: true, updatedCount: args.requestIds.length };
  },
});

/**
 * Send draft request (convert to pending with proper request number) - Site Engineer only
 */
export const sendDraftRequest = mutation({
  args: {
    requestNumber: v.string(), // Draft request number (DRAFT-001, etc.)
    orderNote: v.optional(v.string()), // Optional order-level note
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only site engineers can send their own draft requests
    if (currentUser.role !== "site_engineer") {
      throw new ConvexError("Unauthorized: Only site engineers can send draft requests");
    }

    // Get all requests with this draft request number
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_request_number", (q) => q.eq("requestNumber", args.requestNumber))
      .collect();

    if (requests.length === 0) {
      throw new ConvexError("Draft request not found");
    }

    // Check if all requests are in draft status and created by current user
    const allDrafts = requests.every((req) => req.status === "draft" && req.createdBy === currentUser._id);
    if (!allDrafts) {
      throw new ConvexError("All requests must be in draft status and created by you");
    }

    // Generate next sequential request number (only count non-draft requests)
    const allRequests = await ctx.db.query("requests").collect();

    let maxNumber = 0;
    for (const request of allRequests) {
      // Only count non-draft requests (001, 002, etc.)
      const numMatch = request.requestNumber.match(/^(\d{3})$/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    // Generate next sequential number
    const nextNumber = maxNumber + 1;
    const newRequestNumber = nextNumber.toString().padStart(3, "0");

    const now = Date.now();

    // Update all requests to pending with new request number
    for (const request of requests) {
      await ctx.db.patch(request._id, {
        requestNumber: newRequestNumber,
        status: "pending",
        updatedAt: now,
      });
    }

    // Migrate existing notes from draft to new request number
    const draftNotes = await ctx.db
      .query("request_notes")
      .withIndex("by_request_number", (q) => q.eq("requestNumber", args.requestNumber))
      .collect();

    for (const note of draftNotes) {
      await ctx.db.insert("request_notes", {
        requestNumber: newRequestNumber,
        userId: note.userId,
        role: note.role,
        status: note.status,
        type: note.type, // Preserve the original type ("note" or "log")
        content: note.content,
        createdAt: note.createdAt,
      });

      // Delete the old note to prevent it from showing up in future drafts if draft ID is reused
      await ctx.db.delete(note._id);
    }

    // Create order note if provided and not a duplicate of the latest draft note
    // Sort draft notes to find the latest one (descending by createdAt)
    const latestDraftNote = draftNotes.sort((a, b) => b.createdAt - a.createdAt)[0];
    const isDuplicate = latestDraftNote && args.orderNote && latestDraftNote.content === args.orderNote;

    if (args.orderNote && args.orderNote.trim().length > 0 && !isDuplicate) {
      await ctx.db.insert("request_notes", {
        requestNumber: newRequestNumber,
        userId: currentUser._id,
        role: currentUser.role,
        status: "pending",
        type: "note",
        content: args.orderNote,
        createdAt: now,
      });
    }

    // AUDIT LOG: Request Sent
    await ctx.db.insert("request_notes", {
      requestNumber: newRequestNumber, // Log against the NEW number
      userId: currentUser._id,
      role: currentUser.role,
      status: "pending",
      type: "log",
      content: `Request submitted (converted from Draft ${args.requestNumber} to Pending).`,
      createdAt: now,
    });

    return { success: true, requestNumber: newRequestNumber };
  },
});

/**
 * Delete draft request - Site Engineer only (can delete their own drafts)
 */
export const deleteDraftRequest = mutation({
  args: {
    requestNumber: v.string(), // Draft request number
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only site engineers can delete their own drafts
    if (currentUser.role !== "site_engineer") {
      throw new ConvexError("Unauthorized: Only site engineers can delete their own drafts");
    }

    // Get all requests with this request number
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_request_number", (q) => q.eq("requestNumber", args.requestNumber))
      .collect();

    if (requests.length === 0) {
      throw new ConvexError("Draft request not found");
    }

    // Check if all requests are in draft status and created by current user
    const allDrafts = requests.every((req) => req.status === "draft" && req.createdBy === currentUser._id);
    if (!allDrafts) {
      throw new ConvexError("Unauthorized: You can only delete your own drafts");
    }

    // Delete all linked request_notes to prevent history pollution when ID is reused
    const draftNotes = await ctx.db
      .query("request_notes")
      .withIndex("by_request_number", (q) => q.eq("requestNumber", args.requestNumber))
      .collect();

    for (const note of draftNotes) {
      await ctx.db.delete(note._id);
    }

    // Delete all requests
    for (const request of requests) {
      await ctx.db.delete(request._id);
    }

    return { success: true };
  },
});

/**
 * Update draft request - Site Engineer only (can edit their own drafts)
 */
export const updateDraftRequest = mutation({
  args: {
    requestNumber: v.string(),
    requiredBy: v.number(),
    items: v.array(
      v.object({
        siteId: v.id("sites"),
        itemName: v.string(),
        description: v.string(),
        quantity: v.number(),
        unit: v.string(),
        notes: v.optional(v.string()),
        isUrgent: v.boolean(),
        photos: v.optional(
          v.array(
            v.object({
              imageUrl: v.string(),
              imageKey: v.string(),
            })
          )
        ),
        projectId: v.optional(v.union(v.id("projects"), v.string())),
      })
    ),
    orderNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only site engineers can update their own drafts
    if (currentUser.role !== "site_engineer") {
      throw new ConvexError("Unauthorized: Only site engineers can update drafts");
    }

    // Get existing draft requests
    const existingRequests = await ctx.db
      .query("requests")
      .withIndex("by_request_number", (q) => q.eq("requestNumber", args.requestNumber))
      .collect();

    if (existingRequests.length === 0) {
      throw new ConvexError("Draft request not found");
    }

    // Check if all are drafts created by current user
    const allDrafts = existingRequests.every((req) => req.status === "draft" && req.createdBy === currentUser._id);
    if (!allDrafts) {
      throw new ConvexError("Unauthorized: You can only update your own drafts");
    }

    if (args.items.length === 0) {
      throw new ConvexError("At least one item is required");
    }

    const now = Date.now();

    // Delete old requests
    for (const request of existingRequests) {
      await ctx.db.delete(request._id);
    }

    const requestIds: Id<"requests">[] = [];
    for (let i = 0; i < args.items.length; i++) {
      const item = args.items[i];

      // Verify each item's site exists and is assigned to user
      const site = await ctx.db.get(item.siteId);
      if (!site || !site.isActive) {
        throw new ConvexError(`Item ${i + 1}: Site not found or inactive`);
      }
      if (
        !currentUser.assignedSites ||
        !currentUser.assignedSites.includes(item.siteId)
      ) {
        throw new ConvexError(`Item ${i + 1}: Site not assigned to you`);
      }

      // Determine which projectId to use
      let effectiveProjectId: Id<"projects"> | undefined = undefined;
      if (item.projectId) {
        const normalized = ctx.db.normalizeId("projects", item.projectId);
        if (normalized) {
          effectiveProjectId = normalized;
        }
      }

      const requestId = await ctx.db.insert("requests", {
        requestNumber: args.requestNumber,
        createdBy: currentUser._id,
        siteId: item.siteId,
        itemName: item.itemName,
        description: item.description,
        specsBrand: undefined,
        quantity: item.quantity,
        unit: item.unit,
        requiredBy: args.requiredBy,
        isUrgent: item.isUrgent,
        photos: item.photos,
        itemOrder: i + 1,
        status: "draft",
        notes: item.notes,
        projectId: effectiveProjectId,
        createdAt: existingRequests[0].createdAt,
        updatedAt: now,
      });
      requestIds.push(requestId);
    }

    // Create order note if provided
    if (args.orderNote && args.orderNote.trim().length > 0) {
      // Check for duplicate of latest note to prevent spamming history
      const existingNotes = await ctx.db
        .query("request_notes")
        .withIndex("by_request_number", (q) => q.eq("requestNumber", args.requestNumber))
        .collect();

      const latestNote = existingNotes.sort((a, b) => b.createdAt - a.createdAt)[0];

      if (!latestNote || latestNote.content !== args.orderNote) {
        await ctx.db.insert("request_notes", {
          requestNumber: args.requestNumber,
          userId: currentUser._id,
          role: currentUser.role,
          status: "draft",
          type: "note",
          content: args.orderNote,
          createdAt: now,
        });
      }
    }

    return { requestIds, requestNumber: args.requestNumber };
  },
});

/**
 * Mark request as delivered - Site Engineer only
 */
export const markDelivery = mutation({
  args: {
    requestId: v.id("requests"),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only site engineers can mark delivery
    if (currentUser.role !== "site_engineer") {
      throw new ConvexError("Unauthorized: Only site engineers can mark delivery");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    // Check if user created this request
    if (request.createdBy !== currentUser._id) {
      throw new ConvexError("Unauthorized: You can only mark your own requests as delivered");
    }

    // Only requests in delivery_stage can be marked as delivered
    if (request.status !== "delivery_stage") {
      throw new ConvexError("Only requests in delivery stage can be marked as delivered");
    }

    const now = Date.now();

    // Auto-update inventory if item exists
    const allInventoryItems = await ctx.db
      .query("inventory")
      .withIndex("by_is_active", (q) => q.eq("isActive", true))
      .collect();

    const inventoryItem = allInventoryItems.find(
      (item) => item.itemName.toLowerCase() === request.itemName.toLowerCase()
    );

    if (inventoryItem) {
      // Update inventory stock
      const currentStock = inventoryItem.centralStock || 0;
      await ctx.db.patch(inventoryItem._id, {
        centralStock: currentStock + request.quantity,
        updatedAt: now,
      });
    } else {
      // Create new inventory item if it doesn't exist
      await ctx.db.insert("inventory", {
        itemName: request.itemName,
        unit: request.unit,
        centralStock: request.quantity,
        isActive: true,
        createdBy: currentUser._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Update request
    await ctx.db.patch(args.requestId, {
      status: "delivered",
      deliveryMarkedAt: now,
      updatedAt: now,
    });

    // GRN Log
    await ctx.db.insert("request_notes", {
      requestNumber: request.requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      status: "delivered",
      type: "log",
      content: `[Item #${request.itemOrder ?? 1}] Delivery confirmed by Site Engineer. ${inventoryItem ? `Inventory stock updated for ${request.itemName} (+${request.quantity} ${request.unit || 'units'})` : `New inventory item created: ${request.itemName}`}`,
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Update request status for purchase workflow - Purchase Officer only
 */
/**
 * Direct to PO (skip cost comparison) - Purchase Officer only
 * Used when item is available in inventory and direct delivery is possible
 */
export const directToPO = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only purchase officers can use direct to PO
    if (currentUser.role !== "purchase_officer") {
      throw new ConvexError("Unauthorized: Only purchase officers can use direct to PO");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    // Only allow for approved requests that are ready for CC or recheck
    if (request.status !== "approved" && request.status !== "ready_for_cc" && request.status !== "recheck") {
      throw new ConvexError("Can only use direct to PO for approved requests ready for cost comparison or recheck");
    }

    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      status: "ready_for_po",
      updatedAt: now,
    });

    // GRN Log
    await ctx.db.insert("request_notes", {
      requestNumber: request.requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      status: "ready_for_po",
      type: "log",
      content: `[Item #${request.itemOrder ?? 1}] Direct to PO: Skipped cost comparison. Item moved to Ready for PO.`,
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Update request details (quantity, description) - Purchase Officer only
 * Used during cost comparison to adjust item details
 */
export const updateRequestDetails = mutation({
  args: {
    requestId: v.id("requests"),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    description: v.optional(v.string()),
    itemName: v.optional(v.string()),
    specsBrand: v.optional(v.string()),
    isSplitApproved: v.optional(v.boolean()),
    directAction: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Allow purchase officers and managers
    if (currentUser.role !== "purchase_officer" && currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only purchase officers and managers can update request details");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    // Status checks
    // Managers can update pending items during approval process
    const isManagerAction = currentUser.role === "manager";
    const allowedStatuses = ["approved", "ready_for_cc", "cc_pending", "recheck"];
    if (isManagerAction) {
      allowedStatuses.push("pending", "sign_pending");
    }

    if (!allowedStatuses.includes(request.status)) {
      // If manager, just warn or allow? It's better to allow essential updates.
      // But let's stick to extending the list for now.
      if (!isManagerAction) {
        throw new ConvexError("Can only update details for approved requests in cost comparison process");
      }
    }

    const updates: any = {
      updatedAt: Date.now(),
    };

    if (args.quantity !== undefined) updates.quantity = args.quantity;
    if (args.unit !== undefined) updates.unit = args.unit;
    if (args.description !== undefined) updates.description = args.description;
    if (args.itemName !== undefined) updates.itemName = args.itemName;
    if (args.specsBrand !== undefined) updates.specsBrand = args.specsBrand;
    if (args.isSplitApproved !== undefined) updates.isSplitApproved = args.isSplitApproved;
    if (args.directAction !== undefined) updates.directAction = args.directAction;

    await ctx.db.patch(args.requestId, updates);



    // AUDIT LOG: Details Updated matches...
    const changes = [];
    if (args.quantity !== undefined && args.quantity !== request.quantity) changes.push(`Quantity: ${request.quantity} -> ${args.quantity}`);
    if (args.unit !== undefined && args.unit !== request.unit) changes.push(`Unit: ${request.unit} -> ${args.unit}`);
    if (args.itemName !== undefined && args.itemName !== request.itemName) changes.push(`Item Name: ${request.itemName} -> ${args.itemName}`);
    if (args.description !== undefined && args.description !== request.description) changes.push(`Description updated`);
    if (args.isSplitApproved !== undefined) changes.push(`Split Approval: ${args.isSplitApproved ? 'Approved' : 'Revoked'}`);
    if (args.directAction !== undefined) changes.push(`Action Trigger: ${args.directAction}`);

    if (changes.length > 0) {
      await ctx.db.insert("request_notes", {
        requestNumber: request.requestNumber,
        userId: currentUser._id,
        role: currentUser.role,
        status: request.status,
        type: "log",
        content: `[Item #${request.itemOrder ?? 1}] Request details updated: ${changes.join(", ")}`,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

export const updateLastTalkDate = mutation({
  args: {
    requestId: v.id("requests"),
    lastTalkDate: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) throw new ConvexError("User not found");

    if (currentUser.role !== "purchase_officer" && currentUser.role !== "manager") {
      throw new ConvexError("Only Purchase Officer or Manager can update last talk date");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    await ctx.db.patch(args.requestId, {
      lastTalkDate: args.lastTalkDate !== null ? args.lastTalkDate : undefined,
    });
  },
});

export const updateLastTalkText = mutation({
  args: {
    requestId: v.id("requests"),
    lastTalkText: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) throw new ConvexError("User not found");

    if (currentUser.role !== "purchase_officer" && currentUser.role !== "manager") {
      throw new ConvexError("Only Purchase Officer or Manager can update last talk text");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    await ctx.db.patch(args.requestId, {
      lastTalkText: args.lastTalkText,
    });

    if (args.lastTalkText.trim().length > 0) {
      await ctx.db.insert("request_notes", {
        requestNumber: request.requestNumber,
        userId: currentUser._id,
        role: currentUser.role,
        content: args.lastTalkText,
        type: "followup",
        createdAt: Date.now(),
      });
    }
  },
});

export const updateCommittedDate = mutation({
  args: {
    requestId: v.id("requests"),
    committedDate: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) throw new ConvexError("User not found");

    if (currentUser.role !== "purchase_officer" && currentUser.role !== "manager") {
      throw new ConvexError("Only Purchase Officer or Manager can update committed date");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found");

    await ctx.db.patch(args.requestId, {
      committedDate: args.committedDate,
    });
  },
});

export const updatePurchaseRequestStatus = mutation({
  args: {
    requestId: v.id("requests"),
    status: v.union(
      v.literal("recheck"),
      v.literal("ready_for_cc"),
      v.literal("cc_pending"),
      v.literal("cc_approved"),
      v.literal("cc_rejected"),
      v.literal("ready_for_po"),
      v.literal("pending_po"),
      v.literal("rejected_po"),
      v.literal("ready_for_delivery"),
      v.literal("delivered")
    ),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only purchase officers can update purchase request status
    if (currentUser.role !== "purchase_officer") {
      throw new ConvexError("Unauthorized: Only purchase officers can update purchase request status");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    // Validate status transitions
    // Allow pending_po, recheck, ready_for_cc etc.
    const validTransitions: Record<string, string[]> = {
      recheck: ["ready_for_cc", "rejected", "ready_for_po", "ready_for_delivery", "delivery_stage", "rejected_po"],
      ready_for_cc: ["cc_pending", "cc_rejected", "ready_for_po", "delivery_stage", "ready_for_delivery", "rejected_po"],
      cc_pending: ["cc_approved", "cc_rejected", "ready_for_cc", "rejected_po"],
      cc_approved: ["ready_for_po", "rejected_po"],
      cc_rejected: ["ready_for_cc", "rejected_po"],
      ready_for_po: ["pending_po", "delivery_stage", "ready_for_delivery", "rejected_po"],
      pending_po: ["ready_for_delivery", "rejected_po"],
      rejected_po: ["ready_for_po"],
      ready_for_delivery: ["delivered", "rejected_po"],
      delivery_stage: ["delivered", "ready_for_delivery", "rejected_po"],
    };

    const currentStatus = request.status;
    const allowedStatuses = validTransitions[currentStatus] || [];

    if (!allowedStatuses.includes(args.status) && args.status !== currentStatus) {
      throw new ConvexError(`Invalid status transition from ${currentStatus} to ${args.status}`);
    }

    const now = Date.now();

    await ctx.db.patch(args.requestId, {
      status: args.status,
      updatedAt: now,
    });

    // GRN Log
    const statusLabels: Record<string, string> = {
      ready_for_cc: "Ready for Cost Comparison",
      cc_pending: "CC Submitted for Review",
      cc_approved: "CC Approved",
      cc_rejected: "CC Rejected",
      ready_for_po: "Ready for Purchase Order",
      pending_po: "PO Ordered",
      rejected_po: "PO Rejected",
      ready_for_delivery: "Ready for Delivery",
      delivered: "Delivered",
      recheck: "Sent for Recheck",
    };
    await ctx.db.insert("request_notes", {
      requestNumber: request.requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      status: args.status,
      type: "log",
      content: `[Item #${request.itemOrder ?? 1}] Status changed to ${statusLabels[args.status] || args.status}`,
      createdAt: now,
    });

    return { success: true };
  },
});


/**
 * Split request and deliver inventory portion
 * Creates a new request for the inventory portion and updates original request
 */
export const splitAndDeliverInventory = mutation({
  args: {
    requestId: v.id("requests"),
    inventoryQuantity: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (currentUser.role !== "purchase_officer") {
      throw new ConvexError("Unauthorized");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found");

    if (args.inventoryQuantity <= 0 || args.inventoryQuantity >= request.quantity) {
      throw new ConvexError("Invalid split quantity");
    }

    const inventoryItem = await ctx.db
      .query("inventory")
      .filter((q) => q.eq(q.field("itemName"), request.itemName))
      .first();

    if (!inventoryItem || (inventoryItem.centralStock || 0) < args.inventoryQuantity) {
      throw new ConvexError("Insufficient inventory");
    }

    const now = Date.now();

    // 1. Deduct inventory
    await ctx.db.patch(inventoryItem._id, {
      centralStock: (inventoryItem.centralStock || 0) - args.inventoryQuantity,
      updatedAt: now,
    });

    // 2. Create new request for delivery portion
    const { _id, _creationTime, ...requestData } = request;
    const deliveryRequestId = await ctx.db.insert("requests", {
      ...requestData,
      quantity: args.inventoryQuantity,
      status: "ready_for_delivery",
      directAction: "delivery",
      createdAt: now,
      updatedAt: now,
    });

    // 3. Update original request (remaining quantity)
    const remainingQty = request.quantity - args.inventoryQuantity;
    await ctx.db.patch(request._id, {
      quantity: remainingQty,
      updatedAt: now,
    });

    // GRN Log
    await ctx.db.insert("request_notes", {
      requestNumber: request.requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      status: "ready_for_delivery",
      type: "log",
      content: `[Item #${request.itemOrder ?? 1}] Split & Deliver: ${args.inventoryQuantity} ${request.unit || 'units'} from inventory (stock deducted), ${remainingQty} ${request.unit || 'units'} remaining for purchase.`,
      createdAt: now,
    });

    return { deliveryRequestId };
  },
});

/**
 * Mark request as ready for delivery (supports partial split)
 */
export const markReadyForDelivery = mutation({
  args: {
    requestId: v.id("requests"),
    deliveryQuantity: v.number(),
    targetStatus: v.optional(v.union(v.literal("ready_for_delivery"), v.literal("delivered"))),
    invoiceNo: v.optional(v.string()),
    invoicePhoto: v.optional(v.object({
      imageUrl: v.string(),
      imageKey: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (currentUser.role !== "purchase_officer") {
      throw new ConvexError("Unauthorized");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found");

    if (args.deliveryQuantity <= 0) {
      throw new ConvexError("Quantity must be greater than 0");
    }

    if (args.deliveryQuantity > request.quantity) {
      throw new ConvexError("Delivery quantity cannot exceed request quantity");
    }

    const now = Date.now();
    const remainingQuantity = request.quantity - args.deliveryQuantity;
    const isSplit = remainingQuantity > 0;
    const targetStatus = args.targetStatus || "ready_for_delivery";

    // Find linked PO (if any) to split/update
    const pos = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_request_id", (q) => q.eq("requestId", request._id))
      .collect();

    // Use the latest PO (assuming 1-1 relationship mostly, or latest is relevant)
    const po = pos.length > 0 ? pos[pos.length - 1] : null;

    if (isSplit) {
      // PARTIAL DELIVERY: SPLIT LOGIC

      // 1. Create NEW Request for the Delivery Portion
      const { _id, _creationTime, ...requestData } = request;
      const newRequestId = await ctx.db.insert("requests", {
        ...requestData,
        quantity: args.deliveryQuantity,
        status: targetStatus, // Moved to delivery or delivered
        updatedAt: now,
        createdAt: now,
      });

      // 2. Update ORIGINAL Request (Remaining Quantity stays in current status)
      await ctx.db.patch(request._id, {
        quantity: remainingQuantity,
        updatedAt: now,
      });

      // 3. Handle PO Split if exists
      if (po) {
        // Calculate proportional amounts
        const totalQty = request.quantity; // original total
        const deliveryRatio = args.deliveryQuantity / totalQty;
        const remainingRatio = remainingQuantity / totalQty;

        const originalTotalAmount = po.totalAmount;
        const newDeliveryTotalAmount = originalTotalAmount * deliveryRatio;
        const newRemainingTotalAmount = originalTotalAmount * remainingRatio;

        // Create new PO for delivery part (linked to the new delivery request)
        const { _id: poId, _creationTime: poCreation, ...poData } = po;

        await ctx.db.insert("purchaseOrders", {
          ...poData,
          requestId: newRequestId, // Link to new request
          quantity: args.deliveryQuantity,
          totalAmount: newDeliveryTotalAmount,
          status: targetStatus === "delivered" ? "delivered" : "ordered",
          updatedAt: now,
          createdAt: now,
        });

        // Update original PO with remaining quantity (this is allowed for splits)
        await ctx.db.patch(po._id, {
          quantity: remainingQuantity,
          totalAmount: newRemainingTotalAmount,
          updatedAt: now,
        });
      }

    } else {
      // FULL DELIVERY: SIMPLE STATUS UPDATE
      await ctx.db.patch(request._id, {
        status: targetStatus,
        updatedAt: now,
      });
      // also update PO status to delivered if needed
      if (po && targetStatus === "delivered") {
        await ctx.db.patch(po._id, {
          status: "delivered",
          updatedAt: now,
        });
      }
    }

    // GRN Log
    await ctx.db.insert("request_notes", {
      requestNumber: request.requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      status: targetStatus,
      type: "log",
      content: isSplit
        ? `[Item #${request.itemOrder ?? 1}] Partial delivery: ${args.deliveryQuantity} ${request.unit || 'units'} marked ${targetStatus === 'delivered' ? 'directly delivered' : 'ready for delivery'}. ${remainingQuantity} ${request.unit || 'units'} remaining on PO.`
        : `[Item #${request.itemOrder ?? 1}] Full quantity (${args.deliveryQuantity} ${request.unit || 'units'}) marked ${targetStatus === 'delivered' ? 'directly delivered' : 'ready for delivery'}.`,
      createdAt: now,
    });

    // Create GRN if we have a linked PO
    if (po) {
      const allGRNs = await ctx.db.query("grns").collect();
      let maxNumber = 0;
      for (const grn of allGRNs) {
        const numMatch = grn.grnNumber.match(/(\d+)$/);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }
      const grnNumber = `GRN-${(maxNumber + 1).toString().padStart(4, "0")}`;

      await ctx.db.insert("grns", {
        grnNumber,
        poId: po._id, // use the original PO id since it represents the same order
        receivedQuantity: args.deliveryQuantity,
        invoiceNo: args.invoiceNo,
        siteId: request.siteId,
        invoicePhoto: args.invoicePhoto,
        status: "completed",
        createdBy: currentUser._id,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("request_notes", {
        requestNumber: request.requestNumber,
        userId: currentUser._id,
        role: currentUser.role,
        type: "log",
        content: `Created GRN ${grnNumber} for ${args.deliveryQuantity} unit(s)`,
        status: targetStatus,
        createdAt: now,
      });
    }
  },
});

/**
 * Split Pending PO quantity when vendor can't supply full amount
 * Reduces the PO quantity and creates a new request for the remainder
 */
export const splitPendingPOQuantity = mutation({
  args: {
    requestId: v.id("requests"),
    newQuantity: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only purchase officers and managers can split PO quantities
    if (currentUser.role !== "purchase_officer" && currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only purchase officers and managers can split PO quantities");
    }

    // Get the original request
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    // Validate status - must be pending_po
    if (request.status !== "pending_po") {
      throw new ConvexError("Can only split Pending PO requests");
    }

    // Validate new quantity
    if (args.newQuantity <= 0) {
      throw new ConvexError("New quantity must be greater than 0");
    }

    if (args.newQuantity >= request.quantity) {
      throw new ConvexError("New quantity must be less than original quantity");
    }

    const remainingQuantity = request.quantity - args.newQuantity;
    const now = Date.now();

    // Find the associated PO
    const pos = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .collect();

    const po = pos.find(p => p.status === "ordered");

    if (!po) {
      throw new ConvexError("No active PO found for this request");
    }

    // Calculate new amounts based on unit price
    const unitPrice = po.totalAmount / request.quantity;
    const newTotalAmount = args.newQuantity * unitPrice;
    const remainingTotalAmount = remainingQuantity * unitPrice;

    // Update original request with reduced quantity
    await ctx.db.patch(args.requestId, {
      quantity: args.newQuantity,
      updatedAt: now,
    });

    // Update PO with reduced quantity and amount
    await ctx.db.patch(po._id, {
      quantity: args.newQuantity,
      totalAmount: newTotalAmount,
      updatedAt: now,
    });

    // Create new request for remaining quantity (back to ready_for_cc)
    const newRequestId = await ctx.db.insert("requests", {
      requestNumber: request.requestNumber,
      createdBy: request.createdBy,
      siteId: request.siteId,
      itemName: request.itemName,
      description: request.description,
      specsBrand: request.specsBrand,
      quantity: remainingQuantity,
      unit: request.unit,
      requiredBy: request.requiredBy,
      isUrgent: request.isUrgent,
      photos: request.photos,
      status: "ready_for_cc", // Back to ready for cost comparison
      createdAt: now,
      updatedAt: now,
    });

    // Add timeline note
    await ctx.db.insert("request_notes", {
      requestNumber: request.requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      status: "pending_po",
      type: "log",
      content: `[Item #${request.itemOrder ?? 1}] Quantity split: ${args.newQuantity} ${request.unit} kept for delivery, ${remainingQuantity} ${request.unit} moved back to Ready for CC (vendor couldn't supply full amount)`,
      createdAt: now,
    });

    return {
      success: true,
      keptRequestId: args.requestId,
      keptQuantity: args.newQuantity,
      newRequestId,
      remainingQuantity,
    };
  },
});

/**
 * Confirm delivery of a request - Site Engineer
 * Marks items as delivered and records proof of delivery
 */
export const confirmDelivery = mutation({
  args: {
    requestId: v.id("requests"),
    notes: v.optional(v.string()),
    photos: v.optional(v.array(v.object({
      imageUrl: v.string(),
      imageKey: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // Only site engineers (or authorized roles) can confirm
    if (currentUser.role !== "site_engineer" && currentUser.role !== "manager" && currentUser.role !== "purchase_officer") {
      throw new ConvexError("Unauthorized to confirm delivery");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    // If already delivered, just return success (idempotent)
    if (request.status === "delivered") {
      return;
    }

    // Allow confirming if status is correct
    // Allow confirming from pending_po, delivery_processing, out_for_delivery, ready_for_delivery, delivery_stage
    const validStatuses = ["pending_po", "out_for_delivery", "delivery_processing", "delivery_stage", "ready_for_delivery"];
    if (!validStatuses.includes(request.status)) {
      throw new ConvexError(`Request is not in a delivery stage: ${request.status}`);
    }

    const now = Date.now();

    // Update Request
    await ctx.db.patch(request._id, {
      status: "delivered",
      deliveryMarkedAt: now,
      deliveryNotes: args.notes,
      deliveryPhotos: args.photos,
      updatedAt: now,
    });

    // Add Note for timeline
    await ctx.db.insert("request_notes", {
      requestNumber: request.requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      status: "delivered",
      type: "log",
      content: `[Item #${request.itemOrder ?? 1}] Request marked as Delivered`,
      createdAt: now,
    });
  },
});

/**
 * Create a lightweight "direct CC" request record (Purchase Officer only)
 * Used when creating a Cost Comparison without a site engineer request.
 * The request is created in "ready_for_cc" status so the CC dialog works normally.
 */
export const createDirectCCRequest = mutation({
  args: {
    itemName: v.string(),
    description: v.string(),
    quantity: v.number(),
    unit: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    if (currentUser.role !== "purchase_officer") {
      throw new ConvexError("Unauthorized: Only purchase officers can create direct CC requests");
    }

    // Find any active site to use as placeholder (required by schema)
    const anySite = await ctx.db
      .query("sites")
      .withIndex("by_is_active", (q) => q.eq("isActive", true))
      .first();

    if (!anySite) {
      throw new ConvexError("No active site found. Please create a site first.");
    }

    const now = Date.now();

    // Generate a unique request number
    const allRequests = await ctx.db.query("requests").collect();
    let maxNumber = 0;
    for (const r of allRequests) {
      const num = parseInt(r.requestNumber, 10);
      if (!isNaN(num) && num > maxNumber) maxNumber = num;
    }
    const requestNumber = String(maxNumber + 1).padStart(3, "0");

    const requestId = await ctx.db.insert("requests", {
      requestNumber,
      createdBy: currentUser._id,
      siteId: anySite._id,
      itemName: args.itemName.trim(),
      description: args.description.trim(),
      quantity: args.quantity,
      unit: args.unit.trim(),
      requiredBy: now + 7 * 24 * 60 * 60 * 1000, // 7 days from now
      isUrgent: false,
      status: "ready_for_cc",
      notes: args.notes?.trim() || undefined,
      itemOrder: 1,
      createdAt: now,
      updatedAt: now,
    });

    // Log the direct action with standardized ID format
    // Generate CC ID based on all existing CCs
    const allCCs = await ctx.db.query("costComparisons").collect();
    const ccCount = allCCs.length + 1; // This will be the next CC number
    const standardizedId = `CC-${ccCount.toString().padStart(3, '0')}`;

    await ctx.db.insert("request_notes", {
      requestNumber: `DIRECT-${standardizedId}`,
      userId: currentUser._id,
      role: currentUser.role,
      status: "ready_for_cc",
      type: "log",
      content: `Direct Cost Comparison request ${standardizedId} created: ${args.itemName} (${args.quantity} ${args.unit})`,
      createdAt: now,
    });

    return requestId;
  },
});

export const closePurchaseRequest = mutation({
  args: {
    requestId: v.id("requests"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (currentUser.role !== "purchase_officer" && currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only purchase officers and managers can close PO requests");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    await ctx.db.patch(args.requestId, {
      status: "rejected_po",
    });

    const noteText = args.notes ? `Closed PO: ${args.notes}` : `PO Closed manually`;

    await ctx.db.insert("request_notes", {
      requestNumber: request.requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      content: noteText,
      type: "log",
      createdAt: Date.now(),
    });

    // Cancel related PO if it exists
    const po = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (po && po.status !== "cancelled" && po.status !== "delivered") {
      await ctx.db.patch(po._id, {
        status: "cancelled",
      });
    }
  },
});

export const reopenPurchaseRequest = mutation({
  args: {
    requestId: v.id("requests"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (currentUser.role !== "purchase_officer" && currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found");
    if (request.status !== "rejected_po") throw new ConvexError("Request is not closed");

    // Reopen to sign_rejected so it goes back to pending signing
    await ctx.db.patch(args.requestId, { status: "sign_rejected" });

    const noteText = args.notes ? `PO Reopened: ${args.notes}` : `PO Reopened manually`;
    await ctx.db.insert("request_notes", {
      requestNumber: request.requestNumber,
      userId: currentUser._id,
      role: currentUser.role,
      content: noteText,
      type: "log",
      createdAt: Date.now(),
    });
  },
});

export const deleteRequestNote = mutation({
  args: {
    noteIds: v.array(v.id("request_notes")),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (currentUser.role !== "manager") {
      throw new ConvexError("Only managers can delete notes");
    }
    for (const id of args.noteIds) {
      await ctx.db.delete(id);
    }
  },
});
