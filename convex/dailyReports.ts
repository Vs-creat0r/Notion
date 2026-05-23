import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// Helper to get current authenticated user
async function getCurrentUser(ctx: any) {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", userId))
        .first();

    if (!user) throw new ConvexError("User not found");
    return user;
}

/**
 * Get all system activity logs (request_notes of type "log") for a user on a given date.
 * This auto-collects what the user did that day.
 */
export const getDailyActivity = query({
    args: {
        date: v.string(), // "YYYY-MM-DD"
    },
    handler: async (ctx, args) => {
        const user = await getCurrentUser(ctx);

        // Calculate start and end of the given date in IST (UTC+5:30)
        // IST offset is -5.5 hours from UTC, so midnight IST = 18:30 previous day UTC
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5h30m in milliseconds
        const dayStartIST = new Date(args.date + "T00:00:00.000Z").getTime() - IST_OFFSET_MS;
        const dayEndIST = new Date(args.date + "T23:59:59.999Z").getTime() - IST_OFFSET_MS;

        // Get all request_notes of type "log" created by this user on the given date
        const allLogs = await ctx.db
            .query("request_notes")
            .withIndex("by_created_at")
            .filter((q: any) =>
                q.and(
                    q.gte(q.field("createdAt"), dayStartIST),
                    q.lte(q.field("createdAt"), dayEndIST),
                    q.eq(q.field("userId"), user._id),
                    q.eq(q.field("type"), "log")
                )
            )
            .order("asc")
            .take(200);

        return allLogs.map((log: any) => {
            let actionText = log.content;
            
            // Replace "[Item #X]" with the Request ID
            if (log.requestNumber) {
                actionText = actionText.replace(/^\[Item #\d+\]\s*/i, `[${log.requestNumber}] `);
            }
            
            // Clean up to natural language
            actionText = actionText
                .replace(/Partial delivery: (.*?) marked ready for delivery\. (.*?) remaining on PO\./i, "Partially delivered $1. ($2 remaining)")
                .replace(/Partial delivery: (.*?) marked directly delivered\. (.*?) remaining on PO\./i, "Partially delivered directly $1. ($2 remaining)")
                .replace(/Full quantity \((.*?)\) marked ready for delivery\./i, "Fully delivered $1.")
                .replace(/Full quantity \((.*?)\) marked directly delivered\./i, "Fully delivered directly ($1).");

            return {
                _id: log._id,
                time: new Date(log.createdAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                    timeZone: "Asia/Kolkata",
                }).toLowerCase(),
                action: actionText,
                requestNumber: log.requestNumber,
                createdAt: log.createdAt,
            };
        });
    },
});

/**
 * Save a daily report (with auto-collected activities + user notes)
 * and send it as in-app messages to all managers.
 */
export const saveAndSendReport = mutation({
    args: {
        date: v.string(), // "YYYY-MM-DD"
        activities: v.array(v.object({
            time: v.string(),
            action: v.string(),
            entityType: v.optional(v.string()),
            entityId: v.optional(v.string()),
        })),
        additionalNotes: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getCurrentUser(ctx);
        const now = Date.now();

        // Check if report already exists for this user + date
        const existing = await ctx.db
            .query("dailyReports")
            .withIndex("by_user_date", (q: any) =>
                q.eq("userId", user._id).eq("reportDate", args.date)
            )
            .first();

        let reportId;
        if (existing) {
            // Update existing report
            await ctx.db.patch(existing._id, {
                activities: args.activities,
                additionalNotes: args.additionalNotes,
                sentAt: now,
                updatedAt: now,
            });
            reportId = existing._id;
        } else {
            // Create new report
            reportId = await ctx.db.insert("dailyReports", {
                userId: user._id,
                reportDate: args.date,
                activities: args.activities,
                additionalNotes: args.additionalNotes,
                sentAt: now,
                createdAt: now,
                updatedAt: now,
            });
        }

        // Find ALL managers
        const managers = await ctx.db
            .query("users")
            .filter((q: any) =>
                q.and(
                    q.eq(q.field("role"), "manager"),
                    q.eq(q.field("isActive"), true)
                )
            )
            .collect();

        if (managers.length === 0) {
            return { reportId, sentTo: 0 };
        }

        // Build the report message text
        const dateFormatted = new Date(args.date + "T00:00:00").toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });

        let messageContent = `📋 *Daily Report — ${dateFormatted}*\nFrom: ${user.fullName}\n\n`;

        if (args.activities.length > 0) {
            messageContent += `*Activities (${args.activities.length}):*\n\n`;
            messageContent += `| Time | Activity |\n| :--- | :--- |\n`;
            args.activities.forEach((a) => {
                messageContent += `| ${a.time} | ${a.action} |\n`;
            });
        } else {
            messageContent += `No recorded activities for this day.\n`;
        }

        if (args.additionalNotes.trim()) {
            messageContent += `\n*Notes:*\n${args.additionalNotes.trim()}\n`;
        }

        // Send as in-app message to each manager
        const managerIds = [];
        for (const manager of managers) {
            // Get or create conversation with this manager
            const allConversations = await ctx.db.query("conversations").collect();
            let conversation = allConversations.find((conv: any) => {
                if (conv.participants.length !== 2) return false;
                return (
                    (conv.participants[0] === user._id && conv.participants[1] === manager._id) ||
                    (conv.participants[0] === manager._id && conv.participants[1] === user._id)
                );
            });

            let conversationId;
            if (conversation) {
                conversationId = conversation._id;
            } else {
                conversationId = await ctx.db.insert("conversations", {
                    participants: [user._id, manager._id],
                    unreadCount: {},
                    createdAt: now,
                    updatedAt: now,
                });
                const fetchedConv = await ctx.db.get(conversationId);
                conversation = fetchedConv ? fetchedConv : undefined;
            }

            // Send the message
            await ctx.db.insert("messages", {
                conversationId,
                senderId: user._id,
                content: messageContent,
                readBy: [user._id],
                deliveredBy: [user._id],
                createdAt: now,
            });

            // Update conversation
            const currentUnreadCount = (conversation as any)?.unreadCount || {};
            const managerUnread = (currentUnreadCount[manager._id as string] || 0) + 1;

            await ctx.db.patch(conversationId, {
                lastMessageAt: now,
                lastMessage: `📋 Daily Report — ${dateFormatted}`,
                lastMessageSenderId: user._id,
                unreadCount: {
                    ...currentUnreadCount,
                    [user._id as string]: 0,
                    [manager._id as string]: managerUnread,
                },
                updatedAt: now,
            });

            // Send notification
            await ctx.db.insert("notifications", {
                userId: manager._id,
                title: "Daily Report Received",
                message: `${user.fullName} submitted their daily report for ${dateFormatted}`,
                type: "info",
                isRead: false,
                link: `/dashboard?chat=${conversationId}`,
                metadata: {
                    entityId: reportId as string,
                    entityType: "daily_report",
                },
                createdAt: now,
            });

            managerIds.push(manager._id);
        }

        // Update report with manager IDs
        await ctx.db.patch(reportId, {
            sentToManagerIds: managerIds,
        });

        return { reportId, sentTo: managers.length };
    },
});

