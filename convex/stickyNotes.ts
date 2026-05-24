/**
 * Sticky Notes Functions
 * 
 * Handles all sticky notes operations including CRUD, reminders,
 * and role-based permissions.
 */

import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all sticky notes for the current user
 * - Managers: See all notes (assigned to anyone)
 * - Other users: See only notes assigned to them
 */
export const list = query({
  args: {
    includeCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return [];

    const isManager = currentUser.role === "manager";

    // Get notes based on user role
    let notes;
    if (isManager) {
      // Managers can see all notes (assigned to anyone)
      notes = await ctx.db
        .query("stickyNotes")
        .filter((q) => q.eq(q.field("isDeleted"), false))
        .filter((q) =>
          args.includeCompleted
            ? true
            : q.eq(q.field("isCompleted"), false)
        )
        .order("desc")
        .collect();
    } else {
      // Regular users only see notes assigned to them
      notes = await ctx.db
        .query("stickyNotes")
        .withIndex("by_assigned_to", (q) => q.eq("assignedTo", currentUser._id))
        .filter((q) => q.eq(q.field("isDeleted"), false))
        .filter((q) =>
          args.includeCompleted
            ? true
            : q.eq(q.field("isCompleted"), false)
        )
        .order("desc")
        .collect();
    }

    // Populate creator and assignee info
    const notesWithUsers = await Promise.all(
      notes.map(async (note) => {
        const creator = await ctx.db.get(note.createdBy);
        const assignee = await ctx.db.get(note.assignedTo);
        return {
          ...note,
          creator: creator ? { _id: creator._id, fullName: creator.fullName } : null,
          assignee: assignee ? { _id: assignee._id, fullName: assignee.fullName } : null,
        };
      })
    );

    return notesWithUsers;
  },
});

/**
 * Get pending reminders count for the current user
 */
export const getPendingReminders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return 0;

    const now = Date.now();

    // Get notes with upcoming reminders (not yet triggered, not completed, not deleted)
    const notes = await ctx.db
      .query("stickyNotes")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", currentUser._id))
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .filter((q) => q.eq(q.field("isCompleted"), false))
      .collect();

    // Filter for notes with reminders that haven't been triggered yet
    const pendingReminders = notes.filter((note) => {
      if (!note.reminderAt) return false;
      if (note.reminderTriggered) return false;
      return note.reminderAt <= now; // Reminder is due
    });

    return pendingReminders.length;
  },
});

/**
 * Get notes with due reminders (for scheduled function)
 */
export const getDueReminders = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all notes (we'll filter for ones with reminders)
    const allNotes = await ctx.db
      .query("stickyNotes")
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .filter((q) => q.eq(q.field("isCompleted"), false))
      .collect();

    // Filter for notes with due reminders that haven't been triggered
    const dueReminders = allNotes.filter((note) => {
      if (!note.reminderAt) return false;
      if (note.reminderTriggered) return false;
      return note.reminderAt <= now;
    });

    // Populate user info
    const remindersWithUsers = await Promise.all(
      dueReminders.map(async (note) => {
        const assignee = await ctx.db.get(note.assignedTo);
        const creator = await ctx.db.get(note.createdBy);
        return {
          ...note,
          assignee: assignee ? { _id: assignee._id, fullName: assignee.fullName } : null,
          creator: creator ? { _id: creator._id, fullName: creator.fullName } : null,
        };
      })
    );

    return remindersWithUsers;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new sticky note
 */
export const create = mutation({
  args: {
    assignedTo: v.id("users"),
    title: v.string(),
    content: v.string(),
    color: v.union(
      v.literal("yellow"),
      v.literal("pink"),
      v.literal("blue"),
      v.literal("green"),
      v.literal("purple"),
      v.literal("orange")
    ),
    reminderAt: v.optional(v.number()),
    checklistItems: v.optional(v.array(v.object({
      id: v.string(),
      text: v.string(),
      completed: v.boolean(),
    }))),
    positionX: v.optional(v.number()),
    positionY: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    // Task extensions
    priority: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))),
    dueDate: v.optional(v.number()),
    linkedEntityId: v.optional(v.string()),
    linkedEntityType: v.optional(v.union(v.literal("cc"), v.literal("dc"), v.literal("po"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) throw new ConvexError("User not found");

    // Check permissions: Only managers can create notes for other users
    if (currentUser.role !== "manager" && args.assignedTo !== currentUser._id) {
      throw new ConvexError("Unauthorized: You can only create notes for yourself");
    }

    // Verify assigned user exists
    const assignedUser = await ctx.db.get(args.assignedTo);
    if (!assignedUser) throw new ConvexError("Assigned user not found");

    const now = Date.now();

    // Create note
    const noteId = await ctx.db.insert("stickyNotes", {
      createdBy: currentUser._id,
      assignedTo: args.assignedTo,
      title: args.title,
      content: args.content,
      color: args.color,
      reminderAt: args.reminderAt,
      checklistItems: args.checklistItems,
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      priority: args.priority,
      dueDate: args.dueDate,
      linkedEntityId: args.linkedEntityId,
      linkedEntityType: args.linkedEntityType,
      acceptedStatus: args.assignedTo === currentUser._id ? "seen" : "pending",
      isCompleted: false,
      isDeleted: false,
      reminderTriggered: false,
      isRead: args.assignedTo === currentUser._id, // Mark as read if assigning to self
      createdAt: now,
      updatedAt: now,
    });

    // Send notification if assigned to someone else
    if (args.assignedTo !== currentUser._id) {
      await ctx.db.insert("notifications", {
        userId: args.assignedTo,
        title: "New Task Assigned",
        message: `${currentUser.fullName} assigned you a new task: "${args.title}"`,
        type: "assignment",
        isRead: false,
        link: "/dashboard?tasks=true", // Query param to trigger opening sticky notes
        metadata: {
          entityId: noteId,
          entityType: "task",
        },
        createdAt: now,
      });
    }

    return noteId;
  },
});

