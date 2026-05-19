/**
 * User Management Functions
 * 
 * Handles CRUD operations for users.
 * Only managers can create, edit, and manage users.
 */

import { v, ConvexError } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// ============================================================================
// Queries
// ============================================================================

/**
 * Get current authenticated user
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    console.log("getCurrentUser: identity =", identity);
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    console.log("getCurrentUser: returning user =", user);
    return user;
  },
});

/**
 * Get user by Clerk user ID
 */
export const getUserByClerkId = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    return user;
  },
});

/**
 * Get user by ID
 */
export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user;
  },
});

/**
 * List all usernames (no auth, for debug/setup only)
 */
export const listAllUsernames = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map(u => ({
      id: u._id,
      username: u.username,
      role: u.role,
      hasPassword: !!u.passwordHash,
      clerkUserId: u.clerkUserId,
      isActive: u.isActive,
    }));
  },
});

/**
 * Get user by username
 */
export const getUserByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    return user;
  },
});

/**
 * Get user by username for login (no auth required)
 * Returns passwordHash for server-side verification
 */
export const getUserByUsernamePublic = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (!user) return null;

    return {
      _id: user._id,
      clerkUserId: user.clerkUserId,
      username: user.username,
      fullName: user.fullName,
      passwordHash: user.passwordHash || null,
      role: user.role,
      isActive: user.isActive,
    };
  },
});

/**
 * Get all active users (Manager only)
 */
export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return []; // Return empty array if not authenticated
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    if (!currentUser) {
      return []; // Return empty array if user not found
    }

    // Check if user is a manager - return empty array for non-managers instead of throwing error
    if (currentUser.role !== "manager") {
      return []; // Non-managers get empty array (they can only assign to themselves anyway)
    }

    // Get all users
    const users = await ctx.db
      .query("users")
      .order("desc")
      .collect();

    return users;
  },
});

/**
 * Get users by role
 */