/**
 * Get report history for the current user (their own past reports).
 */
export const getMyReportHistory = query({
    args: {},
    handler: async (ctx) => {
        const user = await getCurrentUser(ctx);

        const reports = await ctx.db
            .query("dailyReports")
            .withIndex("by_user_id", (q: any) => q.eq("userId", user._id))
            .order("desc")
            .take(50);

        return reports;
    },
});

/**
 * Get all reports for all users (manager view), filterable.
 */
export const getAllReports = query({
    args: {
        userId: v.optional(v.id("users")),
        date: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const currentUser = await getCurrentUser(ctx);

        if (currentUser.role !== "manager") {
            throw new ConvexError("Only managers can view all reports");
        }

        let reports;
        if (args.userId && args.date) {
            reports = await ctx.db
                .query("dailyReports")
                .withIndex("by_user_date", (q: any) =>
                    q.eq("userId", args.userId).eq("reportDate", args.date)
                )
                .collect();
        } else if (args.userId) {
            reports = await ctx.db
                .query("dailyReports")
                .withIndex("by_user_id", (q: any) => q.eq("userId", args.userId))
                .order("desc")
                .take(50);
        } else if (args.date) {
            reports = await ctx.db
                .query("dailyReports")
                .withIndex("by_report_date", (q: any) => q.eq("reportDate", args.date))
                .collect();
        } else {
            reports = await ctx.db
                .query("dailyReports")
                .order("desc")
                .take(100);
        }

        // Enrich with user data
        const enriched = await Promise.all(
            reports.map(async (report: any) => {
                const reportUser = await ctx.db.get(report.userId as Id<"users">);
                return {
                    ...report,
                    user: reportUser
                        ? {
                            _id: reportUser._id,
                            fullName: reportUser.fullName,
                            role: reportUser.role,
                            username: reportUser.username,
                        }
                        : null,
                };
            })
        );

        return enriched;
    },
});