/**
 * Update a sticky note
 */
export const update = mutation({
  args: {
    noteId: v.id("stickyNotes"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    color: v.optional(
      v.union(
        v.literal("yellow"),
        v.literal("pink"),
        v.literal("blue"),
        v.literal("green"),
        v.literal("purple"),
        v.literal("orange")
      )
    ),
    reminderAt: v.optional(v.number()),
    checklistItems: v.optional(v.array(v.object({
      id: v.string(),
      text: v.string(),
      completed: v.boolean(),
    }))),
    positionX: v.optional(v.number()),
    positionY: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    // Task extensions
    priority: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))),
    dueDate: v.optional(v.number()),
    assignedTo: v.optional(v.id("users")),
    linkedEntityId: v.optional(v.string()),
    linkedEntityType: v.optional(v.union(v.literal("cc"), v.literal("dc"), v.literal("po"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) throw new ConvexError("User not found");

    // Get note
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new ConvexError("Note not found");

    const isManager = currentUser.role === "manager";
    const isCreator = note.createdBy === currentUser._id;
    const isAssignee = note.assignedTo === currentUser._id;
    const canViewNote = isManager || isAssignee;

    // Check if this is only a position/size update (drag and drop)
    const isOnlyPositionUpdate =
      args.positionX !== undefined ||
      args.positionY !== undefined ||
      args.width !== undefined ||
      args.height !== undefined;

    const hasContentUpdate =
      args.title !== undefined ||
      args.content !== undefined ||
      args.color !== undefined ||
      args.reminderAt !== undefined ||
      args.checklistItems !== undefined ||
      args.priority !== undefined ||
      args.dueDate !== undefined ||
      args.assignedTo !== undefined ||
      args.linkedEntityId !== undefined ||
      args.linkedEntityType !== undefined;

    // For position/size updates: Allow anyone who can view the note
    if (isOnlyPositionUpdate && !hasContentUpdate) {
      if (!canViewNote) {
        throw new ConvexError("Unauthorized: You can only update notes you can view");
      }
    } else {
      // For content updates: Only assignee can update
      if (!isAssignee) {
        throw new ConvexError("Unauthorized: Only the assigned manager can update this note");
      }
    }

    // Update note
    const patchData: any = {
      ...(args.title !== undefined && { title: args.title }),
      ...(args.content !== undefined && { content: args.content }),
      ...(args.color !== undefined && { color: args.color }),
      ...(args.reminderAt !== undefined && {
        reminderAt: args.reminderAt,
        reminderTriggered: false, // Reset reminder trigger when updating reminder time
      }),
      ...(args.checklistItems !== undefined && { checklistItems: args.checklistItems }),
      ...(args.positionX !== undefined && { positionX: args.positionX }),
      ...(args.positionY !== undefined && { positionY: args.positionY }),
      ...(args.width !== undefined && { width: args.width }),
      ...(args.height !== undefined && { height: args.height }),
      ...(args.priority !== undefined && { priority: args.priority }),
      ...(args.dueDate !== undefined && { dueDate: args.dueDate }),
      ...(args.assignedTo !== undefined && { assignedTo: args.assignedTo }),
      ...(args.linkedEntityId !== undefined && { linkedEntityId: args.linkedEntityId }),
      ...(args.linkedEntityType !== undefined && { linkedEntityType: args.linkedEntityType }),
      updatedAt: Date.now(),
    };

    await ctx.db.patch(args.noteId, patchData);

    // Send notification if assigned to someone else
    if (args.assignedTo !== undefined && args.assignedTo !== note.assignedTo && args.assignedTo !== currentUser._id) {
      await ctx.db.insert("notifications", {
        userId: args.assignedTo,
        title: "Task Reassigned",
        message: `${currentUser.fullName} reassigned task: "${args.title || note.title}" to you`,
        type: "assignment",
        isRead: false,
        link: "/dashboard?tasks=true",
        metadata: {
          entityId: args.noteId,
          entityType: "task",
        },
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * Mark a note as completed
 */
export const complete = mutation({
  args: {
    noteId: v.id("stickyNotes"),
    isCompleted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) throw new ConvexError("User not found");

    // Get note
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new ConvexError("Note not found");

    // Check permissions: Assignee, Creator, or Manager can mark as completed
    if (note.assignedTo !== currentUser._id && note.createdBy !== currentUser._id && currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: You do not have permission to complete this task");
    }

    // Update note
    await ctx.db.patch(args.noteId, {
      isCompleted: args.isCompleted,
      completedAt: args.isCompleted ? Date.now() : undefined,
      updatedAt: Date.now(),
    });

    if (args.isCompleted && note.createdBy !== currentUser._id) {
        await ctx.db.insert("notifications", {
            userId: note.createdBy,
            title: "Task Completed",
            message: `${currentUser.fullName} completed task: "${note.title}"`,
            type: "success",
            isRead: false,
            link: "/dashboard?tasks=true",
            metadata: {
                entityId: note._id,
                entityType: "task",
            },
            createdAt: Date.now(),
        });
    }

    return { success: true };
  },
});

/**
 * Delete a sticky note (soft delete)
 */
export const deleteNote = mutation({
  args: {
    noteId: v.id("stickyNotes"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) throw new ConvexError("User not found");

    // Get note
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new ConvexError("Note not found");

    // Check permissions: Only assignee can delete
    if (note.assignedTo !== currentUser._id) {
      throw new ConvexError("Unauthorized: Only the assigned manager can delete this note");
    }

    // Soft delete
    await ctx.db.patch(args.noteId, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Mark reminder as triggered
 */
export const markReminderTriggered = mutation({
  args: {
    noteId: v.id("stickyNotes"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.noteId, {
      reminderTriggered: true,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Get count of unread sticky notes for the current user
 */
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) return 0;

    const notes = await ctx.db
      .query("stickyNotes")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", currentUser._id))
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .filter((q) => q.eq(q.field("isCompleted"), false))
      .filter((q) => q.eq(q.field("isRead"), false))
      .collect();

    return notes.length;
  },
});

/**
 * Mark all notes for the current user as read
 */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) throw new ConvexError("User not found");

    const unreadNotes = await ctx.db
      .query("stickyNotes")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", currentUser._id))
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .filter((q) => q.eq(q.field("isCompleted"), false))
      .filter((q) => q.eq(q.field("isRead"), false))
      .collect();

    await Promise.all(
      unreadNotes.map((note) =>
        ctx.db.patch(note._id, { isRead: true })
      )
    );

    return { success: true };
  },
});

/**
 * Bulk complete tasks
 */
export const bulkComplete = mutation({
  args: {
    noteIds: v.array(v.id("stickyNotes")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser) throw new ConvexError("User not found");

    for (const noteId of args.noteIds) {
      const note = await ctx.db.get(noteId);
      if (!note || note.assignedTo !== currentUser._id) continue;

      await ctx.db.patch(noteId, {
        isCompleted: true,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      // Send notification to creator
      if (note.createdBy !== currentUser._id) {
        await ctx.db.insert("notifications", {
            userId: note.createdBy,
            title: "Task Completed",
            message: `${currentUser.fullName} completed task: "${note.title}"`,
            type: "success",
            isRead: false,
            link: "/dashboard?tasks=true",
            metadata: {
                entityId: note._id,
                entityType: "task",
            },
            createdAt: Date.now(),
        });
      }
    }

    return { success: true };
  },
});

/**
 * Bulk assign tasks
 */
export const bulkAssign = mutation({
  args: {
    noteIds: v.array(v.id("stickyNotes")),
    assignTo: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", userId))
      .first();

    if (!currentUser || currentUser.role !== "manager") throw new ConvexError("Unauthorized");

    for (const noteId of args.noteIds) {
      const note = await ctx.db.get(noteId);
      if (!note) continue;

      await ctx.db.patch(noteId, {
        assignedTo: args.assignTo,
        acceptedStatus: args.assignTo === currentUser._id ? "seen" : "pending",
        updatedAt: Date.now(),
      });
      
      if (args.assignTo !== currentUser._id) {
          await ctx.db.insert("notifications", {
            userId: args.assignTo,
            title: "New Task Assigned",
            message: `${currentUser.fullName} assigned you a new task: "${note.title}"`,
            type: "assignment",
            isRead: false,
            link: "/dashboard?tasks=true",
            metadata: {
              entityId: noteId,
              entityType: "task",
            },
            createdAt: Date.now(),
          });
      }
    }

    return { success: true };
  },
});

/**
 * Get linked tasks
 */
export const getLinkedTasks = query({
  args: {
    linkedEntityType: v.union(v.literal("cc"), v.literal("dc"), v.literal("po")),
    linkedEntityId: v.string(),
  },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("stickyNotes")
      .withIndex("by_linked_entity", (q) => 
        q.eq("linkedEntityType", args.linkedEntityType).eq("linkedEntityId", args.linkedEntityId)
      )
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .order("desc")
      .collect();
      
    // Populate users
    return Promise.all(
      notes.map(async (note) => {
        const creator = await ctx.db.get(note.createdBy);
        const assignee = await ctx.db.get(note.assignedTo);
        return {
          ...note,
          creator: creator ? { _id: creator._id, fullName: creator.fullName } : null,
          assignee: assignee ? { _id: assignee._id, fullName: assignee.fullName } : null,
        };
      })
    );
  },
});