export const getUsersByRole = query({
  args: { role: v.union(v.literal("site_engineer"), v.literal("manager"), v.literal("purchase_officer")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    const users = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return users;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Auto-sync current user from Clerk to Convex
 * Creates user in Convex if they don't exist
 * Can be called by any authenticated user to sync themselves
 */
export const syncCurrentUser = mutation({
  args: {
    clerkRole: v.optional(v.string()),
    clerkUsername: v.optional(v.string()),
    clerkName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    console.log("Syncing user identity:", JSON.stringify(identity, null, 2));

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    // Get role from Clerk metadata or args
    const metadata = identity.publicMetadata as Record<string, unknown> | undefined;
    let roleStr = args.clerkRole || (metadata?.role as string | undefined);

    // Fallback: If username is 'manager', force role to manager (useful for dev/initial setup)
    // Note: identity.username might be under different fields depending on provider
    const rawUsername = args.clerkUsername || (identity.username || identity.nickname || identity.preferredUsername || identity.name || "") as string;
    const usernameLower = rawUsername.toLowerCase();

    if (!roleStr && (usernameLower === "manager" || usernameLower.includes("manager"))) {
      console.log("Auto-assigning manager role based on username:", rawUsername);
      roleStr = "manager";
    }

    const role = roleStr || "site_engineer";
    const validRole =
      role === "manager" ? "manager" :
        role === "purchase_officer" ? "purchase_officer" :
          "site_engineer";

    const username = rawUsername || `user_${identity.subject.slice(0, 8)}`;
    const name = args.clerkName || (identity.name as string | undefined) || username || "User";

    if (existingUser) {
      // Sync data if changed (Role, Name, Username)
      if (
        existingUser.role !== validRole ||
        existingUser.fullName !== name ||
        existingUser.username !== username
      ) {
        await ctx.db.patch(existingUser._id, {
          role: validRole,
          fullName: name,
          username: username,
          updatedAt: Date.now(),
        });
      }
      return existingUser._id;
    }
    const phoneNumber = (identity.phoneNumber as string | undefined) || "";

    const userId = await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      username: username,
      fullName: name,
      phoneNumber: phoneNumber,
      address: "",
      role: validRole,
      assignedSites: [],
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return userId;
  },
});

/**
 * Create a new user (Manager only)
 * Note: Clerk user must be created first via Clerk API
 */
export const createUser = mutation({
  args: {
    clerkUserId: v.optional(v.string()),
    username: v.string(),
    fullName: v.string(),
    passwordHash: v.optional(v.string()),
    phoneNumber: v.string(),
    address: v.string(),
    role: v.union(v.literal("site_engineer"), v.literal("manager"), v.literal("purchase_officer")),
    assignedSites: v.optional(v.array(v.id("sites"))),
    assignedProjects: v.optional(v.array(v.id("projects"))),
    profileImage: v.optional(v.string()),
    profileImageKey: v.optional(v.string()),
    signatureStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    console.log("createUser: identity =", identity ? identity.subject : "null");

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity?.subject ?? ""))
      .first();

    console.log("createUser: currentUser =", currentUser ? { id: currentUser._id, role: currentUser.role } : "null");

    if (!currentUser) {
      throw new ConvexError("User not found");
    }

    // Check if user is a manager
    if (currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only managers can create users");
    }

    // Check if username already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (existingUser) {
      throw new ConvexError("Username already exists");
    }

    // Get signature URL if storage ID provided
    let signatureUrl: string | null | undefined = undefined;
    if (args.signatureStorageId) {
      signatureUrl = await ctx.storage.getUrl(args.signatureStorageId);
    }

    // Create user - auto-generate auth ID if not provided
    const authUserId = args.clerkUserId || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    console.log("createUser: creating user", { username: args.username, role: args.role });
    const userId = await ctx.db.insert("users", {
      clerkUserId: authUserId,
      username: args.username,
      fullName: args.fullName,
      passwordHash: args.passwordHash,
      phoneNumber: args.phoneNumber,
      address: args.address,
      role: args.role,
      assignedSites: args.assignedSites || [],
      assignedProjects: args.assignedProjects || [],
      isActive: true,
      profileImage: args.profileImage,
      profileImageKey: args.profileImageKey,
      signatureStorageId: args.signatureStorageId,
      signatureUrl: signatureUrl || undefined,
      createdBy: currentUser._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    console.log("createUser: success, userId =", userId);
    return { userId, authUserId };
  },
});

/**
 * Update user (Manager only)
 */
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    fullName: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    role: v.optional(v.union(v.literal("site_engineer"), v.literal("manager"), v.literal("purchase_officer"))),
    assignedSites: v.optional(v.array(v.id("sites"))),
    assignedProjects: v.optional(v.array(v.id("projects"))),
    isActive: v.optional(v.boolean()),
    profileImage: v.optional(v.string()),
    profileImageKey: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    signatureStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    if (!currentUser) {
      throw new ConvexError("User not found");
    }

    // Check if user is a manager
    if (currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only managers can update users");
    }

    // Get user to update
    const userToUpdate = await ctx.db.get(args.userId);
    if (!userToUpdate) {
      throw new ConvexError("User not found");
    }

    // Handle Signature Update
    let signatureUrl: string | null | undefined = undefined;
    if (args.signatureStorageId) {
      // If user has old signature, delete it
      if (userToUpdate.signatureStorageId) {
        await ctx.storage.delete(userToUpdate.signatureStorageId);
      }
      signatureUrl = await ctx.storage.getUrl(args.signatureStorageId);
    }

    // Update user
    await ctx.db.patch(args.userId, {
      ...(args.fullName && { fullName: args.fullName }),
      ...(args.phoneNumber && { phoneNumber: args.phoneNumber }),
      ...(args.address && { address: args.address }),
      ...(args.role && { role: args.role }),
      ...(args.assignedSites !== undefined && { assignedSites: args.assignedSites }),
      ...(args.assignedProjects !== undefined && { assignedProjects: args.assignedProjects }),
      ...(args.isActive !== undefined && { isActive: args.isActive }),
      ...(args.profileImage !== undefined && { profileImage: args.profileImage }),
      ...(args.profileImageKey !== undefined && { profileImageKey: args.profileImageKey }),
      ...(args.passwordHash !== undefined && { passwordHash: args.passwordHash }),
      ...(args.signatureStorageId && { signatureStorageId: args.signatureStorageId }),
      ...(signatureUrl && { signatureUrl: signatureUrl }),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Disable user (Manager only)
 */
export const disableUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    if (!currentUser) {
      throw new ConvexError("User not found");
    }

    // Check if user is a manager
    if (currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only managers can disable users");
    }

    // Don't allow disabling self
    if (args.userId === currentUser._id) {
      throw new ConvexError("Cannot disable your own account");
    }

    // Disable user
    await ctx.db.patch(args.userId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Enable user (Manager only)
 */
export const enableUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    if (!currentUser) {
      throw new ConvexError("User not found");
    }

    // Check if user is a manager
    if (currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only managers can enable users");
    }

    // Enable user
    await ctx.db.patch(args.userId, {
      isActive: true,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Update own profile
 * User can update their own profile information
 */
export const updateProfile = mutation({
  args: {
    clerkUserId: v.string(),
    fullName: v.string(),
    phoneNumber: v.string(),
    address: v.string(),
    profileImage: v.optional(v.string()),
    profileImageKey: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Verify user is updating their own profile
    if (identity.subject !== args.clerkUserId) {
      throw new ConvexError("Unauthorized: You can only update your own profile");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (!user) {
      throw new ConvexError("User not found");
    }

    // Update profile
    await ctx.db.patch(user._id, {
      fullName: args.fullName,
      phoneNumber: args.phoneNumber,
      address: args.address,
      ...(args.profileImage !== undefined && { profileImage: args.profileImage }),
      ...(args.profileImageKey !== undefined && { profileImageKey: args.profileImageKey }),
      ...(args.passwordHash !== undefined && { passwordHash: args.passwordHash }),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete user (Manager only)
 * Note: This only deletes from Convex. Clerk deletion is handled via API.
 */
export const deleteUser = mutation({
  args: {
    userId: v.id("users"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    if (!currentUser) {
      throw new ConvexError("User not found");
    }

    // Check if user is a manager
    if (currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only managers can delete users");
    }

    // Don't allow deleting yourself
    if (currentUser._id === args.userId) {
      throw new ConvexError("You cannot delete yourself");
    }

    // Delete user from Convex only (Clerk deletion handled via API)
    await ctx.db.delete(args.userId);

    return { success: true, clerkUserId: args.clerkUserId };
  },
});


// ============================================================================
// Internal Mutations (Webhooks)
// ============================================================================

/**
 * Upsert user from Clerk webhook
 * Creates or updates user based on Clerk data
 */
export const internalUpsertUser = internalMutation({
  args: {
    clerkUserId: v.string(),
    username: v.string(),
    fullName: v.string(),
    phoneNumber: v.optional(v.string()),
    email: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    // Determine role (default to site_engineer if not provided)
    // Note: This logic might need refinement based on how role is passed from Clerk
    const role = args.role === "manager" ? "manager" :
      args.role === "purchase_officer" ? "purchase_officer" : "site_engineer";

    if (existingUser) {
      // Update existing user
      await ctx.db.patch(existingUser._id, {
        username: args.username,
        fullName: args.fullName,
        ...(args.phoneNumber && { phoneNumber: args.phoneNumber }),
        ...(args.profileImage && { profileImage: args.profileImage }),
        // Only update role if explicitly provided (e.g. metadata change)
        ...(args.role && { role }),
        updatedAt: Date.now(),
        isActive: true, // Ensure user is active on update
      });
      return existingUser._id;
    }

    // Create new user
    const userId = await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      username: args.username,
      fullName: args.fullName,
      phoneNumber: args.phoneNumber || "",
      address: "", // Default empty
      role: role,
      assignedSites: [],
      isActive: true, // Default active
      profileImage: args.profileImage,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return userId;
  },
});

/**
 * Delete user from Clerk webhook
 */
export const internalDeleteUserByClerkId = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (user) {
      await ctx.db.delete(user._id);
      return { success: true, id: user._id };
    }

    return { success: false, reason: "User not found" };
  },
});


// ============================================================================
// Signature Management (Manager Only)
// ============================================================================

/**
 * Generate upload URL for signature image
 */
export const generateSignatureUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    if (!currentUser) {
      throw new ConvexError("User not found");
    }

    // Only managers can upload signatures
    if (currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only managers can upload signatures");
    }

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Save signature after upload
 */
export const updateSignature = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    if (!currentUser) {
      throw new ConvexError("User not found");
    }

    // Only managers can update signatures
    if (currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only managers can update signatures");
    }

    // Delete old signature if exists
    if (currentUser.signatureStorageId) {
      await ctx.storage.delete(currentUser.signatureStorageId);
    }

    // Get the URL for the uploaded file
    const signatureUrl = await ctx.storage.getUrl(args.storageId);

    // Update user with new signature
    await ctx.db.patch(currentUser._id, {
      signatureUrl: signatureUrl || undefined,
      signatureStorageId: args.storageId,
      updatedAt: Date.now(),
    });

    return { success: true, signatureUrl };
  },
});

/**
 * Delete signature
 */
export const deleteSignature = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    if (!currentUser) {
      throw new ConvexError("User not found");
    }

    // Only managers can delete signatures
    if (currentUser.role !== "manager") {
      throw new ConvexError("Unauthorized: Only managers can delete signatures");
    }

    // Delete from storage
    if (currentUser.signatureStorageId) {
      await ctx.storage.delete(currentUser.signatureStorageId);
    }

    // Remove from user
    await ctx.db.patch(currentUser._id, {
      signatureUrl: undefined,
      signatureStorageId: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Seed initial manager user (no auth required)
 * If no users exist, creates a new manager.
 * If users exist but none have passwords, updates the first manager with a password.
 */
export const seedManager = mutation({
  args: {
    username: v.string(),
    fullName: v.string(),
    passwordHash: v.string(),
    phoneNumber: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingUsers = await ctx.db.query("users").collect();

    if (existingUsers.length === 0) {
      // No users - create fresh
      const authUserId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const userId = await ctx.db.insert("users", {
        clerkUserId: authUserId,
        username: args.username,
        fullName: args.fullName,
        passwordHash: args.passwordHash,
        phoneNumber: args.phoneNumber || "",
        address: args.address || "",
        role: "manager",
        assignedSites: [],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      console.log("seedManager: created new manager", { userId, username: args.username, authUserId });
      return { userId, authUserId, action: "created" };
    }

    // Users exist - find a manager without a password and update it
    const managerWithoutPw = existingUsers.find(u => u.role === "manager" && !u.passwordHash);

    if (managerWithoutPw) {
      // Update existing manager with password, username, and a new auth ID
      const authUserId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await ctx.db.patch(managerWithoutPw._id, {
        username: args.username,
        fullName: args.fullName,
        passwordHash: args.passwordHash,
        clerkUserId: authUserId,
        isActive: true,
        updatedAt: Date.now(),
      });
      console.log("seedManager: updated existing manager with password", {
        userId: managerWithoutPw._id,
        oldUsername: managerWithoutPw.username,
        newUsername: args.username,
        authUserId,
      });
      return { userId: managerWithoutPw._id, authUserId, action: "updated" };
    }


    throw new ConvexError("All existing managers already have passwords. Use the login page instead.");
  },
});
