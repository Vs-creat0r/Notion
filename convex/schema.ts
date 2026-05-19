import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex Database Schema
 * 
 * Defines all tables for the NOTION CRM system.
 */

export default defineSchema({
  // ============================================================================
  // Users Table
  // ============================================================================
  users: defineTable({
    clerkUserId: v.string(), // Auth user ID (unique) - used as JWT subject
    username: v.string(), // Username for login (unique)
    fullName: v.string(),
    passwordHash: v.optional(v.string()), // bcrypt password hash
    phoneNumber: v.string(),
    address: v.string(),
    role: v.union(
      v.literal("site_engineer"),
      v.literal("manager"),
      v.literal("purchase_officer")
    ),
    assignedSites: v.optional(v.array(v.id("sites"))), // Sites assigned to site engineers
    assignedProjects: v.optional(v.array(v.id("projects"))), // Projects assigned to site engineers
    isActive: v.boolean(),
    profileImage: v.optional(v.string()), // Profile image URL
    profileImageKey: v.optional(v.string()), // Profile image storage key
    signatureUrl: v.optional(v.string()), // Manager signature image URL
    signatureStorageId: v.optional(v.id("_storage")), // Signature storage ID
    createdBy: v.optional(v.id("users")), // Manager who created this user (null for first manager)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_username", ["username"])
    .index("by_role", ["role"])
    .index("by_is_active", ["isActive"]),

  // ============================================================================
  // Requests Table
  // ============================================================================
  requests: defineTable({
    requestNumber: v.string(), // Auto-generated unique identifier
    createdBy: v.id("users"), // Site Engineer
    siteId: v.id("sites"), // Site location for the request
    itemName: v.string(), // Item name (can be from inventory or new)
    description: v.string(), // Item description
    specsBrand: v.optional(v.string()), // Specifications/Brand
    quantity: v.number(), // Quantity needed
    unit: v.string(), // Unit of measurement
    requiredBy: v.number(), // Required date timestamp
    isUrgent: v.boolean(), // Urgent flag
    // Backward compatibility: support both old photo field and new photos array
    photo: v.optional(v.object({
      imageUrl: v.string(), // R2 public URL
      imageKey: v.string(), // R2 object key for deletion/updates
    })), // Legacy single photo support
    photos: v.optional(v.array(v.object({
      imageUrl: v.string(), // R2 public URL
      imageKey: v.string(), // R2 object key for deletion/updates
    }))), // Array of photos (supports multiple photos per item) // Photo attachment
    itemOrder: v.optional(v.number()), // Order of item within the request (1, 2, 3...)
    status: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("sign_pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("sign_rejected"),
      v.literal("recheck"),
      v.literal("ready_for_cc"),
      v.literal("cc_pending"),
      v.literal("cc_approved"),
      v.literal("cc_rejected"),
      v.literal("direct_cc"), // Direct cost comparison (legacy status)
      v.literal("ready_for_po"),
      v.literal("pending_po"),
      v.literal("direct_po"),
      v.literal("rejected_po"),
      v.literal("ready_for_delivery"),
      v.literal("delivery_stage"), // Deprecated - migrating to out_for_delivery
      v.literal("delivery_processing"), // Deprecated - migrating to out_for_delivery
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("closed")
    ),
    approvedBy: v.optional(v.id("users")), // Manager
    approvedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    deliveryMarkedAt: v.optional(v.number()),
    deliveryId: v.optional(v.id("deliveries")), // Linked delivery record
    notes: v.optional(v.string()),
    directAction: v.optional(v.union(
      v.literal("delivery"),
      v.literal("po"),
      v.literal("all"),
      v.literal("split_po"),
      v.literal("split_delivery"),
      v.literal("split_po_delivery")
    )), // Flag for direct delivery/PO/split combinations
    isSplitApproved: v.optional(v.boolean()),
    isRFQ: v.optional(v.boolean()), // Flag to indicate this is an RFQ (Request for Quotation)
    projectId: v.optional(v.id("projects")), // Source project (for items sent from Projects module)
    lastTalkDate: v.optional(v.number()), // For pending PO last talk date
    lastTalkText: v.optional(v.string()), // Notes for last talk
    committedDate: v.optional(v.number()), // Vendor committed delivery date (manually set)

    // Delivery Confirmation Details
    deliveryNotes: v.optional(v.string()), // Notes added by site engineer upon receipt
    deliveryPhotos: v.optional(v.array(v.object({
      imageUrl: v.string(),
      imageKey: v.string(),
    }))), // Photos of received items

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_request_number", ["requestNumber"])
    .index("by_created_by", ["createdBy"])
    .index("by_site_id", ["siteId"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"]),

  // ============================================================================
  // Purchase Orders Table
  // ============================================================================
  purchaseOrders: defineTable({
    poNumber: v.string(), // Auto-generated unique identifier
    requestId: v.optional(v.id("requests")), // Linked request (optional for Direct PO)
    projectId: v.optional(v.id("projects")), // Linked project (optional)
    deliverySiteId: v.optional(v.id("sites")), // Delivery site (for Direct PO)
    vendorId: v.id("vendors"),
    createdBy: v.id("users"), // Purchase Officer
    itemDescription: v.string(), // Item description
    customTitle: v.optional(v.string()), // User-defined title
    quantity: v.number(),
    unit: v.string(),
    hsnSacCode: v.optional(v.string()), // HSN/SAC Code
    unitRate: v.number(),
    discountPercent: v.optional(v.number()), // Discount percentage (optional for Direct PO)
    gstTaxRate: v.number(), // GST Tax Rate percentage
    totalAmount: v.number(), // Total amount after discount and GST
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("pending_approval"),
      v.literal("sign_pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("sign_rejected"),
      v.literal("ordered"),
      v.literal("delivered"),
      v.literal("cancelled"),
      v.literal("closed")
    ),
    perUnitBasis: v.optional(v.number()),
    perUnitBasisUnit: v.optional(v.string()),
    imageUrl: v.optional(v.string()), // Item photo URL
    imageKey: v.optional(v.string()), // R2 object key
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    isDirect: v.optional(v.boolean()), // Flag to indicate Direct PO (bypasses approval)
    validTill: v.optional(v.number()), // PO expiry date (for Direct PO)
    expectedDeliveryDate: v.optional(v.number()),
    actualDeliveryDate: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_po_number", ["poNumber"])
    .index("by_request_id", ["requestId"])
    .index("by_vendor_id", ["vendorId"])
    .index("by_created_by", ["createdBy"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"])
    .index("by_is_direct", ["isDirect"])
    .index("by_delivery_site", ["deliverySiteId"]),

  // ============================================================================
  // Vendors Table
  // ============================================================================
  vendors: defineTable({
    companyName: v.string(), // Company Name
    contactName: v.optional(v.string()), // Contact Person Name
    email: v.string(), // Email
    phone: v.string(), // Phone
    gstNumber: v.string(), // GST Number
    address: v.string(), // Address
    isActive: v.boolean(),
    createdBy: v.id("users"), // Purchase Officer
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company_name", ["companyName"])
    .index("by_is_active", ["isActive"])
    .index("by_created_at", ["createdAt"]),

  // ============================================================================
  // Inventory Categories Table
  // ============================================================================
  inventoryCategories: defineTable({
    name: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_name", ["name"]),

  // ============================================================================
  // Inventory Table
  // ============================================================================
  inventory: defineTable({
    itemName: v.string(), // Item Name
    description: v.optional(v.string()), // Item Description
    specification: v.optional(v.string()), // Legacy field - kept for backward compatibility
    categoryId: v.optional(v.id("inventoryCategories")), // Category
    hsnSacCode: v.optional(v.string()), // HSN/SAC Code
    unit: v.optional(v.string()), // Unit (e.g., bags, kg, mm, gm, nos, ton) - optional
    centralStock: v.optional(v.number()), // Central Stock quantity - optional
    vendorId: v.optional(v.id("vendors")), // Linked vendor - optional (deprecated, use vendorIds)
    vendorIds: v.optional(v.array(v.id("vendors"))), // Linked vendors - optional (multiple vendors)
    images: v.optional(v.array(v.object({
      imageUrl: v.string(), // Cloudflare R2 public URL
      imageKey: v.string(), // R2 object key for deletion/updates
      uploadedBy: v.id("users"), // User who uploaded the image
      uploadedAt: v.number(), // Upload timestamp
    }))), // Array of images (supports multiple images)
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_item_name", ["itemName"])
    .index("by_vendor_id", ["vendorId"])
    .index("by_is_active", ["isActive"])
    .index("by_created_at", ["createdAt"])
    .index("by_category", ["categoryId"]),

  // ============================================================================
  // Chat Conversations Table
  // ============================================================================
  conversations: defineTable({
    participants: v.array(v.id("users")), // Always 2 users for one-on-one chats
    lastMessageAt: v.optional(v.number()),
    lastMessage: v.optional(v.string()),
    lastMessageSenderId: v.optional(v.id("users")),
    unreadCount: v.any(), // Dynamic object mapping userId to unread count { "userId": count }
    mutedBy: v.optional(v.array(v.id("users"))), // Users who muted this conversation
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_participants", ["participants"])
    .index("by_last_message_at", ["lastMessageAt"]),

  // ============================================================================
  // Chat Messages Table
  // ============================================================================
  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    content: v.string(),
    imageUrl: v.optional(v.string()), // R2 image URL for image messages
    imageKey: v.optional(v.string()), // R2 image key for deletion
    fileUrl: v.optional(v.string()), // URL for generic files (pdf, docx, etc)
    fileKey: v.optional(v.string()), // Storage key
    fileName: v.optional(v.string()), // Original filename
    fileType: v.optional(v.string()), // MIME type
    fileSize: v.optional(v.number()), // Size in bytes
    location: v.optional(v.object({
      latitude: v.number(),
      longitude: v.number(),
      address: v.optional(v.string()),
    })), // Location attachment
    readBy: v.array(v.id("users")), // Users who have read this message
    deliveredBy: v.optional(v.array(v.id("users"))), // Users who have received/delivered this message
    createdAt: v.number(),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_conversation_created", ["conversationId", "createdAt"])
    .index("by_sender_id", ["senderId"]),

  // ============================================================================
  // User Presence Table
  // ============================================================================
  userPresence: defineTable({
    userId: v.id("users"),
    isOnline: v.boolean(),
    lastSeenAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_is_online", ["isOnline"]),

  // ============================================================================
  // Sticky Notes Table
  // ============================================================================
  stickyNotes: defineTable({
    createdBy: v.id("users"), // User who created the note
    assignedTo: v.id("users"), // User who should see the note (can be different for managers)
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
    reminderAt: v.optional(v.number()), // Optional timestamp for reminder notification
    isCompleted: v.boolean(),
    isDeleted: v.boolean(),
    reminderTriggered: v.optional(v.boolean()), // Track if reminder was already triggered
    isRead: v.optional(v.boolean()), // Track if the assignee has seen the note
    // Checklist items for todo functionality
    checklistItems: v.optional(v.array(v.object({
      id: v.string(),
      text: v.string(),
      completed: v.boolean(),
    }))),
    // Position and size for draggable/resizable sticky notes
    positionX: v.optional(v.number()), // X position on screen
    positionY: v.optional(v.number()), // Y position on screen
    width: v.optional(v.number()), // Width of the note
    height: v.optional(v.number()), // Height of the note

    // Task Management Extensions
    priority: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))),
    dueDate: v.optional(v.number()),
    linkedEntityId: v.optional(v.string()),
    linkedEntityType: v.optional(v.union(v.literal("cc"), v.literal("dc"), v.literal("po"))),
    acceptedStatus: v.optional(v.union(v.literal("pending"), v.literal("seen"))),
    completedAt: v.optional(v.number()),

    // Activity log for tracking note history (created, updated, completed, etc.)
    activityLogs: v.optional(v.array(v.object({
      action: v.string(),
      timestamp: v.number(),
      userId: v.id("users"),
      detail: v.optional(v.string()), // Extra info (e.g. comment text)
    }))),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_assigned_to", ["assignedTo"])
    .index("by_created_by", ["createdBy"])
    .index("by_reminder_at", ["reminderAt"])
    .index("by_is_deleted", ["isDeleted"])
    .index("by_is_completed", ["isCompleted"])
    .index("by_linked_entity", ["linkedEntityType", "linkedEntityId"]),

  // ============================================================================
  // Sites Table
  // ============================================================================
  sites: defineTable({
    name: v.string(), // Site name
    code: v.optional(v.string()), // Site code/identifier
    address: v.optional(v.string()), // Site address
    description: v.optional(v.string()), // Site description
    type: v.optional(v.union(v.literal("site"), v.literal("inventory"), v.literal("other"))), // Location type
    isActive: v.boolean(),
    createdBy: v.id("users"), // Manager who created this site
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_is_active", ["isActive"])
    .index("by_created_at", ["createdAt"]),

  // ============================================================================
  // Cost Comparisons Table
  // ============================================================================
  costComparisons: defineTable({
    requestId: v.optional(v.id("requests")), // Linked request (optional for direct CC)
    createdBy: v.id("users"), // Purchase Officer
    ccNumber: v.optional(v.string()), // Cost comparison number (legacy field for backward compatibility)
    ccTitle: v.optional(v.string()), // Cost comparison title (legacy field for backward compatibility)
    itemName: v.optional(v.string()), // Item name (for direct CC)
    quantity: v.optional(v.number()), // Quantity (for direct CC)
    unit: v.optional(v.string()), // Unit (for direct CC)
    description: v.optional(v.string()), // Description (legacy field)
    vendorQuotes: v.array(
      v.object({
        vendorId: v.id("vendors"),
        unitPrice: v.number(), // Unit price in ₹
        amount: v.optional(v.number()), // Quote amount/quantity
        unit: v.optional(v.string()), // Unit of measurement
        discountPercent: v.optional(v.number()), // Optional discount percentage
        gstPercent: v.optional(v.number()), // Optional GST percentage
        perUnitBasis: v.optional(v.number()), // Optional basis for price (e.g. price per 50 units)
        contact: v.optional(v.string()), // Vendor Contact info
        reference: v.optional(v.string()), // Reference
        date: v.optional(v.string()), // Quote Date
        deliveryPeriod: v.optional(v.string()), // Delivery period
        paymentTerms: v.optional(v.string()), // Payment terms
        pastPerformance: v.optional(v.string()), // Past performance
        freight: v.optional(v.string()), // Freight
      })
    ),
    selectedVendorId: v.optional(v.id("vendors")), // Selected by manager
    status: v.union(
      v.literal("draft"), // Being created by purchase officer
      v.literal("cc_pending"), // Submitted for manager approval
      v.literal("cc_approved"), // Approved by manager
      v.literal("cc_rejected") // Rejected by manager
    ),
    managerNotes: v.optional(v.string()), // Manager's notes or rejection reason
    rejectedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    approvedBy: v.optional(v.id("users")), // Manager who approved/rejected
    counterOfferPercent: v.optional(v.number()), // Configurable user counter offer percentage
    isDirectDelivery: v.optional(v.boolean()), // If item is in inventory, can go directly to delivery
    inventoryFulfillmentQuantity: v.optional(v.number()), // Quantity to be fulfilled from inventory in a split/mixed plan
    purchaseQuantity: v.optional(v.number()), // Quantity to buy (may be > required for extra inventory)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_request_id", ["requestId"])
    .index("by_created_by", ["createdBy"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"]),

  // ============================================================================
  // Delivery Challans Table
  // ============================================================================
  // ============================================================================
  // Deliveries Table
  // ============================================================================
  deliveries: defineTable({
    deliveryId: v.string(), // Auto-generated unique identifier (DC-XXXX)
    poId: v.optional(v.id("purchaseOrders")), // Linked purchase order (Optional for direct delivery)
    customTitle: v.optional(v.string()), // User-defined title
    // Delivery Type
    deliveryType: v.union(
      v.literal("private"), // Internal/Private vehicle
      v.literal("public"), // Public transport (Porter etc)
      v.literal("vendor") // Direct vendor delivery
    ),
    // Delivery/Vendor Party Info
    deliveryPerson: v.optional(v.string()), // Driver Name
    deliveryContact: v.optional(v.string()), // Driver Phone
    vehicleNumber: v.optional(v.string()), // Vehicle Number
    transportName: v.optional(v.string()), // Transport Name (for Vendor type)
    transportId: v.optional(v.string()), // Transport ID (for Vendor type)
    vendorId: v.optional(v.id("vendors")), // Vendor for direct delivery DC

    receiverName: v.string(), // Receiver at site

    // Documentation
    loadingPhoto: v.optional(v.object({
      imageUrl: v.string(),
      imageKey: v.string(),
    })),
    invoicePhoto: v.optional(v.object({
      imageUrl: v.string(),
      imageKey: v.string(),
    })),
    receiptPhoto: v.optional(v.object({
      imageUrl: v.string(),
      imageKey: v.string(),
    })),

    // Purchase Details
    purchaserName: v.string(), // From purchaser list

    // Approval
    approvedByRole: v.optional(v.union(
      v.literal("manager"),
      v.literal("pe")
    )),

    // Payment
    paymentAmount: v.optional(v.number()),
    paymentStatus: v.optional(v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("partial")
    )),

    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),

    // Direct Delivery Items (stored as JSON for direct delivery challans)
    directItems: v.optional(v.string()), // JSON stringified array of items for direct delivery

    createdBy: v.id("users"), // Purchase Officer
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_delivery_id", ["deliveryId"])
    .index("by_po_id", ["poId"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"]),
  // ============================================================================
  // Request Notes Table
  // ============================================================================
  request_notes: defineTable({
    requestNumber: v.string(), // Links to the group of requests
    userId: v.id("users"), // The author of the note
    role: v.string(), // Author's role at the time (e.g. site_engineer, manager)
    status: v.optional(v.string()), // Request status at the time of note (e.g. draft, pending)
    type: v.optional(v.union(
      v.literal("note"), // Manual user note
      v.literal("log")   // System audit log
    )),
    content: v.string(), // The note content
    createdAt: v.number(), // Timestamp
  })
    .index("by_request_number", ["requestNumber"])
    .index("by_created_at", ["createdAt"]),

  // ============================================================================
  // Notifications Table
  // ============================================================================
  notifications: defineTable({
    userId: v.id("users"), // Who receives the notification
    title: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("info"),
      v.literal("success"),
      v.literal("warning"),
      v.literal("error"),
      v.literal("assignment")
    ),
    link: v.optional(v.string()), // Optional link to navigate to
    isRead: v.boolean(),
    metadata: v.optional(v.object({
      entityId: v.optional(v.string()),
      entityType: v.optional(v.string()),
    })),
    createdAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_is_read", ["isRead"])
    .index("by_created_at", ["createdAt"]),

  // ============================================================================
  // GRNs (Goods Receipt Notes) Table
  // ============================================================================
  grns: defineTable({
    grnNumber: v.string(), // Auto-generated unique identifier
    poId: v.id("purchaseOrders"), // Linked purchase order
    invoiceNo: v.optional(v.string()), // Manual entry
    invoiceDate: v.optional(v.number()), // Manual entry
    receivedQuantity: v.number(), // Quantity received in this GRN
    itemName: v.optional(v.string()), // Material name for register view
    siteId: v.optional(v.id("sites")), // Delivery site
    invoicePhoto: v.optional(v.object({
      imageUrl: v.string(),
      imageKey: v.string(),
    })),
    status: v.union(
      v.literal("pending"),
      v.literal("completed")
    ),
    createdBy: v.id("users"), // Site Engineer or person receiving
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_grn_number", ["grnNumber"])
    .index("by_po_id", ["poId"])
    .index("by_created_by", ["createdBy"])
    .index("by_created_at", ["createdAt"]),

  // ============================================================================
  // Projects Table
  // ============================================================================
  projects: defineTable({
    name: v.string(), // Project name
    description: v.optional(v.string()), // Project description
    location: v.optional(v.string()), // Free-text location
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))), // Project status
    timeline: v.optional(v.string()), // Existing string-based timeline
    estimatedTimeline: v.optional(v.number()), // Deadline timestamp
    pdfUrl: v.optional(v.string()), // R2 public URL for material requirement PDF
    pdfKey: v.optional(v.string()), // R2 object key for deletion
    pdfFileName: v.optional(v.string()), // Original PDF filename
    createdBy: v.id("users"), // User who created the project
    createdAt: v.number(), // Auto-set to Date.now()
    updatedAt: v.number(),
  })
    .index("by_created_by", ["createdBy"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"]),

  // ============================================================================
  // Project Categories Table (Shared across all projects)
  // ============================================================================
  projectCategories: defineTable({
    name: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_name", ["name"]),

  // ============================================================================
  // Project Items Table
  // ============================================================================
  projectItems: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    categoryId: v.optional(v.union(v.id("inventoryCategories"), v.id("projectCategories"))),
    make: v.optional(v.string()), // Legacy field - kept for backward compatibility
    unit: v.optional(v.string()), // e.g. kg, nos, bags, m
    hsnSacCode: v.optional(v.string()), // HSN/SAC Code
    quantity: v.number(),
    rate: v.number(),
    photos: v.optional(v.array(v.object({
      imageUrl: v.string(),
      imageKey: v.string(),
      uploadedBy: v.id("users"),
      uploadedAt: v.number(),
    }))),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_category", ["categoryId"])
    .index("by_created_by", ["createdBy"]),
});

