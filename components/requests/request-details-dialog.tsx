"use client";

/**
 * Request Details Dialog Component
 * 
 * Shows full request details with photo display.
 * Managers can approve/reject requests.
 * Site Engineers can mark delivery.
 */

import { useState, useRef, useEffect, useMemo, Fragment } from "react";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle, XCircle, Package, ShoppingCart, MapPin, PackageX, Sparkles, FileText, PieChart, LayoutGrid, List, Edit, Image as ImageIcon, Calendar, Clock, Check, Send, NotebookPen, Loader2, Truck, Pencil, GitFork, Building2, User, RefreshCw, Eye, Layers } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import { ROLES } from "@/lib/auth/roles";
import { CompactImageGallery } from "@/components/ui/image-gallery";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UserInfoDialog } from "./user-info-dialog";
import { ItemInfoDialog } from "./item-info-dialog";
import { LocationInfoDialog } from "@/components/locations/location-info-dialog";
import { NotesTimelineDialog } from "./notes-timeline-dialog";
import { PDFPreviewDialog } from "@/components/purchase/pdf-preview-dialog";
import { EditPOQuantityDialog } from "@/components/purchase/edit-po-quantity-dialog";
import { SplitPOQuantityDialog } from "@/components/purchase/split-po-quantity-dialog";
import { ExpandableText } from "@/components/ui/expandable-text";
import { DirectPODialog, type DirectPOInitialData } from "@/components/purchase/direct-po-dialog";
import { BulkDeliveryDialog } from "@/components/purchase/bulk-delivery-dialog";
import { CreateDCMultiDialog } from "@/components/purchase/create-dc-multi-dialog";
import { ViewDCDialog } from "@/components/purchase/view-dc-dialog";
import { ConfirmDeliveryDialog } from "@/components/requests/confirm-delivery-dialog";
import { ProjectInfoDialog } from "@/components/projects/project-info-dialog";
import type { Id } from "@/convex/_generated/dataModel";

interface RequestDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: Id<"requests"> | null;
  onCheck?: (requestId: Id<"requests">) => void;
  onOpenCC?: (requestId: Id<"requests">, requestIds?: Id<"requests">[]) => void;
  onCreatePO?: (requestIds: Id<"requests">[]) => void;
}

export function RequestDetailsDialog({
  open,
  onOpenChange,
  requestId,
  onCheck,
  onOpenCC,
  onCreatePO,
}: RequestDetailsDialogProps) {
  const userRole = useUserRole();
  const request = useQuery(
    api.requests.getRequestById,
    requestId ? { requestId } : "skip"
  );
  // Get all requests with the same requestNumber to show all items
  const allRequests = useQuery(
    api.requests.getRequestsByRequestNumber,
    request?.requestNumber ? { requestNumber: request.requestNumber } : "skip"
  );


  const handleSingleApproveDirectPO = async (requestId: Id<"requests">) => {
    setIsLoading(true);
    try {
      await approveDirectPO({ requestId: requestId as Id<"requests"> });
      setShowSignPendingApproveConfirm(null);
      toast.success("Direct PO approved successfully");
      // Small delay to let confirmation dialog close first
      setTimeout(() => {
        closeAndRefresh();
      }, 100);
    } catch (error: any) {
      toast.error("Failed to approve Direct PO: " + error.message);
      console.error("Approve error:", error);
      setShowSignPendingApproveConfirm(null); // Close confirmation on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleSingleRejectDirectPO = async (requestId: Id<"requests">, reason: string) => {
    try {
      await rejectDirectPO({ requestId, reason });
      toast.success("Direct PO rejected");
      setShowRejectionInput(null as any);
      setRejectionReason("");
    } catch (error: any) {
      toast.error("Failed to reject Direct PO: " + error.message);
    }
  };
  const updateStatus = useMutation(api.requests.updateRequestStatus);
  const bulkUpdateStatus = useMutation(api.requests.bulkUpdateRequestStatus);
  const updateRequestDetails = useMutation(api.requests.updateRequestDetails);
  const markDelivery = useMutation(api.requests.markDelivery);
  const upsertCC = useMutation(api.costComparisons.upsertCostComparison);
  const approveSplit = useMutation(api.costComparisons.approveSplitFulfillment);
  const approveDirectPO = useMutation(api.purchaseOrders.approveDirectPOByRequest);
  const rejectDirectPO = useMutation(api.purchaseOrders.rejectDirectPOByRequest);
  const approveDirectPOById = useMutation(api.purchaseOrders.approveDirectPO);
  const rejectDirectPOById = useMutation(api.purchaseOrders.rejectDirectPO);
  const markReadyForDelivery = useMutation(api.requests.markReadyForDelivery);

  // Fetch pending POs for grouping
  const pendingPOs = useQuery(
    api.purchaseOrders.getPOsForRequestNumber,
    request?.requestNumber ? { requestNumber: request.requestNumber } : "skip"
  );

  // Fetch latest note for this request
  const notes = useQuery(api.notes.getNotes, request?.requestNumber ? { requestNumber: request.requestNumber } : "skip");
  // Only show manually typed notes (type === "note") in the preview, not system-generated logs
  const manualNotes = notes?.filter(n => n.type === "note") || [];
  const latestNote = manualNotes.length > 0 ? manualNotes[0] : null;

  // Create a lookup map: requestId -> poNumber (from all PO groups)
  const requestToPONumber = useMemo(() => {
    const map = new Map<string, string>();
    if (pendingPOs) {
      pendingPOs.forEach((group: any) => {
        group.items.forEach((item: any) => {
          if (item.requestId && item.poNumber) {
            map.set(item.requestId, item.poNumber);
          }
        });
      });
    }
    return map;
  }, [pendingPOs]);

  const [isLoading, setIsLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionInput, setShowRejectionInput] = useState<boolean | string>(false);
  const [itemRejectionReasons, setItemRejectionReasons] = useState<Record<string, string>>({});
  const [showItemRejectionInput, setShowItemRejectionInput] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<Id<"sites"> | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);
  const [pdfPreviewPoNumber, setPdfPreviewPoNumber] = useState<string | null>(null);
  const [pdfPreviewRequestId, setPdfPreviewRequestId] = useState<string | null>(null);
  const [pdfPreviewRequestIds, setPdfPreviewRequestIds] = useState<string[] | null>(null);
  const [selectedItemsForAction, setSelectedItemsForAction] = useState<Set<Id<"requests">>>(new Set());
  const [selectedCCItems, setSelectedCCItems] = useState<Set<Id<"requests">>>(new Set());
  const [itemActions, setItemActions] = useState<Record<Id<"requests">, "approve" | "reject" | "direct_po" | null>>({});
  const [itemIntents, setItemIntents] = useState<Record<Id<"requests">, string[]>>({});
  const [showBatchProcessDialog, setShowBatchProcessDialog] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showDirectPOConfirm, setShowDirectPOConfirm] = useState(false);
  const [showItemApproveConfirm, setShowItemApproveConfirm] = useState<Id<"requests"> | null>(null);
  const [showItemDirectPOConfirm, setShowItemDirectPOConfirm] = useState<Id<"requests"> | null>(null);
  const [showDirectDeliveryConfirm, setShowDirectDeliveryConfirm] = useState(false);
  const [showItemDirectDeliveryConfirm, setShowItemDirectDeliveryConfirm] = useState<Id<"requests"> | null>(null);
  const [showBulkSplitConfirm, setShowBulkSplitConfirm] = useState(false);
  const [showNotesTimeline, setShowNotesTimeline] = useState(false);
  const [showSignPendingApproveConfirm, setShowSignPendingApproveConfirm] = useState<Id<"requests"> | boolean | null>(null);
  const [editQuantityItem, setEditQuantityItem] = useState<{ id: Id<"requests">; quantity: number; name: string; unit: string } | null>(null);
  const [splitPOQuantityItem, setSplitPOQuantityItem] = useState<{ id: Id<"requests">; quantity: number; name: string; unit: string } | null>(null);
  const [bulkDeliveryData, setBulkDeliveryData] = useState<{ items: any[]; vendorName: string; poNumber: string; mode?: "delivery" | "direct_delivered" } | null>(null);
  const [showBulkDirectDeliveryConfirm, setShowBulkDirectDeliveryConfirm] = useState<{ items: any[]; poNumber: string; vendorName: string } | null>(null);
  const [selectedDCItems, setSelectedDCItems] = useState<Set<Id<"requests">>>(new Set());
  const [showBulkDCDialog, setShowBulkDCDialog] = useState(false);
  const [showConfirmDelivery, setShowConfirmDelivery] = useState<Id<"requests"> | null>(null);
  const [viewDCId, setViewDCId] = useState<Id<"deliveries"> | null>(null);
  // View mode with responsive default and cookie persistence
  const [viewMode, setViewMode] = useState<"table" | "card">("card"); // Default to card for mobile-first
  const [viewModeInitialized, setViewModeInitialized] = useState(false);

  // Initialize view mode on client side based on cookie or screen width
  useEffect(() => {
    if (viewModeInitialized) return;

    // Check for saved preference in cookie
    const savedMode = document.cookie
      .split("; ")
      .find((row) => row.startsWith("request-details-view-mode="))
      ?.split("=")[1];

    if (savedMode === "table" || savedMode === "card") {
      setViewMode(savedMode);
    } else {
      // Default based on screen width: >= 1200px = table, < 1200px = card
      setViewMode(window.innerWidth >= 1200 ? "table" : "card");
    }
    setViewModeInitialized(true);
  }, [viewModeInitialized]);

  // Handle view mode toggle and save to cookie
  const handleViewModeToggle = () => {
    const newMode = viewMode === "table" ? "card" : "table";
    setViewMode(newMode);
    // Save to cookie (expires in 1 year)
    document.cookie = `request-details-view-mode=${newMode}; path=/; max-age=${60 * 60 * 24 * 365}`;
  };
  const hasRefreshedRef = useRef(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Permission Grant Confirmation (for recheck items)
  const [showPermissionConfirm, setShowPermissionConfirm] = useState<{
    itemId: Id<"requests">;
    itemName: string;
    permission: "delivery" | "po" | "split";
    permissionLabel: string;
  } | null>(null);

  // PO Creation
  const [showDirectPODialog, setShowDirectPODialog] = useState(false);
  const [directPOInitialData, setDirectPOInitialData] = useState<DirectPOInitialData | null>(null);

  // Note handling
  const [newNote, setNewNote] = useState("");
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const addNote = useMutation(api.notes.addNote);

  const handleAddNote = async () => {
    if (!newNote.trim() || !request?.requestNumber) return;

    setIsSubmittingNote(true);
    try {
      await addNote({
        requestNumber: request.requestNumber,
        content: newNote.trim()
      });
      setNewNote("");
      toast.success("Note added");
    } catch (error) {
      toast.error("Failed to add note");
      console.error(error);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  // Helper function to collect photos from both photo and photos fields
  const getItemPhotos = (item: any) => {
    const photos: Array<{ imageUrl: string; imageKey: string }> = [];

    // Check for new photos array first
    if (item.photos && item.photos.length > 0) {
      item.photos.forEach((photo: { imageUrl: string; imageKey: string }) => {
        photos.push({
          imageUrl: photo.imageUrl,
          imageKey: photo.imageKey,
        });
      });
    }
    // Fallback to legacy photo field
    else if (item.photo) {
      photos.push({
        imageUrl: item.photo.imageUrl,
        imageKey: item.photo.imageKey,
      });
    }

    return photos;
  };

  // Collect all unique item names from requests
  const uniqueItemNames = useMemo(() => {
    if (!allRequests) return [];
    const names = new Set<string>();
    allRequests.forEach((item) => names.add(item.itemName));
    return Array.from(names);
  }, [allRequests]);

  // Query inventory status for all items
  const inventoryStatus = useQuery(
    api.inventory.getInventoryStatusForItems,
    uniqueItemNames.length > 0 ? { itemNames: uniqueItemNames } : "skip"
  );

  // Helper function to get inventory status badge for an item
  const getInventoryStatusBadge = (itemName: string, requestedQuantity: number, unit: string) => {
    if (!inventoryStatus) return null;

    const status = Array.isArray(inventoryStatus)
      ? inventoryStatus.find((s: any) => s.requestedName === itemName)
      : (inventoryStatus as any)[itemName];

    if (!status) return null;

    if (status.status === "new_item") {
      const encodedItemName = encodeURIComponent(itemName);

      // Logic to open Item Info Dialog
      const handleInventoryClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click
        setSelectedItemName(itemName);
      };

      return (
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800 text-[10px] px-1.5 py-0.5 h-5 gap-1 cursor-default"
          >
            <Sparkles className="h-3 w-3" />
            New Item
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
            onClick={handleInventoryClick}
            title="Go to Inventory to Add Item"
          >
            <Package className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    }

    const encodedItemName = encodeURIComponent(itemName);

    // Logic to open Item Info Dialog
    const handleInventoryClick = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent row click
      setSelectedItemName(itemName);
    };

    if (status.status === "out_of_stock") {
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 text-[10px] px-1.5 py-0.5 h-5 gap-1 cursor-default"
        >
          <PackageX className="h-3 w-3" />
          Out of Stock
        </Badge>
      );
    }

    // In stock - show remaining quantity
    const stockAvailable = status.centralStock;
    const remaining = stockAvailable - requestedQuantity;
    const stockUnit = status.unit || unit;

    // Determine color based on how much stock remains
    const isLowStock = remaining < 0 || (stockAvailable > 0 && remaining < stockAvailable * 0.2);
    const isSufficientStock = remaining >= 0;

    if (!isSufficientStock) {
      // Requested more than available
      return (
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 text-[10px] px-1.5 py-0.5 h-5 gap-1 cursor-pointer hover:bg-amber-100"
          onClick={handleInventoryClick}
          title="Click to check details in Inventory"
        >
          <Package className="h-3 w-3" />
          {stockAvailable}/{requestedQuantity} {stockUnit}
        </Badge>
      );
    }

    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-1.5 py-0.5 h-5 gap-1 cursor-pointer hover:opacity-80 transition-opacity",
          isLowStock
            ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800"
            : "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
        )}
        onClick={handleInventoryClick}
        title="Click to check details in Inventory"
      >
        <Package className="h-3 w-3" />
        {stockAvailable} {stockUnit}
      </Badge>
    );
  };



  const isManager = userRole === ROLES.MANAGER;
  const isSiteEngineer = userRole === ROLES.SITE_ENGINEER;
  const isPurchaseOfficer = userRole === ROLES.PURCHASE_OFFICER;
  const canMarkDelivery =
    isSiteEngineer && request?.status === "delivery_stage" && request?.createdBy;

  // Simplified mobile-first layout for site engineers
  const isMobileLayout = isSiteEngineer;

  // Manager permissions based on pending items or ability to modify existing items
  const canManagerModifyStatus = (status: string) => {
    return ["pending", "approved", "recheck", "ready_for_cc", "cc_pending", "cc_approved", "pending_po", "sign_pending", "sign_rejected", "rejected_po", "ordered", "partially_processed", "direct_po"].includes(status);
  };

  // Get pending items for manager actions
  const pendingItems = allRequests?.filter((item) => item.status === "pending") || [];
  const signPendingItems = allRequests?.filter((item) => item.status === "sign_pending") || [];
  const hasMultiplePendingItems = pendingItems.length > 1;

  // Merged CC items — used to show single Review CC button across all cc_pending items
  const allCCStatusItems = allRequests?.filter(i => ["cc_pending", "cc_approved", "cc_rejected", "ready_for_po"].includes(i.status as string)) || [];
  const firstCCItemIdGlobal = allCCStatusItems[0]?._id;
  const allCCIdsGlobal = allCCStatusItems.map(i => i._id);

  // Manager permissions based on pending items
  const canApprove = isManager && (pendingItems.length > 0 || signPendingItems.length > 0 || selectedItemsForAction.size > 0);
  const canReject = isManager && (pendingItems.length > 0 || signPendingItems.length > 0 || selectedItemsForAction.size > 0);

  // Helper function to calculate delivery tracking data for an item
  // This finds related items (same itemName) that are in delivery/delivered states
  const getDeliveryTrackingData = (itemName: string, currentQuantity: number, unit: string) => {
    if (!allRequests) return { alreadyDelivered: 0, originalRequested: currentQuantity };

    // Find all items with the same itemName
    const relatedItems = allRequests.filter(
      r => r.itemName.toLowerCase() === itemName.toLowerCase()
    );

    // Calculate already delivered (items in delivery stages)
    const deliveryStatuses = ["ready_for_delivery", "delivery_processing", "delivery_stage", "delivered"];
    const deliveredItems = relatedItems.filter(r => deliveryStatuses.includes(r.status));
    const alreadyDelivered = deliveredItems.reduce((sum, item) => sum + item.quantity, 0);

    // Calculate total original requested (sum of all related items)
    const originalRequested = relatedItems.reduce((sum, item) => sum + item.quantity, 0);

    return { alreadyDelivered, originalRequested };
  };

  // Enhanced function to prepare bulk delivery items with tracking data
  const prepareBulkDeliveryItems = (poItems: any[]) => {
    return poItems.map((po: any) => {
      const itemName = po.itemName || po.itemDescription?.split('\n')[0] || "Item";
      const requestedQuantity = po.requestQuantity || po.quantity;
      const unit = po.requestUnit || po.unit;
      const trackingData = getDeliveryTrackingData(itemName, requestedQuantity, unit);

      return {
        requestId: po.requestId,
        itemName: itemName,
        requestedQuantity: requestedQuantity,
        unit: unit,
        poQuantity: po.quantity || po.requestQuantity,
        itemOrder: po.itemOrder,
        alreadyDelivered: trackingData.alreadyDelivered,
        originalRequested: trackingData.originalRequested,
      };
    });
  };

  // Check if all items in the request have the same status
  const allItemsHaveSameStatus = allRequests && allRequests.length > 0
    ? allRequests.every((item) => item.status === allRequests[0].status)
    : true;

  // Determine overall request status
  const getOverallStatus = () => {
    if (allItemsHaveSameStatus) {
      return allRequests?.[0]?.status || request?.status;
    }

    // Check if we have mixed processed statuses (not pending/draft)
    const processedStatuses = allRequests?.filter(item =>
      !["pending", "draft"].includes(item.status)
    ) || [];

    if (processedStatuses.length > 0 && processedStatuses.length < (allRequests?.length || 0)) {
      // Some items processed, some still pending - partially processed
      return "partially_processed";
    }

    // All items are pending/draft or truly mixed
    return request?.status;
  };

  const overallStatus = getOverallStatus();

  // Collect all photos from all request items (support both photo and photos fields)
  const allPhotos = allRequests?.reduce((photos, item) => {
    // Check for new photos array first
    if (item.photos && item.photos.length > 0) {
      item.photos.forEach((photo, index) => {
        photos.push({
          imageUrl: photo.imageUrl,
          imageKey: photo.imageKey,
          alt: `${item.itemName} - ${item.quantity} ${item.unit} (Photo ${index + 1})`
        });
      });
    }
    // Fallback to legacy photo field
    else if ((item as any).photo) {
      const legacyPhoto = (item as any).photo;
      photos.push({
        imageUrl: legacyPhoto.imageUrl,
        imageKey: legacyPhoto.imageKey,
        alt: `${item.itemName} - ${item.quantity} ${item.unit}`
      });
    }
    return photos;
  }, [] as Array<{ imageUrl: string; imageKey: string; alt: string }>) || [];

  // Reset when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setItemRejectionReasons({});
      setShowItemRejectionInput(null);
      setSelectedItemsForAction(new Set());
      // Don't reset viewMode - let it persist from cookie/user choice
      setItemActions({});
      setShowBatchProcessDialog(false);
      setShowApproveConfirm(false);
      setShowDirectPOConfirm(false);
      setShowItemApproveConfirm(null);
      setShowItemDirectPOConfirm(null);
      setShowBulkSplitConfirm(false);
      setRejectionReason("");
      setShowRejectionInput(false);
      hasRefreshedRef.current = false;
    }
  }, [open]);

  // Refresh data after successful action (Convex does this automatically)
  const closeAndRefresh = () => {
    // onOpenChange(false); // User requested to keep dialog open
    // Data will refresh automatically through Convex queries
  };

  // Per-item handlers
  const handleItemApprove = async (itemId: Id<"requests">) => {
    setIsLoading(true);
    const intents = itemIntents[itemId] || [];

    try {
      if (intents.includes("direct_po")) {
        await updateStatus({
          requestId: itemId,
          status: "direct_po",
        });
        toast.success("Item marked for Direct PO");
      } else if (intents.includes("direct_delivery")) {
        await updateStatus({
          requestId: itemId,
          status: "delivery_stage",
        });
        toast.success("Item sent to Out for Delivery");
      } else if (intents.includes("split") || (intents.includes("direct_po") && intents.includes("direct_delivery"))) {
        await updateStatus({
          requestId: itemId,
          status: "recheck", // Start recheck/split flow
        });
        toast.info("Item marked for Recheck/Split");
      } else {
        await updateStatus({
          requestId: itemId,
          status: "approved",
        });
        toast.success("Item approved successfully");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to approve item");
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemReject = async (itemId: Id<"requests">) => {
    const reason = itemRejectionReasons[itemId]?.trim();
    if (!reason) {
      toast.error("Please provide a rejection reason");
      return;
    }

    const item = allRequests?.find(r => r._id === itemId);
    if (!item) return;

    setIsLoading(true);
    try {
      if (item.status === "sign_pending") {
        await rejectDirectPO({ requestId: itemId, reason });
      } else {
        await updateStatus({
          requestId: itemId,
          status: "rejected",
          rejectionReason: reason,
        });
      }
      toast.success("Item rejected");
      setItemRejectionReasons((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setShowItemRejectionInput(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to reject item");
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemDirectPO = async (itemId: Id<"requests">) => {
    setIsLoading(true);
    try {
      await updateStatus({
        requestId: itemId,
        status: "direct_po",
      });
      toast.success("Item marked for Direct PO");
    } catch (error: any) {
      toast.error(error.message || "Failed to mark for Direct PO");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItemSelection = (itemId: Id<"requests">) => {
    const newSelected = new Set(selectedItemsForAction);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      // Check for vendor mismatch for ready_for_po items
      const itemToSelect = allRequests?.find(r => r._id === itemId);
      if (itemToSelect?.status === "ready_for_po") {
        const selectedPOItems = Array.from(newSelected).map(id => allRequests?.find(r => r._id === id)).filter(r => r?.status === "ready_for_po");
        if (selectedPOItems.length > 0) {
          const firstVendor = (selectedPOItems[0] as any)?.selectedVendorId;
          if ((itemToSelect as any).selectedVendorId !== firstVendor) {
            toast.error("Cannot select items with different vendors for PO creation.");
            return;
          }
        }
      }
      newSelected.add(itemId);
    }
    setSelectedItemsForAction(newSelected);
  };

  const selectAllPending = () => {
    const allProcessableIds = pendingItems.length > 0
      ? pendingItems.map(item => item._id)
      : signPendingItems.map(item => item._id);
    setSelectedItemsForAction(new Set(allProcessableIds));
  };

  const deselectAll = () => {
    setSelectedItemsForAction(new Set());
  };

  // Batch processing helpers
  const setItemAction = (itemId: Id<"requests">, action: "approve" | "reject" | "direct_po" | null) => {
    setItemActions(prev => ({
      ...prev,
      [itemId]: action
    }));
  };

  const toggleIntent = (itemId: Id<"requests">, intent: string, defaultIntents: string[] = []) => {
    setItemIntents(prev => {
      // If no previous intent exists, start from defaults
      // If previous intent exists (even empty array), use that
      const hasExistingIntent = prev[itemId] !== undefined;
      const current = hasExistingIntent ? prev[itemId] : [...defaultIntents];
      const isSelected = current.includes(intent);

      let updated: string[];

      if (isSelected) {
        // If unselecting, remove it
        updated = current.filter(i => i !== intent);
      } else {
        // If selecting, add it (allow any combination)
        updated = [...current, intent];
      }

      // Sync with selection state
      setSelectedItemsForAction(prevSelected => {
        const newSet = new Set(prevSelected);
        if (updated.length > 0) {
          newSet.add(itemId);
        } else if (defaultIntents.length === 0) {
          // Only remove from selection if there were no defaults
          // (meaning the item has no pre-existing permissions)
          newSet.delete(itemId);
        }
        return newSet;
      });

      // If the updated array matches defaults exactly, remove from state
      // to rely on defaults for rendering (cleaner state)
      if (updated.length === 0 && defaultIntents.length === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [itemId]: updated
      };
    });
  };

  const wrapHandler = (handler: () => Promise<void>) => async () => {
    try {
      await handler();
    } catch (error: any) {
      console.error(error);
    }
  };

  // Grant permission to a recheck item (called after user confirms)
  const handleGrantPermission = async () => {
    if (!showPermissionConfirm) return;

    const { itemId, permission } = showPermissionConfirm;
    const item = allRequests?.find(r => r._id === itemId);
    if (!item) return;

    setIsLoading(true);
    try {
      // Determine the new directAction based on current + new permission
      const currentAction = item.directAction || "";
      let newDirectAction: string | undefined = undefined;
      let newIsSplitApproved = item.isSplitApproved || false;

      if (permission === "split") {
        newIsSplitApproved = true;
        // If already has PO or Delivery, combine with split
        if (currentAction === "po") {
          newDirectAction = "split_po";
        } else if (currentAction === "delivery") {
          newDirectAction = "split_delivery";
        } else if (currentAction === "all") {
          newDirectAction = "split_po_delivery";
        }
      } else if (permission === "po") {
        if (newIsSplitApproved && (currentAction === "delivery" || currentAction === "all")) {
          newDirectAction = "split_po_delivery";
        } else if (newIsSplitApproved) {
          newDirectAction = "split_po";
        } else if (currentAction === "delivery") {
          newDirectAction = "all";
        } else {
          newDirectAction = "po";
        }
      } else if (permission === "delivery") {
        if (newIsSplitApproved && (currentAction === "po" || currentAction === "all")) {
          newDirectAction = "split_po_delivery";
        } else if (newIsSplitApproved) {
          newDirectAction = "split_delivery";
        } else if (currentAction === "po") {
          newDirectAction = "all";
        } else {
          newDirectAction = "delivery";
        }
      }

      await updateRequestDetails({
        requestId: itemId,
        isSplitApproved: newIsSplitApproved,
        directAction: newDirectAction
      });

      toast.success(`${showPermissionConfirm.permissionLabel} permission granted!`);
      setShowPermissionConfirm(null);
    } catch (error: any) {
      toast.error("Failed to grant permission: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ... (keeping other helpers) ...

  const handleApproveAll = async () => {
    // 1. Determine items to process
    const itemsToProcess = selectedItemsForAction.size > 0
      ? Array.from(selectedItemsForAction)
      : (pendingItems.length > 0 ? pendingItems.map(i => i._id) : signPendingItems.map(i => i._id));

    if (itemsToProcess.length === 0) return;

    setIsLoading(true);
    try {
      const promises = [];

      // Group items by their INTENT
      const simpleDirectPOIds: Id<"requests">[] = [];
      const simpleDirectDeliveryIds: Id<"requests">[] = [];
      const complexHandlingIds: Id<"requests">[] = [];
      const complexUpdates: Promise<any>[] = [];
      const signApproveIds: Id<"requests">[] = [];

      itemsToProcess.forEach(id => {
        const item = allRequests?.find(r => r._id === id);
        if (!item) return;

        if (item.status === "sign_pending" || item.status === "sign_rejected") {
          signApproveIds.push(id);
          return;
        }

        const userIntents = itemIntents[id];
        let intents: string[] = [];
        if (userIntents !== undefined) {
          intents = userIntents;
        } else {
          if (item.status === "direct_po" || item.directAction === "po" || item.directAction === "all") intents.push("direct_po");
          if (item.status === "delivery_stage" || item.directAction === "delivery" || item.directAction === "all") intents.push("direct_delivery");
          if (item.isSplitApproved) intents.push("split");
        }

        // Classification: Handle ALL permission combinations
        const isPO = intents.includes("direct_po");
        const isDelivery = intents.includes("direct_delivery");
        const isSplit = intents.includes("split");

        // Build directAction based on selected permissions
        let directAction: "all" | "po" | "delivery" | "po_delivery" | "split_po" | "split_delivery" | "split_po_delivery" | undefined = undefined;

        if (isSplit && isPO && isDelivery) {
          directAction = "split_po_delivery" as any; // All three
        } else if (isSplit && isPO) {
          directAction = "split_po" as any;
        } else if (isSplit && isDelivery) {
          directAction = "split_delivery" as any;
        } else if (isPO && isDelivery) {
          directAction = "all"; // PO + Delivery
        } else if (isSplit) {
          directAction = undefined; // Split only uses isSplitApproved
        } else if (isPO) {
          directAction = "po";
        } else if (isDelivery) {
          directAction = "delivery";
        }

        complexUpdates.push(updateRequestDetails({
          requestId: id,
          isSplitApproved: isSplit,
          directAction: directAction
        }));
        complexHandlingIds.push(id);
      });

      // Execute Mutations

      // 1. Sign Pending
      if (signApproveIds.length > 0) {
        promises.push(Promise.all(signApproveIds.map(id => approveDirectPO({ requestId: id as Id<"requests"> }))));
      }

      // 2. Simple Direct PO
      if (simpleDirectPOIds.length > 0) {
        promises.push(bulkUpdateStatus({
          requestIds: simpleDirectPOIds,
          status: "direct_po",
        }));
      }

      // 3. Simple Direct Delivery
      if (simpleDirectDeliveryIds.length > 0) {
        promises.push(bulkUpdateStatus({
          requestIds: simpleDirectDeliveryIds,
          status: "delivery_stage",
        }));
      }

      // 4. Complex (Split/Mixed)
      // 4. Complex (Split/Mixed)
      if (complexUpdates.length > 0) {
        await Promise.all(complexUpdates);
      }

      if (complexHandlingIds.length > 0) {
        promises.push(bulkUpdateStatus({
          requestIds: complexHandlingIds,
          status: "recheck", // Move to recheck for split processing
        }));
      }

      await Promise.all(promises);
      toast.success(`${itemsToProcess.length} items processed`);
      setSelectedItemsForAction(new Set());
      setItemIntents({});
      setShowSignPendingApproveConfirm(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to approve items");
    } finally {
      setIsLoading(false);
    }
  };

  const getItemAction = (itemId: Id<"requests">) => {
    return itemActions[itemId] || null;
  };

  const clearItemActions = () => {
    setItemActions({});
    setItemRejectionReasons({});
  };

  const getBatchSummary = () => {
    const actions = Object.values(itemActions).filter(action => action !== null);
    const summary = {
      approve: actions.filter(a => a === "approve").length,
      reject: actions.filter(a => a === "reject").length,
      direct_po: actions.filter(a => a === "direct_po").length,
    };
    return summary;
  };

  // Bulk handlers for all items


  const handleDirectPOAll = async () => {
    const itemsToDirectPO = selectedItemsForAction.size > 0
      ? Array.from(selectedItemsForAction)
      : pendingItems.map((item) => item._id);

    if (itemsToDirectPO.length === 0) {
      toast.error("No items selected to mark as Ready for CC");
      return;
    }

    setIsLoading(true);
    try {
      await bulkUpdateStatus({
        requestIds: itemsToDirectPO,
        status: "direct_po",
      });
      toast.success(`${itemsToDirectPO.length} item(s) marked for Direct PO`);
      setSelectedItemsForAction(new Set()); // Clear selection after action
      closeAndRefresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to mark items for Direct PO");
    } finally {
      setIsLoading(false);
    }
  };



  // Mixed batch processing - handle different actions for different items
  const handleBatchProcessItems = async () => {
    const itemsToProcess = Object.entries(itemActions).filter(([_, action]) => action !== null);

    if (itemsToProcess.length === 0) {
      toast.error("No actions assigned to selected items");
      return;
    }

    // Check if any rejections need reasons
    const rejectionItems = itemsToProcess.filter(([_, action]) => action === "reject");
    const missingReasons = rejectionItems.filter(([itemId]) => !itemRejectionReasons[itemId]?.trim());

    if (missingReasons.length > 0) {
      toast.error("Please provide rejection reasons for all items being rejected");
      return;
    }

    setIsLoading(true);
    try {
      // Group items by action
      const approveItems = itemsToProcess.filter(([_, action]) => action === "approve").map(([id]) => id as Id<"requests">);
      const rejectItems = itemsToProcess.filter(([_, action]) => action === "reject").map(([id]) => id as Id<"requests">);
      const directPOItems = itemsToProcess.filter(([_, action]) => action === "direct_po").map(([id]) => id as Id<"requests">);

      // Execute actions
      const promises = [];

      if (approveItems.length > 0) {
        promises.push(
          bulkUpdateStatus({
            requestIds: approveItems,
            status: "approved",
          })
        );
      }

      if (rejectItems.length > 0) {
        promises.push(
          bulkUpdateStatus({
            requestIds: rejectItems,
            status: "rejected",
            rejectionReason: rejectItems.map(id => itemRejectionReasons[id]?.trim()).join("; "),
          })
        );
      }

      if (directPOItems.length > 0) {
        promises.push(
          bulkUpdateStatus({
            requestIds: directPOItems,
            status: "direct_po",
          })
        );
      }

      await Promise.all(promises);

      const totalProcessed = approveItems.length + rejectItems.length + directPOItems.length;
      toast.success(`${totalProcessed} item(s) processed successfully`);

      // Clear state
      setItemActions({});
      setItemRejectionReasons({});
      setSelectedItemsForAction(new Set());
      setShowBatchProcessDialog(false);
      // Keep dialog open as requested
    } catch (error: any) {
      toast.error(error.message || "Failed to process items");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!requestId) return;

    setIsLoading(true);
    try {
      await updateStatus({
        requestId,
        status: "approved",
      });
      toast.success("Request approved successfully");
      // Keep dialog open
    } catch (error: any) {
      toast.error(error.message || "Failed to approve request");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDirectPO = async () => {
    if (!requestId) return;

    setIsLoading(true);
    try {
      await updateStatus({
        requestId,
        status: "direct_po",
      });
      toast.success("Request marked for Direct PO");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to mark for Direct PO");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!requestId) return;

    if (!rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }

    setIsLoading(true);
    try {
      await updateStatus({
        requestId,
        status: "rejected",
        rejectionReason: rejectionReason.trim(),
      });
      toast.success("Request rejected");
      setRejectionReason("");
      setShowRejectionInput(false);
      // Keep dialog open
    } catch (error: any) {
      toast.error(error.message || "Failed to reject request");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkDelivery = async () => {
    if (!requestId) return;

    setIsLoading(true);
    try {
      await markDelivery({ requestId });
      toast.success("Request marked as delivered");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to mark delivery");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenInMap = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
    window.open(mapUrl, '_blank');
  };





  if (!request) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; color: string; dot: string; icon?: any; border: string }> = {
      draft: { label: "Draft", color: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700", dot: "bg-slate-500", icon: Pencil, border: "border-slate-400" },
      pending: { label: "Pending", color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800", dot: "bg-amber-500 animate-pulse", icon: Clock, border: "border-amber-400" },
      approved: { label: "Approved", color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-800", dot: "bg-blue-500", icon: CheckCircle, border: "border-blue-500" },
      rejected: { label: "Rejected", color: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-400 dark:border-rose-800", dot: "bg-rose-500", icon: XCircle, border: "border-rose-500" },
      recheck: { label: "Recheck", color: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-400 dark:border-indigo-800", dot: "bg-indigo-500", icon: Loader2, border: "border-indigo-500" },
      ready_for_cc: { label: "Ready for CC", color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-800", dot: "bg-blue-500", icon: Loader2, border: "border-blue-500" },
      cc_pending: { label: "CC Pending", color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-400 dark:border-purple-800", dot: "bg-purple-500", icon: Loader2, border: "border-purple-500" },
      cc_rejected: { label: "CC Rejected", color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-400 dark:border-red-800", dot: "bg-red-500", icon: XCircle, border: "border-red-500" },
      ready_for_po: { label: "Ready for PO", color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-800", dot: "bg-emerald-500", icon: ShoppingCart, border: "border-emerald-500" },
      sign_pending: { label: "Sign Pending", color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800", dot: "bg-amber-500", icon: Clock, border: "border-amber-400" },
      sign_rejected: { label: "Sign Rejected", color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-400 dark:border-red-800", dot: "bg-red-500", icon: XCircle, border: "border-red-500" },
      pending_po: { label: "Pending PO", color: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-800", dot: "bg-orange-500", icon: ShoppingCart, border: "border-orange-500" },
      ready_for_delivery: { label: "Ready for Delivery", color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-800", dot: "bg-emerald-500", icon: Package, border: "border-emerald-500" },
      out_for_delivery: { label: "Out for Delivery", color: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-800", dot: "bg-orange-500 animate-pulse", icon: Truck, border: "border-orange-500" },
      delivery_stage: { label: "Out for Delivery", color: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-400 dark:border-sky-800", dot: "bg-sky-500 animate-pulse", icon: Truck, border: "border-sky-500" },
      delivery_processing: { label: "Out for Delivery", color: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-400 dark:border-sky-800", dot: "bg-sky-500 animate-pulse", icon: Truck, border: "border-sky-500" },
      delivered: { label: "Delivered", color: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-400 dark:border-sky-800", dot: "bg-sky-500", icon: CheckCircle, border: "border-sky-500" },
    };

    const config = statusConfig[status] || {
      label: status.replace(/_/g, " "),
      color: "bg-slate-100 text-slate-700 dark:bg-slate-800",
      dot: "bg-slate-400 dark:bg-slate-600",
      icon: Loader2,
      border: "border-slate-400"
    };

    if (userRole === ROLES.MANAGER || userRole === ROLES.PURCHASE_OFFICER) {
      return (
        <Badge variant="outline" className={cn("gap-1.5 pl-1.5 pr-2.5 py-0.5 border shadow-none text-[10px] font-bold uppercase tracking-tight", config.color)}>
          <div className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
          {config.label}
        </Badge>
      );
    }

    const Icon = config.icon || Loader2;
    return (
      <Badge variant="outline" className={cn("gap-1.5 pl-1.5 pr-2.5 py-0.5 border shadow-none text-[10px] font-bold uppercase tracking-tight", config.color)}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getStatusBorderClass = (status: string) => {
    const mapping: Record<string, string> = {
      draft: "border-slate-400 dark:border-slate-500",
      pending: "border-amber-400 dark:border-amber-500",
      sign_pending: "border-amber-400 dark:border-amber-500",
      approved: "border-blue-500 dark:border-blue-400",
      ready_for_cc: "border-blue-500 dark:border-blue-400",
      cc_pending: "border-purple-500 dark:border-purple-400",
      sign_rejected: "border-red-500 dark:border-red-400",
      rejected: "border-rose-500 dark:border-rose-400",
      cc_rejected: "border-rose-500 dark:border-rose-400",
      po_rejected: "border-rose-500 dark:border-rose-400",
      recheck: "border-indigo-500 dark:border-indigo-400",
      pending_po: "border-orange-500 dark:border-orange-400",
      ready_for_delivery: "border-emerald-500 dark:border-emerald-400",
      out_for_delivery: "border-orange-500 dark:border-orange-400",
      delivered: "border-sky-500 dark:border-sky-400",
      ready_for_po: "border-emerald-500 dark:border-emerald-400"
    };
    return mapping[status] || "border-slate-400 dark:border-slate-500";
  };

  const getStatusBgTint = (status: string) => {
    const mapping: Record<string, string> = {
      // Gray
      draft: "bg-slate-50/80 dark:bg-slate-900/20 hover:bg-slate-100/50 dark:hover:bg-slate-900/40",

      // Amber/Yellow
      pending: "bg-amber-50/80 dark:bg-amber-950/20 hover:bg-amber-100/50 dark:hover:bg-amber-950/40",
      sign_pending: "bg-amber-50/80 dark:bg-amber-950/20 hover:bg-amber-100/50 dark:hover:bg-amber-950/40",
      partially_processed: "bg-yellow-50/80 dark:bg-yellow-900/20 hover:bg-yellow-100/50 dark:hover:bg-yellow-950/40",

      // Emerald/Green
      approved: "bg-emerald-50/80 dark:bg-emerald-950/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/40",
      ready_for_delivery: "bg-emerald-50/80 dark:bg-emerald-950/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/40",
      delivered: "bg-green-50/80 dark:bg-green-950/20 hover:bg-green-100/50 dark:hover:bg-green-950/40",

      // Red/Rose
      rejected: "bg-rose-50/80 dark:bg-rose-950/20 hover:bg-rose-100/50 dark:hover:bg-rose-950/40",
      sign_rejected: "bg-rose-50/80 dark:bg-rose-950/20 hover:bg-rose-100/50 dark:hover:bg-rose-950/40",
      cc_rejected: "bg-rose-50/80 dark:bg-rose-950/20 hover:bg-rose-100/50 dark:hover:bg-rose-950/40",
      rejected_po: "bg-rose-50/80 dark:bg-rose-950/20 hover:bg-rose-100/50 dark:hover:bg-rose-950/40",

      // Indigo
      recheck: "bg-indigo-50/80 dark:bg-indigo-950/20 hover:bg-indigo-100/50 dark:hover:bg-indigo-950/40",

      // Blue
      ready_for_cc: "bg-blue-50/80 dark:bg-blue-950/20 hover:bg-blue-100/50 dark:hover:bg-blue-950/40",

      // Purple
      cc_pending: "bg-purple-50/80 dark:bg-purple-950/20 hover:bg-purple-100/50 dark:hover:bg-purple-950/40",
      cc_approved: "bg-purple-50/80 dark:bg-purple-950/20 hover:bg-purple-100/50 dark:hover:bg-purple-950/40",

      // Emerald (Ready for PO)
      ready_for_po: "bg-emerald-50/80 dark:bg-emerald-950/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/40",

      // Orange
      pending_po: "bg-orange-50/80 dark:bg-orange-950/20 hover:bg-orange-100/50 dark:hover:bg-orange-950/40",
      direct_po: "bg-orange-50/80 dark:bg-orange-950/20 hover:bg-orange-100/50 dark:hover:bg-orange-950/40",

      // Sky
      out_for_delivery: "bg-sky-50/80 dark:bg-sky-950/20 hover:bg-sky-100/50 dark:hover:bg-sky-950/40",
      delivery_processing: "bg-sky-50/80 dark:bg-sky-950/20 hover:bg-sky-100/50 dark:hover:bg-sky-950/40",
      delivery_stage: "bg-sky-50/80 dark:bg-sky-950/20 hover:bg-sky-100/50 dark:hover:bg-sky-950/40",
    };
    return mapping[status] || "bg-card hover:bg-accent/50 dark:bg-slate-900/40";
  };

  const RenderActionSegments = ({ item, isCard = false, mergedCCIds, showMergedCCButton = true }: { item: any; isCard?: boolean; mergedCCIds?: string[]; showMergedCCButton?: boolean }) => {
    const status = Array.isArray(inventoryStatus)
      ? inventoryStatus.find((s: any) => s.requestedName === item.itemName)
      : (inventoryStatus as any)?.[item.itemName];
    const stock = status?.centralStock || 0;
    const isPartial = stock > 0 && stock < item.quantity;
    const hasIntent = itemIntents[item._id] && itemIntents[item._id].length > 0;

    // Prioritize user's immediate selection (intent) over the stored status
    // If user has selected an intent, ignore the current status for visualization
    const directAction = item.directAction || "";

    const isPending = item.status === "pending";
    const isRecheck = item.status === "recheck";

    // For pending items, only show selections from user intent (not from stale directAction)
    // For recheck items, show existing approved permissions
    const isDirectDeliverySelected = hasIntent
      ? itemIntents[item._id].includes("direct_delivery")
      : (!isPending && (item.status === "delivery_stage" || ["all", "delivery", "split_delivery", "split_po_delivery"].includes(directAction)));

    const isDirectPOSelected = hasIntent
      ? itemIntents[item._id].includes("direct_po")
      : (!isPending && (item.status === "direct_po" || ["all", "po", "split_po", "split_po_delivery"].includes(directAction)));

    const isSplitSelected = hasIntent
      ? itemIntents[item._id].includes("split")
      : (!isPending && item.isSplitApproved === true);

    // Determine which permissions are already "locked" (approved previously)
    // If directAction is set and we are on recheck, those permissions are locked
    const lockedDelivery = isRecheck && ["all", "delivery", "split_delivery", "split_po_delivery"].includes(directAction);
    const lockedPO = isRecheck && ["all", "po", "split_po", "split_po_delivery"].includes(directAction);
    const lockedSplit = isRecheck && item.isSplitApproved === true;

    // canModify means user can interact with buttons
    const canModify = isPending || isRecheck || item.status === "rejected" || item.status === "sign_rejected" || item.status === "cc_rejected" || ["direct_po", "pending_po", "delivery_stage", "ready_for_po"].includes(item.status);

    // Dynamic border color based on selection - show gradient for multiple selections
    const getSegmentBorder = () => {
      const selectedCount = [isDirectDeliverySelected, isDirectPOSelected, isSplitSelected].filter(Boolean).length;
      if (selectedCount >= 2) return "border-gradient-to-r from-purple-500 via-blue-500 to-orange-500 shadow-[0_0_20px_rgba(147,51,234,0.4)]";
      if (isDirectDeliverySelected) return "border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]";
      if (isSplitSelected) return "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]";
      if (isDirectPOSelected) return "border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]";
      if (!canModify) return "border-border/40 opacity-50";
      return "border-transparent bg-muted/40 hover:bg-muted/60";
    };

    // Defaults are only used for items that are ALREADY approved (on recheck)
    // For pending items, always start fresh with no defaults
    const defaults: string[] = [];
    if (isRecheck) {
      if (["po", "all", "split_po", "split_po_delivery"].includes(directAction)) defaults.push("direct_po");
      if (["delivery", "all", "split_delivery", "split_po_delivery"].includes(directAction)) defaults.push("direct_delivery");
      if (item.isSplitApproved) defaults.push("split");
    }

    // isLocked returns true if a specific permission is already approved and cannot be changed
    const isLocked = (permission: "delivery" | "po" | "split") => {
      if (permission === "delivery") return lockedDelivery;
      if (permission === "po") return lockedPO;
      if (permission === "split") return lockedSplit;
      return false;
    };

    // For ready_for_po items, show Create PO button
    if (item.status === "ready_for_po") {
      return (
        <div className={cn("flex gap-2", isCard ? "w-full flex-col" : "items-center")}>
          {onCreatePO && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                if (onCreatePO) onCreatePO([item._id]);
              }}
              className={cn(
                "bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm w-full"
              )}
            >
              <ShoppingCart className="h-4 w-4 mr-2" /> Create PO
            </Button>
          )}
          {(onOpenCC || onCheck) && (
            <Button size="sm" variant="outline" onClick={(e) => {
              e.stopPropagation();
              const ccSiblings = (allRequests || []).filter(i => ["cc_pending", "cc_approved", "cc_rejected", "ready_for_po"].includes(i.status as string));
              const allCCIds = ccSiblings.map(i => i._id);
              onOpenCC?.(item._id, allCCIds.length > 1 ? allCCIds : undefined) ?? onCheck?.(item._id);
            }} className={cn("h-9 border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/30", isCard ? "w-full" : "")}>
              <Layers className="h-4 w-4 mr-1.5" /> View CC
            </Button>
          )}
        </div>
      );
    }

    // For ready_for_cc items, show Create CC button (Purchase Officer only)
    if (isPurchaseOfficer && item.status === "ready_for_cc") {
      return (
        <div className={cn("flex items-center gap-2", isCard ? "w-full" : "")}>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenCC) onOpenCC(item._id);
            }}
            className={cn(
              "bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-sm",
              isCard ? "flex-1" : ""
            )}
          >
            <FileText className="h-4 w-4 mr-2" /> Create CC
          </Button>
        </div>
      );
    }

    // For cc_pending items
    if (item.status === "cc_pending") {
      // Non-first item in a merged CC — show nothing (handled by first item's button)
      if (!showMergedCCButton && mergedCCIds && mergedCCIds.length > 1) {
        return null;
      }
      return (
        <div className={cn("flex gap-2", isCard ? "w-full flex-col" : "items-center")}>
          {isManager && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCC) {
                  const ccSiblings = mergedCCIds && mergedCCIds.length > 1
                    ? mergedCCIds
                    : (allRequests || []).filter(i => ["cc_pending", "cc_approved", "cc_rejected", "ready_for_po"].includes(i.status as string)).map(i => i._id);
                  onOpenCC(item._id, ccSiblings.length > 1 ? ccSiblings as any : undefined);
                }
              }}
              className={cn(
                "bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-sm w-full"
              )}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {mergedCCIds && mergedCCIds.length > 1 ? `Review CC (${mergedCCIds.length} items)` : "Review CC"}
            </Button>
          )}
          {(onOpenCC || onCheck) && !isManager && (
            <Button size="sm" variant="outline" onClick={(e) => {
              e.stopPropagation();
              const ccSiblings = mergedCCIds && mergedCCIds.length > 1 ? mergedCCIds
                : (allRequests || []).filter(i => ["cc_pending", "cc_approved", "cc_rejected", "ready_for_po"].includes(i.status as string)).map(i => i._id);
              onOpenCC?.(item._id, ccSiblings.length > 1 ? ccSiblings as any : undefined) ?? onCheck?.(item._id);
            }} className={cn("h-9 border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/30", isCard ? "w-full" : "")}>
              <Layers className="h-4 w-4 mr-1.5" /> View CC
            </Button>
          )}
        </div>
      );
    }

    // For cc_rejected items
    if (item.status === "cc_rejected") {
      return (
        <div className={cn("flex gap-2", isCard ? "w-full flex-col" : "items-center")}>
          {isPurchaseOfficer && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCC) onOpenCC(item._id);
              }}
              className={cn(
                "bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-sm w-full"
              )}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Resubmit CC
            </Button>
          )}
          {(onOpenCC || onCheck) && (
            <Button size="sm" variant="outline" onClick={(e) => {
              e.stopPropagation();
              const ccSiblings = (allRequests || []).filter(i => ["cc_pending", "cc_approved", "cc_rejected", "ready_for_po"].includes(i.status as string));
              const allCCIds = ccSiblings.map(i => i._id);
              onOpenCC?.(item._id, allCCIds.length > 1 ? allCCIds : undefined) ?? onCheck?.(item._id);
            }} className={cn("h-9 border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/30", isCard ? "w-full" : "")}>
              <Layers className="h-4 w-4 mr-1.5" /> View CC
            </Button>
          )}
        </div>
      );
    }

    // For approved/recheck items, show Check/Split button (Purchase Officer only)
    if (isPurchaseOfficer && ["approved", "recheck"].includes(item.status)) {
      return (
        <div className={cn("flex items-center gap-2", isCard ? "w-full" : "")}>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (onCheck) onCheck(item._id);
            }}
            className={cn(
              "bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm",
              isCard ? "w-full" : ""
            )}
          >
            <Sparkles className="h-4 w-4 mr-2" /> Check/Split
          </Button>
        </div>
      );
    }

    // Special handling for Pending PO: Show Available button ONLY (and PDF if available)
    // Available button is only for Purchase Officers, not Managers
    if (item.status === "pending_po") {
      const poNumber = requestToPONumber.get(item._id);
      return (
        <div className={cn("flex gap-2", isCard ? "w-full flex-col" : "items-center")}>
          <div className="flex w-full gap-2">
            {isPurchaseOfficer && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditQuantityItem({
                    id: item._id,
                    quantity: item.quantity,
                    name: item.itemName,
                    unit: item.unit
                  });
                }}
                className={cn(
                  "bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm flex-1",
                  isCard ? "w-full" : "w-auto"
                )}
              >
                <CheckCircle className="h-4 w-4 mr-2" /> Available
              </Button>
            )}
            {(isPurchaseOfficer || isManager) && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setSplitPOQuantityItem({
                    id: item._id,
                    quantity: item.quantity,
                    name: item.itemName,
                    unit: item.unit
                  });
                }}
                className="px-3 border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/30"
                title="Edit PO Quantity (vendor can't supply full amount)"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {poNumber && ["sign_pending", "sign_rejected", "pending_po", "ready_for_delivery"].includes(item.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setPdfPreviewPoNumber(poNumber);
                }}
                className="px-3 border-slate-200 text-slate-600 hover:bg-slate-50"
                title="PO View"
              >
                <FileText className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      );
    }

    // Special handling for Ready for Delivery: Show Create DC button only
    if (item.status === "ready_for_delivery") {
      const poNumber = requestToPONumber.get(item._id);
      return (
        <div className={cn("flex items-center gap-2", isCard ? "w-full" : "")}>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              // Select this item and open DC dialog
              setSelectedDCItems(new Set([item._id]));
              setShowBulkDCDialog(true);
            }}
            className={cn(
              "bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm",
              isCard ? "flex-1" : ""
            )}
          >
            <Truck className="h-4 w-4 mr-2" /> Create DC
          </Button>
          {poNumber && ["sign_pending", "sign_rejected", "pending_po", "ready_for_delivery"].includes(item.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setPdfPreviewPoNumber(poNumber);
              }}
              className="h-9 border-muted-foreground/20 hover:bg-muted/50"
              title="PO View"
            >
              <FileText className="h-4 w-4 mr-1.5" />
              PO View
            </Button>
          )}
        </div>
      );
    }

    // Special handling for Delivery Stage & Delivered: Show Confirm Delivered button or View PDF
    if (item.status === "delivery_stage" || item.status === "delivered" || item.status === "out_for_delivery") {
      const poNumber = requestToPONumber.get(item._id);
      return (
        <div className={cn("flex items-center gap-2", isCard ? "w-full justify-end" : "justify-end")}>
          {/* View DC Button - For items with deliveryId */}
          {item.deliveryId && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setViewDCId(item.deliveryId!);
              }}
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-sm"
            >
              <Eye className="h-4 w-4 mr-1.5" />
              View DC
            </Button>
          )}
          {/* Show Confirm Delivered button for out_for_delivery/delivery_stage items */}
          {(item.status === "out_for_delivery" || item.status === "delivery_stage" || item.status === "delivery_processing") && (
            <Button
              variant="default"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowConfirmDelivery(item._id);
              }}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold shadow-sm"
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Confirm Delivered
            </Button>
          )}
          {/* PO View removed for Delivery Stage & Delivered depending on requirements */}
          {poNumber && ["sign_pending", "sign_rejected", "pending_po", "ready_for_delivery"].includes(item.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setPdfPreviewPoNumber(poNumber);
              }}
              className="h-9 border-muted-foreground/20 hover:bg-muted/50"
              title="PO View"
            >
              <FileText className="h-4 w-4 mr-1.5" />
              PO View
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className={cn(
        "flex items-center p-1 rounded-xl border-2 transition-all duration-300 ease-out h-10 backdrop-blur-sm",
        isCard ? "w-full" : "w-[320px]",
        getSegmentBorder()
      )}>
        {/* Deliver Button */}
        <div
          onClick={(e) => {
            if (isLocked("delivery")) return;
            if (!canModify || stock < item.quantity) return;

            // For recheck items, show confirmation popup
            if (isRecheck) {
              e.stopPropagation();
              setShowPermissionConfirm({
                itemId: item._id,
                itemName: item.itemName,
                permission: "delivery",
                permissionLabel: "Direct Delivery"
              });
            } else if (!isPending && !isRecheck) {
              e.stopPropagation();
              // For active items (Direct PO, etc.), immediately switch status
              setShowItemDirectDeliveryConfirm(item._id);
            } else {
              // For pending items, use toggle intent
              toggleIntent(item._id, "direct_delivery", defaults);
            }
          }}
          className={cn(
            "flex items-center gap-2 px-3 h-full transition-all duration-200 ease-out select-none flex-1 justify-center relative group/btn rounded-lg",
            (canModify && stock >= item.quantity && !isLocked("delivery"))
              ? "cursor-pointer hover:bg-purple-100/80 dark:hover:bg-purple-900/40 hover:scale-105 hover:shadow-lg active:scale-95"
              : "cursor-default",

            isDirectDeliverySelected
              ? cn(
                "bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg shadow-purple-500/30 scale-[1.02] z-10 rounded-lg",
                isLocked("delivery") && "ring-2 ring-green-400 ring-offset-1 ring-offset-background"
              )
              : cn(
                "font-bold",
                (canModify && stock >= item.quantity && !isLocked("delivery"))
                  ? "text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                  : "text-muted-foreground opacity-50"
              )
          )}
        >
          <Package className={cn("h-4 w-4 transition-all duration-200 group-hover/btn:scale-125 group-hover/btn:rotate-12", isDirectDeliverySelected ? "fill-current drop-shadow-md" : "")} />
          <span className="text-[11px] uppercase tracking-wider font-black">Deliver</span>
          {isLocked("delivery") && <span className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-gradient-to-br from-green-400 to-green-600 rounded-full border-2 border-background shadow-sm flex items-center justify-center"><span className="text-[8px] text-white">✓</span></span>}
        </div>

        <div className="w-px h-5 bg-gradient-to-b from-transparent via-border/50 to-transparent mx-1" />

        {/* Split Button */}
        <div
          onClick={(e) => {
            if (isLocked("split")) return;
            if (!canModify || !isPartial) return;

            // For recheck items, show confirmation popup
            if (isRecheck) {
              e.stopPropagation();
              setShowPermissionConfirm({
                itemId: item._id,
                itemName: item.itemName,
                permission: "split",
                permissionLabel: "Split"
              });
            } else if (!isPending && !isRecheck) {
              e.stopPropagation();
              // For active items, show permission confirm to enable split
              setShowPermissionConfirm({
                itemId: item._id,
                itemName: item.itemName,
                permission: "split",
                permissionLabel: "Split"
              });
            } else {
              // For pending items, use toggle intent
              toggleIntent(item._id, "split", defaults);
            }
          }}
          className={cn(
            "flex items-center gap-2 px-3 h-full transition-all duration-200 ease-out select-none flex-1 justify-center relative group/btn rounded-lg",
            (canModify && isPartial && !isLocked("split"))
              ? "cursor-pointer hover:bg-blue-100/80 dark:hover:bg-blue-900/40 hover:scale-105 hover:shadow-lg active:scale-95"
              : "cursor-default",
            isSplitSelected
              ? cn(
                "bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/30 scale-[1.02] z-10 rounded-lg",
                isLocked("split") && "ring-2 ring-green-400 ring-offset-1 ring-offset-background"
              )
              : cn(
                "font-bold",
                (canModify && isPartial && !isLocked("split"))
                  ? "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  : "text-muted-foreground opacity-50"
              )
          )}
        >
          <GitFork className={cn("h-4 w-4 transition-all duration-200 group-hover/btn:scale-125 group-hover/btn:-rotate-12", isSplitSelected ? "fill-current drop-shadow-md" : "")} />
          <span className="text-[11px] uppercase tracking-wider font-black">Split</span>
          {isLocked("split") && <span className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-gradient-to-br from-green-400 to-green-600 rounded-full border-2 border-background shadow-sm flex items-center justify-center"><span className="text-[8px] text-white">✓</span></span>}
        </div>

        <div className="w-px h-5 bg-gradient-to-b from-transparent via-border/50 to-transparent mx-1" />

        {/* Direct PO Button */}
        <div
          onClick={(e) => {
            if (isLocked("po")) return;
            if (!canModify) return;

            // For recheck items, show confirmation popup
            if (isRecheck) {
              e.stopPropagation();
              setShowPermissionConfirm({
                itemId: item._id,
                itemName: item.itemName,
                permission: "po",
                permissionLabel: "Direct PO"
              });
            } else if (!isPending && !isRecheck) {
              e.stopPropagation();
              // For active items, switch to Direct PO
              setShowItemDirectPOConfirm(item._id);
            } else {
              // For pending items, use toggle intent
              toggleIntent(item._id, "direct_po", defaults);
            }
          }}
          className={cn(
            "flex items-center gap-2 px-3 h-full transition-all duration-200 ease-out select-none flex-1 justify-center relative group/btn rounded-lg",
            (canModify && !isLocked("po"))
              ? "cursor-pointer hover:bg-orange-100/80 dark:hover:bg-orange-900/40 hover:scale-105 hover:shadow-lg active:scale-95"
              : "cursor-default",
            isDirectPOSelected
              ? cn(
                "bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-lg shadow-orange-500/30 scale-[1.02] z-10 rounded-lg",
                isLocked("po") && "ring-2 ring-green-400 ring-offset-1 ring-offset-background"
              )
              : cn(
                "font-bold",
                (canModify && !isLocked("po"))
                  ? "text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300"
                  : "text-muted-foreground opacity-50"
              )
          )}
        >
          <ShoppingCart className={cn("h-4 w-4 transition-all duration-200 group-hover/btn:scale-125 group-hover/btn:rotate-12", isDirectPOSelected ? "fill-current drop-shadow-md" : "")} />
          <span className="text-[11px] uppercase tracking-wider font-black">Direct PO</span>
          {isLocked("po") && <span className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-gradient-to-br from-green-400 to-green-600 rounded-full border-2 border-background shadow-sm flex items-center justify-center"><span className="text-[8px] text-white">✓</span></span>}
        </div>
      </div>
    );
  };

  // Batch Process Dialog helper
  const BatchProcessDialogHelper = () => {
    const summary = getBatchSummary();
    const hasActions = Object.values(itemActions).some(action => action !== null);

    return (
      <Dialog open={showBatchProcessDialog} onOpenChange={setShowBatchProcessDialog}>
        <DialogContent className="w-[95vw] sm:w-full max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Process Selected Items</DialogTitle>
            <DialogDescription>
              Review and confirm the actions for selected items
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Action Summary */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Actions Summary:</Label>
              <div className="grid grid-cols-1 gap-2">
                {summary.approve > 0 && (
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md dark:bg-green-950 dark:border-green-800">
                    <span className="text-sm font-medium text-green-800 dark:text-green-200">Approve</span>
                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-100">
                      {summary.approve} item{summary.approve > 1 ? 's' : ''}
                    </Badge>
                  </div>
                )}
                {summary.reject > 0 && (
                  <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-md dark:bg-red-950 dark:border-red-800">
                    <span className="text-sm font-medium text-red-800 dark:text-red-200">Reject</span>
                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-100">
                      {summary.reject} item{summary.reject > 1 ? 's' : ''}
                    </Badge>
                  </div>
                )}
                {summary.direct_po > 0 && (
                  <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-md dark:bg-blue-950 dark:border-blue-800">
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Direct PO</span>
                    <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-100">
                      {summary.direct_po} item{summary.direct_po > 1 ? 's' : ''}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Rejection Reasons */}
            {summary.reject > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Rejection Reasons:</Label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {Object.entries(itemActions)
                    .filter(([_, action]) => action === "reject")
                    .map(([itemId]) => {
                      const item = allRequests?.find(r => r._id === itemId);
                      return (
                        <div key={itemId} className="p-2 bg-gray-50 border rounded dark:bg-gray-900">
                          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Item {item?.itemOrder || itemId.slice(-4)}: {item?.itemName}
                          </div>
                          <div className="text-xs text-gray-800 dark:text-gray-200">
                            {itemRejectionReasons[itemId] || "No reason provided"}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {!hasActions && (
              <div className="text-center py-4 text-muted-foreground">
                No actions assigned to selected items
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBatchProcessDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBatchProcessItems}
              disabled={isLoading || !hasActions}
              className="bg-primary hover:bg-primary/90"
            >
              {isLoading ? "Processing..." : "Confirm Actions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div>
      <BatchProcessDialogHelper />
      <PDFPreviewDialog
        open={!!pdfPreviewPoNumber}
        onOpenChange={(open) => { if (!open) { setPdfPreviewPoNumber(null); setPdfPreviewRequestId(null); setPdfPreviewRequestIds(null); } }}
        poNumber={pdfPreviewPoNumber}
        requestId={pdfPreviewRequestId}
        requestIds={pdfPreviewRequestIds}
      />

      <Dialog
        open={open}
        onOpenChange={(newOpen) => {
          if (!newOpen && showSignPendingApproveConfirm) {
            return;
          }
          onOpenChange(newOpen);
        }}
      >
        <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] md:max-w-[95vw] lg:max-w-[95vw] h-[95vh] p-0 gap-0 bg-background overflow-hidden flex flex-col shadow-2xl border-none">
          {/* Enhanced Header with Gradient */}
          <div className="flex flex-col border-b sticky top-0 z-50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
            <div className="px-6 py-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent flex items-start justify-between gap-4">
              <div className="space-y-1.5 overflow-hidden">
                <div className="flex items-center gap-3">
                  <DialogTitle className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    <span className="text-muted-foreground font-mono text-xl">#</span>
                    {request?.requestNumber}
                  </DialogTitle>
                  {/* Only show status badge in header if ALL items have the same status */}
                  {(() => {
                    if (!allRequests || allRequests.length === 0) return request && getStatusBadge(request.status);
                    const firstStatus = allRequests[0].status;
                    const allSame = allRequests.every(r => r.status === firstStatus);
                    return allSame ? getStatusBadge(firstStatus) : null;
                  })()}

                  {/* Urgent Badge */}
                  {(() => {
                    if (!allRequests) return null;
                    const urgentCount = allRequests.filter(i => i.isUrgent && i.status !== "direct_po" && i.directAction !== "po").length;
                    const totalCount = allRequests.length;
                    if (urgentCount === 0) return null;
                    return (
                      <Badge variant="destructive" className="animate-pulse shadow-sm uppercase px-2 py-0.5 text-[10px]">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {urgentCount === totalCount ? "Urgent" : `Urgent (${urgentCount}/${totalCount})`}
                      </Badge>
                    );
                  })()}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-background/50 hover:bg-destructive/10 hover:text-destructive border shadow-sm transition-all duration-200"
                  onClick={() => onOpenChange(false)}
                >
                  <XCircle className="h-6 w-6" />
                </Button>
              </div>

            </div>
          </div>

          {/* Toolbar / Actions Bar */}
          <div className="px-6 py-2 flex items-center justify-between border-t bg-muted/20">
            <div className="flex items-center gap-2">
              {/* Select All For PO */}
              {isPurchaseOfficer && (() => {
                const eligibleForPO = allRequests?.filter(i => ["ready_for_po", "direct_po", "sign_rejected"].includes(i.status)) || [];
                if (eligibleForPO.length === 0) return null;
                const allSelected = eligibleForPO.every(i => selectedItemsForAction.has(i._id));

                if (!allSelected) {
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Only select items with matching vendors
                        const firstVendor = eligibleForPO[0]?.selectedVendorId;
                        const sameVendorItems = eligibleForPO.filter(i => (i as any).selectedVendorId === firstVendor);
                        const hasMixedVendors = sameVendorItems.length < eligibleForPO.length;
                        const newSet = new Set(selectedItemsForAction);
                        sameVendorItems.forEach(i => newSet.add(i._id));
                        setSelectedItemsForAction(newSet);
                        if (hasMixedVendors) {
                          toast.error("Some items have different vendors and were excluded from selection.");
                        }
                      }}
                      className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      <CheckCircle className="h-3 w-3 mr-1.5" /> Select All PO
                    </Button>
                  );
                }
                return null;
              })()}

              {/* Batch Selection Counter (PO) */}
              {selectedItemsForAction.size > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                  <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                    {selectedItemsForAction.size} for PO
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedItemsForAction(new Set())} className="h-7 text-xs hover:bg-destructive/10 hover:text-destructive p-1.5 h-6 w-6 rounded-full">
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Spacer */}
              {(selectedItemsForAction.size > 0 || (allRequests?.some(i => ["ready_for_po", "direct_po", "sign_rejected"].includes(i.status)) && isPurchaseOfficer)) &&
                (selectedDCItems.size > 0 || allRequests?.some(i => ["ready_for_delivery"].includes(i.status))) && (
                  <div className="h-4 w-px bg-border mx-2" />
                )}

              {/* Select All For DC */}
              {(() => {
                const eligibleForDC = allRequests?.filter(i => ["ready_for_delivery"].includes(i.status)) || [];
                if (eligibleForDC.length === 0) return null;
                const allSelected = eligibleForDC.every(i => selectedDCItems.has(i._id));

                if (!allSelected) {
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newSet = new Set(selectedDCItems);
                        eligibleForDC.forEach(i => newSet.add(i._id));
                        setSelectedDCItems(newSet);
                      }}
                      className="h-7 text-xs border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                    >
                      <Truck className="h-3 w-3 mr-1.5" /> Select All DC
                    </Button>
                  );
                }
                return null;
              })()}

              {/* DC Selection Counter */}
              {selectedDCItems.size > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                  <span className="text-xs font-medium bg-green-100 text-green-700 px-2.5 py-1 rounded-full border border-green-200">
                    {selectedDCItems.size} for DC
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDCItems(new Set())}
                    className="h-7 text-xs hover:bg-destructive/10 hover:text-destructive p-1.5 h-6 w-6 rounded-full"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {/* Right Side Actions */}
            <div className="flex items-center gap-2">
              {/* Create CC for Selected - Purchase Officer only */}
              {isPurchaseOfficer && selectedCCItems.size > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-9 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-md animate-in zoom-in-95 duration-200"
                  onClick={() => {
                    const ids = Array.from(selectedCCItems);
                    if (onOpenCC) onOpenCC(ids[0], ids);
                    setSelectedCCItems(new Set());
                  }}
                >
                  <FileText className="h-4 w-4 mr-1.5" />
                  Create CC ({selectedCCItems.size})
                </Button>
              )}





              {/* Create DC for Selected Items */}
              {selectedDCItems.size > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-9 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-md animate-in zoom-in-95 duration-200"
                  onClick={() => setShowBulkDCDialog(true)}
                >
                  <Truck className="h-4 w-4 mr-1.5" />
                  Create DC ({selectedDCItems.size} items)
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20">
              <div className="space-y-6 max-w-full">
                {/* Basic Information - Simple Mobile Layout */}
                {isMobileLayout ? (
                  // Mobile-first simple layout for site engineers
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="space-y-1">
                      <Label className="text-sm font-semibold text-muted-foreground">Project & Site Location</Label>
                      {request.project && (
                        <button
                          onClick={() => setSelectedProjectId(request.project!._id)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/5 text-primary border border-primary/10 w-fit hover:bg-primary/10 transition-colors"
                        >
                          <span className="text-xs font-semibold">{request.project.name}</span>
                        </button>
                      )}
                      {!request.project && request.site ? (
                        <button
                          onClick={() => setSelectedSiteId(request.site!._id)}
                          className="font-semibold text-lg text-foreground hover:text-primary hover:bg-muted/50 rounded-md transition-colors cursor-pointer text-left block w-full truncate"
                        >
                          {request.site.name}
                        </button>
                      ) : !request.project ? (
                        <p className="font-semibold text-lg">—</p>
                      ) : null}
                      {!request.project && request.site?.address && (
                        <p className="text-xs text-muted-foreground line-clamp-2 flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />{request.site.address}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-muted-foreground">Created By</Label>
                      {request.creator ? (
                        <button
                          onClick={() => setSelectedUserId(request.creator!._id)}
                          className="font-semibold text-lg text-foreground hover:text-primary hover:bg-muted/50 rounded-md px-3 py-2 -mx-3 -my-2 transition-colors cursor-pointer text-left w-full truncate"
                        >
                          {request.creator.fullName}
                        </button>
                      ) : (
                        <p className="font-semibold text-lg">—</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(request.createdAt), "dd MMM yyyy, hh:mm a")}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-muted-foreground">Requested By</Label>
                      <p className="font-semibold text-lg">
                        {format(new Date(request.requiredBy), "dd MMM yyyy")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {Math.ceil((new Date(request.requiredBy).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days left
                      </p>
                    </div>
                  </div>
                ) : (
                  // Original desktop layout for managers
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-1">
                    {/* 1. Site Info */}
                    <div className="flex flex-col gap-1.5 border-r border-border/40 pr-4 last:border-0 md:last:border-0 lg:last:border-0">
                      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> Project & Site Location
                      </Label>
                      <div className="flex flex-col gap-1">
                        {request.project && (
                          <button
                            onClick={() => setSelectedProjectId(request.project!._id)}
                            className="text-xs font-semibold text-primary bg-primary/5 border border-primary/10 px-2 py-0.5 rounded w-fit hover:bg-primary/10 transition-colors"
                          >
                            {request.project.name}
                          </button>
                        )}
                        {!request.project && request.site ? (
                          <>
                            <button
                              onClick={() => setSelectedSiteId(request.site!._id)}
                              className="font-bold text-lg text-foreground hover:text-primary transition-colors text-left"
                            >
                              {request.site.name}
                            </button>
                            {request.site.address && (
                              <div className="flex items-start gap-1 mt-0.5 group">
                                <MapPin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                                <span className="text-xs text-muted-foreground line-clamp-2 leading-snug" title={request.site.address}>
                                  {request.site.address}
                                </span>
                                <button
                                  onClick={() => handleOpenInMap(request.site!.address!)}
                                  className="text-primary hover:text-primary/80 flex-shrink-0 mt-0.5 ml-1"
                                  title="Open in Maps"
                                >
                                  <MapPin className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </>
                        ) : !request.project ? (
                          <span className="text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </div>

                    {/* 2. Created By Info */}
                    <div className="flex flex-col gap-1.5 border-r border-border/40 pr-4 last:border-0 md:last:border-0 lg:last:border-0">
                      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" /> Created By
                      </Label>
                      <div className="flex flex-col">
                        {request.creator ? (
                          <button
                            onClick={() => setSelectedUserId(request.creator!._id)}
                            className="font-bold text-base text-foreground hover:text-primary transition-colors text-left"
                          >
                            {request.creator.fullName}
                          </button>
                        ) : (
                          <span className="text-muted-foreground font-medium">—</span>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(request.createdAt), "dd MMM yyyy, hh:mm a")}
                        </span>
                      </div>
                    </div>

                    {/* 3. Requested By Date */}
                    <div className="flex flex-col gap-1.5 border-r border-border/40 pr-4 last:border-0 md:last:border-0 lg:last:border-0">
                      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> Requested By
                      </Label>
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-base text-foreground">
                          {format(new Date(request.requiredBy), "dd MMM yyyy")}
                        </span>
                        {(() => {
                          const daysLeft = Math.ceil((new Date(request.requiredBy).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                          const isUrgent = daysLeft <= 2;
                          return (
                            <Badge
                              variant={isUrgent ? "destructive" : "secondary"}
                              className={cn("w-fit px-2 py-0 h-5 text-[10px] font-medium rounded-full", !isUrgent && "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300")}
                            >
                              {daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : daysLeft === 0 ? "Due Today" : `${daysLeft} days left`}
                            </Badge>
                          );
                        })()}
                      </div>
                    </div>

                    {/* 4. Summary Stats */}
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" /> Summary
                      </Label>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base text-foreground">
                            {allRequests?.length || 1} Total Items
                          </span>
                        </div>
                        {(pendingItems.length > 0) && (
                          <span className="text-sm font-medium text-amber-600 dark:text-amber-500">
                            {pendingItems.length} Pending Approval
                          </span>
                        )}
                        {(signPendingItems.length > 0) && (
                          <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                            {signPendingItems.length} Sign Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}




                {/* Request Images Gallery - Hidden for Managers */}
                {allPhotos.length > 0 && !isManager && (
                  <div className="space-y-3">
                    <Label className="text-muted-foreground font-bold">
                      Request Photos ({allPhotos.length})
                    </Label>
                    <div className="flex justify-center">
                      <CompactImageGallery
                        images={allPhotos}
                        maxDisplay={5}
                        size="lg"
                        className="justify-center"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground font-bold">
                      {isMobileLayout ? "Materials List" : (
                        allRequests && allRequests.length > 1
                          ? `Items (${allRequests.length})`
                          : "Item Details"
                      )}
                    </Label>
                    {allRequests && allRequests.length > 0 && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleViewModeToggle}
                        className="h-8 w-8 ml-2 bg-muted/30 border-muted-foreground/20 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all"
                        title={viewMode === "table" ? "Switch to Grid View" : "Switch to Table View"}
                      >
                        {viewMode === "table" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>


                  {/* Display all items - Conditional Layout */}
                  {allRequests && allRequests.length > 0 ? (
                    viewMode === "table" ? (
                      <div className="space-y-2">
                        <Table style={{ borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40 border-b">
                              <TableHead className="w-[40px] text-center p-2"></TableHead>

                              <TableHead className="min-w-[300px] font-bold text-xs uppercase tracking-wider text-muted-foreground">Item Details</TableHead>
                              <TableHead className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Quantity</TableHead>
                              <TableHead className="w-[140px] font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</TableHead>
                              {isManager && (pendingItems.length > 0 || signPendingItems.length > 0 || (allRequests && allRequests.some(i => canManagerModifyStatus(i.status)))) || (isPurchaseOfficer && (allRequests && allRequests.some(i => ["pending_po", "direct_po", "ready_for_po", "ready_for_delivery", "recheck", "approved", "ready_for_cc", "cc_rejected"].includes(i.status)))) ? (
                                <TableHead className="min-w-[300px] text-right font-bold text-xs uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                              ) : (
                                <TableHead className="hidden"></TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {/* Render Pending PO Groups (ordered status) - vendor-wise grouping */}
                            {pendingPOs && pendingPOs.filter(group => group.status === "ordered").map((group: any) => (
                              <TableRow key={`pending-po-group-${group.poNumber}-${group.vendor?._id}`} className={cn(
                                "shadow-sm border-b",
                                "bg-orange-50/50 dark:bg-orange-950/10 hover:bg-orange-50 dark:hover:bg-orange-900/20 border-orange-200/50 dark:border-orange-800/50"
                              )}>
                                <TableCell colSpan={10} className="p-0">
                                  <div className="flex flex-col sm:flex-row w-full">
                                    {/* Left: Vendor & PO Info */}
                                    <div className={cn(
                                      "p-4 flex-1 flex flex-col justify-center border-r",
                                      "border-orange-200/30 dark:border-orange-800/30"
                                    )}>
                                      <div className="flex items-center gap-3 mb-2">
                                        <div className={cn(
                                          "h-10 w-10 rounded-full flex items-center justify-center border",
                                          "bg-orange-100 dark:bg-orange-900/40 border-orange-200 dark:border-orange-800"
                                        )}>
                                          <Building2 className={cn(
                                            "h-5 w-5",
                                            "text-orange-700 dark:text-orange-400"
                                          )} />
                                        </div>
                                        <div>
                                          <div className={cn(
                                            "font-bold text-base",
                                            "text-orange-950 dark:text-orange-100"
                                          )}>{group.vendor.companyName}</div>
                                          <div className={cn(
                                            "text-xs flex items-center gap-1.5",
                                            "text-orange-800/70 dark:text-orange-300/70"
                                          )}>
                                            <span className={cn(
                                              "font-mono px-1 rounded",
                                              "bg-orange-100/50 dark:bg-orange-900/30"
                                            )}>{group.vendor.gstNumber}</span>
                                            {group.items[0].poNumber && <span className="font-mono font-semibold">• PO: {group.items[0].poNumber}</span>}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="mt-2 pl-[52px]">
                                        <div className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                                          <ShoppingCart className="h-3 w-3 mr-1" /> Pending PO
                                        </div>
                                      </div>
                                    </div>

                                    {/* Middle: Items List */}
                                    <div className={cn(
                                      "flex-[2] p-4 border-r",
                                      "border-orange-200/30 dark:border-orange-800/30"
                                    )}>
                                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <List className="h-3 w-3" /> Includes {group.items.length} Item{group.items.length > 1 ? 's' : ''}
                                      </h4>
                                      <div className="space-y-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                                        {group.items.map((po: any, idx: number) => (
                                          <div key={po._id} className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-background/70 border border-border/60 hover:bg-background/90 transition-colors">
                                            <div className="flex items-center gap-2.5">
                                              <span className="text-xs font-black font-mono bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-2.5 py-1 rounded-lg shadow-md min-w-[32px] text-center">
                                                #{po.itemOrder || (idx + 1)}
                                              </span>
                                              <Badge variant="outline" className="h-5 px-2 text-[10px] bg-muted/40 font-medium">
                                                {po.requestQuantity || po.quantity} {po.requestUnit || po.unit}
                                              </Badge>
                                              <span className="font-semibold truncate max-w-[180px] text-foreground" title={po.itemName || po.itemDescription}>{po.itemName || po.itemDescription?.split('\n')[0] || "Item"}</span>
                                            </div>
                                            <div className="font-bold font-mono text-xs bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 px-2 py-1 rounded">
                                              ₹{po.totalAmount?.toLocaleString() || 0}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      <div className={cn(
                                        "mt-3 pt-2 border-t border-dashed flex justify-between items-center px-1",
                                        "border-orange-200/50 dark:border-orange-800/50"
                                      )}>
                                        <span className={cn(
                                          "text-xs font-medium",
                                          "text-orange-800/70 dark:text-orange-400/70"
                                        )}>Total PO Value</span>
                                        <span className="text-sm font-bold text-foreground">
                                          ₹
                                          {group.items.reduce((sum: number, i: any) => sum + i.totalAmount, 0).toLocaleString()}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Right: Actions - Arrival/Receive & View PDF */}
                                    <div className={cn(
                                      "p-4 flex flex-col justify-center gap-2 min-w-[160px]",
                                      "bg-orange-100/20 dark:bg-orange-950/20"
                                    )}>
                                      {/* Available button - opens delivery dialog for all PO items - Purchase Officer Only */}
                                      {isPurchaseOfficer && (
                                        <div className="flex flex-col gap-1.5 w-full">
                                          <Button
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              // Prepare bulk delivery data with all items from this vendor's PO (with tracking)
                                              const bulkItems = prepareBulkDeliveryItems(group.items);

                                              setBulkDeliveryData({
                                                items: bulkItems,
                                                vendorName: group.vendor.companyName,
                                                poNumber: group.items[0].poNumber
                                              });
                                            }}
                                            className={cn(
                                              "w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                                            )}
                                          >
                                            <CheckCircle className="h-3.5 w-3.5 mr-2" /> Available
                                          </Button>
                                        </div>
                                      )}
                                      {group.items[0].poNumber && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className={cn("text-xs h-8 w-full bg-background")}
                                          onClick={() => { setPdfPreviewPoNumber(group.items[0].poNumber); setPdfPreviewRequestIds(group.items.map((i: any) => i.requestId)); }}
                                        >
                                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                                          PO View
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}

                            {/* Render Grouped POs First - pendingPOs is already grouped by PO number with items array */}
                            {pendingPOs && pendingPOs.filter(group => group.status === "sign_pending" || group.status === "sign_rejected").map((group: any) => (
                              <TableRow key={`group-${group.poNumber}-${group.vendor?._id}`} className={cn(
                                "shadow-sm border-b",
                                group.status === "sign_rejected"
                                  ? "bg-red-50/50 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200/50 dark:border-red-800/50"
                                  : "bg-amber-50/50 dark:bg-amber-950/10 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-amber-200/50 dark:border-amber-800/50"
                              )}>
                                <TableCell colSpan={10} className="p-0">
                                  <div className="flex flex-col sm:flex-row w-full">
                                    {/* Left: Vendor & PO Info */}
                                    <div className={cn(
                                      "p-4 flex-1 flex flex-col justify-center border-r",
                                      group.status === "sign_rejected" ? "border-red-200/30 dark:border-red-800/30" : "border-amber-200/30 dark:border-amber-800/30"
                                    )}>
                                      <div className="flex items-center gap-3 mb-2">
                                        <div className={cn(
                                          "h-10 w-10 rounded-full flex items-center justify-center border",
                                          group.status === "sign_rejected"
                                            ? "bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-800"
                                            : "bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800"
                                        )}>
                                          <Building2 className={cn(
                                            "h-5 w-5",
                                            group.status === "sign_rejected" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"
                                          )} />
                                        </div>
                                        <div>
                                          <div className={cn(
                                            "font-bold text-base",
                                            group.status === "sign_rejected" ? "text-red-950 dark:text-red-100" : "text-amber-950 dark:text-amber-100"
                                          )}>{group.vendor.companyName}</div>
                                          <div className={cn(
                                            "text-xs flex items-center gap-1.5",
                                            group.status === "sign_rejected" ? "text-red-800/70 dark:text-red-300/70" : "text-amber-800/70 dark:text-amber-300/70"
                                          )}>
                                            <span className={cn(
                                              "font-mono px-1 rounded",
                                              group.status === "sign_rejected" ? "bg-red-100/50 dark:bg-red-900/30" : "bg-amber-100/50 dark:bg-amber-900/30"
                                            )}>{group.vendor.gstNumber}</span>
                                            {group.items[0].poNumber && <span className="font-mono font-semibold">• PO: {group.items[0].poNumber}</span>}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="mt-2 pl-[52px]">
                                        {group.status === "sign_rejected" ? (
                                          <div className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-400 border border-red-200 dark:border-red-800">
                                            <XCircle className="h-3 w-3 mr-1" /> Sign Rejected
                                          </div>
                                        ) : (
                                          <div className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                            <Pencil className="h-3 w-3 mr-1" /> Waiting for Signature
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Middle: Items List */}
                                    <div className={cn(
                                      "flex-[2] p-4 border-r",
                                      group.status === "sign_rejected" ? "border-red-200/30 dark:border-red-800/30" : "border-amber-200/30 dark:border-amber-800/30"
                                    )}>
                                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <List className="h-3 w-3" /> Includes {group.items.length} Item{group.items.length > 1 ? 's' : ''}
                                      </h4>
                                      <div className="space-y-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                                        {group.items.map((po: any, idx: number) => (
                                          <div key={po._id} className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-background/70 border border-border/60 hover:bg-background/90 transition-colors">
                                            <div className="flex items-center gap-2.5">
                                              <span className="text-xs font-black font-mono bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-2.5 py-1 rounded-lg shadow-md min-w-[32px] text-center">
                                                #{po.itemOrder || (idx + 1)}
                                              </span>
                                              <Badge variant="outline" className="h-5 px-2 text-[10px] bg-muted/40 font-medium">
                                                {po.requestQuantity || po.quantity} {po.requestUnit || po.unit}
                                              </Badge>
                                              <span className="font-semibold truncate max-w-[180px] text-foreground" title={po.itemName || po.itemDescription}>{po.itemName || po.itemDescription?.split('\n')[0] || "Item"}</span>
                                            </div>
                                            <div className="font-bold font-mono text-xs bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 px-2 py-1 rounded">
                                              ₹{po.totalAmount?.toLocaleString() || 0}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      <div className={cn(
                                        "mt-3 pt-2 border-t border-dashed flex justify-between items-center px-1",
                                        group.status === "sign_rejected" ? "border-red-200/50 dark:border-red-800/50" : "border-amber-200/50 dark:border-amber-800/50"
                                      )}>
                                        <span className={cn(
                                          "text-xs font-medium",
                                          group.status === "sign_rejected" ? "text-red-800/70 dark:text-red-400/70" : "text-amber-800/70 dark:text-amber-400/70"
                                        )}>Total PO Value</span>
                                        <span className="text-sm font-bold text-foreground">
                                          ₹
                                          {group.items.reduce((sum: number, i: any) => sum + i.totalAmount, 0).toLocaleString()}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Right: Actions */}
                                    <div className={cn(
                                      "p-4 flex flex-col justify-center gap-2 min-w-[160px]",
                                      group.status === "sign_rejected" ? "bg-red-100/20 dark:bg-red-950/20" : "bg-amber-100/20 dark:bg-amber-950/20"
                                    )}>
                                      {/* Only show Approve/Reject if NOT rejected */}
                                      {isManager && group.status === "sign_pending" && (
                                        <>
                                          <Button
                                            size="sm"
                                            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const poIds = group.items.map((i: any) => i._id);
                                              setShowSignPendingApproveConfirm({ type: 'po_batch', ids: poIds } as any);
                                            }}
                                          >
                                            <Pencil className="h-3.5 w-3.5 mr-2" /> Sign PO
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full text-xs h-8 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-900/30 dark:hover:bg-red-950/30"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const poIds = group.items.map((i: any) => i._id);
                                              setShowRejectionInput({ type: 'po_batch', ids: poIds } as any);
                                            }}
                                          >
                                            Reject
                                          </Button>
                                        </>
                                      )}
                                      {/* Resubmit button for Purchase Officers on rejected POs */}
                                      {isPurchaseOfficer && group.status === "sign_rejected" && (
                                        <Button
                                          size="sm"
                                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            // Get the request IDs from the group items
                                            const requestIds = group.items.map((i: any) => i.requestId);
                                            // Set the items for resubmission using create PO flow
                                            if (requestIds.length > 0 && onCreatePO) {
                                              onCreatePO(requestIds);
                                            }
                                          }}
                                        >
                                          <RefreshCw className="h-3.5 w-3.5 mr-2" /> Resubmit PO ({group.items.length} items)
                                        </Button>
                                      )}
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={cn("text-xs h-8", isManager ? "w-full" : "w-full bg-background")}
                                        onClick={() => { setPdfPreviewPoNumber(group.items[0].poNumber); setPdfPreviewRequestIds(group.items.map((i: any) => i.requestId)); }}
                                      >
                                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                                        PO View
                                      </Button>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}

                            {(() => {
                              const sortedItems = (allRequests || []).sort((a, b) => {
                                const orderA = a.itemOrder ?? a.createdAt;
                                const orderB = b.itemOrder ?? b.createdAt;
                                return orderA - orderB;
                              });

                              const visibleItems = sortedItems;
                              const remainingCount = sortedItems.length - 1;
                              // For merged CC: use global CC items computed at component level
                              const ccPendingItems = allCCStatusItems;
                              const firstCCItemId = firstCCItemIdGlobal;
                              const allCCIds = allCCIdsGlobal;

                              return (
                                <>
                                  {visibleItems.map((item, idx) => {
                                    const isPending = item.status === "pending";
                                    const displayNumber = item.itemOrder ?? idx + 1;
                                    const isSelected = selectedItemsForAction.has(item._id);
                                    const itemPhotos = getItemPhotos(item);

                                    // Check if item is part of a pending PO group (looking inside group.items)
                                    const isInSignPendingGroup = pendingPOs?.some(group =>
                                      (group.status === "sign_pending" || group.status === "sign_rejected") &&
                                      group.items?.some((poItem: any) => poItem.requestId === item._id)
                                    );
                                    // Also check if item is in pending_po group (ordered status)
                                    const isInPendingPOGroup = pendingPOs?.some(group =>
                                      group.status === "ordered" &&
                                      group.items?.some((poItem: any) => poItem.requestId === item._id)
                                    );
                                    if (isInSignPendingGroup || isInPendingPOGroup) return null; // Rendered in group row on top

                                    // Determine if this item is part of a merged CC group
                                    const isMergedCCItem = ccPendingItems.length > 1 && ["cc_pending", "cc_approved", "cc_rejected", "ready_for_po"].includes(item.status as string);
                                    const isFirstMergedCC = isMergedCCItem && item._id === firstCCItemId;
                                    const isLastMergedCC = isMergedCCItem && item._id === ccPendingItems[ccPendingItems.length - 1]?._id;

                                    return (
                                      <Fragment key={item._id}>
                                        {isFirstMergedCC && (() => {
                                          const allReadyForPO = ccPendingItems.every(i => i.status === "ready_for_po");
                                          const hasPending = ccPendingItems.some(i => i.status === "cc_pending");
                                          const hasApproved = ccPendingItems.some(i => ["cc_approved", "ready_for_po"].includes(i.status as string));

                                          if (allReadyForPO) {
                                            // All items are ready for PO — show emerald "Ready for PO" bar
                                            return (
                                              <TableRow className="h-9 hover:bg-transparent">
                                                <TableCell colSpan={6} className="py-0 px-3 pb-0">
                                                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg bg-emerald-500/10 border border-b-0 border-emerald-400/30">
                                                    <div className="flex items-center gap-1.5">
                                                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                                                        Ready for PO · {ccPendingItems.length} items
                                                      </span>
                                                    </div>
                                                    <div className="flex-1 h-px bg-emerald-400/20" />
                                                    <div className="flex items-center gap-1.5">
                                                      {/* View CC button — always available for ready_for_po items */}
                                                      {onOpenCC && (
                                                        <Button
                                                          size="sm"
                                                          variant="outline"
                                                          className="h-6 px-3 text-[10px] font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            onOpenCC(firstCCItemId as any, allCCIds.length > 1 ? allCCIds as any : undefined);
                                                          }}
                                                        >
                                                          <Layers className="h-3 w-3 mr-1" />
                                                          View CC ({ccPendingItems.length} items)
                                                        </Button>
                                                      )}
                                                    </div>
                                                  </div>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          }

                                          // Default: purple CC bar
                                          return (
                                            <TableRow className="h-9 hover:bg-transparent">
                                              <TableCell colSpan={6} className="py-0 px-3 pb-0">
                                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg bg-purple-500/10 border border-b-0 border-purple-400/30">
                                                  <div className="flex items-center gap-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                                                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                                                      Merged CC · {ccPendingItems.length} items
                                                    </span>
                                                  </div>
                                                  <div className="flex-1 h-px bg-purple-400/20" />
                                                  {/* Single CC button in the header */}
                                                  {(() => {
                                                    if (!hasPending && !hasApproved) return null;
                                                    return (
                                                      <Button
                                                        size="sm"
                                                        variant={hasPending ? "default" : "outline"}
                                                        className={hasPending
                                                          ? "h-6 px-3 text-[10px] font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                                                          : "h-6 px-3 text-[10px] font-bold border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400"
                                                        }
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          if (onOpenCC) {
                                                            onOpenCC(firstCCItemId as any, allCCIds.length > 1 ? allCCIds as any : undefined);
                                                          }
                                                        }}
                                                      >
                                                        {hasPending
                                                          ? <><CheckCircle className="h-3 w-3 mr-1" /> Review CC ({ccPendingItems.length} items)</>
                                                          : <><Layers className="h-3 w-3 mr-1" /> View CC ({ccPendingItems.length} items)</>
                                                        }
                                                      </Button>
                                                    );
                                                  })()}
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })()}
                                        <TableRow
                                          className={cn(
                                            "cursor-pointer transition-all relative h-[80px]",
                                            isMergedCCItem && ccPendingItems.every(i => i.status === "ready_for_po")
                                              ? "bg-emerald-500/5 dark:bg-emerald-900/10 hover:bg-emerald-500/10"
                                              : isMergedCCItem
                                              ? "bg-purple-500/5 dark:bg-purple-900/10 hover:bg-purple-500/10"
                                              : getStatusBgTint(item.status),
                                            !isMergedCCItem && "hover:brightness-[0.98] dark:hover:brightness-110",
                                            isMergedCCItem && ccPendingItems.every(i => i.status === "ready_for_po")
                                              ? "[&>td:first-child]:border-l-[4px] [&>td:first-child]:border-l-emerald-500"
                                              : isMergedCCItem
                                              ? "[&>td:first-child]:border-l-[4px] [&>td:first-child]:border-l-purple-500"
                                              : getStatusBorderClass(item.status),
                                            !isMergedCCItem && "[&>td:first-child]:border-l-[6px] [&>td:first-child]:border-l-[color:inherit]",
                                            // Top/Bottom/Right borders
                                            isMergedCCItem && ccPendingItems.every(i => i.status === "ready_for_po")
                                              ? "[&>td]:border-x-0 [&>td]:border-border/20 [&>td:first-child]:border-l-[4px] [&>td:first-child]:border-l-emerald-500"
                                              : isMergedCCItem
                                              ? "[&>td]:border-x-0 [&>td]:border-border/20 [&>td:first-child]:border-l-[4px] [&>td:first-child]:border-l-purple-500"
                                              : "[&>td]:border-y [&>td]:border-r-0 [&>td]:border-border/30",
                                            !isMergedCCItem && "[&>td:last-child]:border-r",
                                            isMergedCCItem && isLastMergedCC && ccPendingItems.every(i => i.status === "ready_for_po") && "[&>td]:border-b [&>td]:border-emerald-400/30",
                                            isMergedCCItem && isLastMergedCC && !ccPendingItems.every(i => i.status === "ready_for_po") && "[&>td]:border-b [&>td]:border-purple-400/30",
                                            isMergedCCItem && !isLastMergedCC && "[&>td]:border-b-0",
                                            "rounded-lg border-separate",
                                            "hover:shadow-md shadow-sm",
                                            isSelected && "ring-4 ring-primary/20 bg-primary/5"
                                          )}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {/* Selection Checkbox */}
                                          <TableCell className="p-2 text-center w-[45px] relative rounded-l-lg overflow-hidden">
                                            <div className="flex items-center justify-center h-full w-full">
                                              {((isManager && item.status === "pending") || (isPurchaseOfficer && ["pending_po", "direct_po", "ready_for_po", "ready_for_delivery", "sign_rejected", "ready_for_cc"].includes(item.status))) && (
                                                <Checkbox
                                                  checked={
                                                    item.status === "ready_for_delivery" ? selectedDCItems.has(item._id) :
                                                    item.status === "ready_for_cc" ? selectedCCItems.has(item._id) :
                                                    selectedItemsForAction.has(item._id)
                                                  }
                                                  onCheckedChange={() => {
                                                    if (item.status === "ready_for_delivery") {
                                                      const newSet = new Set(selectedDCItems);
                                                      if (newSet.has(item._id)) { newSet.delete(item._id); } else { newSet.add(item._id); }
                                                      setSelectedDCItems(newSet);
                                                    } else if (item.status === "ready_for_cc") {
                                                      const newSet = new Set(selectedCCItems);
                                                      if (newSet.has(item._id)) { newSet.delete(item._id); } else { newSet.add(item._id); }
                                                      setSelectedCCItems(newSet);
                                                    } else {
                                                      toggleItemSelection(item._id);
                                                    }
                                                  }}
                                                  className={cn(
                                                    "h-4 w-4 relative z-10",
                                                    item.status === "ready_for_delivery" && "border-green-500 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600",
                                                    item.status === "ready_for_cc" && "border-violet-500 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600",
                                                    item.status === "ready_for_po" && "border-emerald-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                                                  )}
                                                />
                                              )}
                                            </div>
                                          </TableCell>


                                          <TableCell className="py-3">
                                            <div className="flex items-start gap-3">
                                              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-black font-mono px-2.5 py-1.5 rounded-lg shadow-lg shrink-0 mt-1">
                                                #{displayNumber}
                                              </span>

                                              <div className="flex-shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
                                                {itemPhotos.length > 0 ? (
                                                  <CompactImageGallery
                                                    images={itemPhotos}
                                                    maxDisplay={1}
                                                    size="sm"
                                                  />
                                                ) : (
                                                  <div className="w-10 h-10 rounded-md bg-muted/30 border border-dashed border-border/60 flex items-center justify-center">
                                                    <span className="text-[8px] font-medium text-muted-foreground/60 italic">No Img</span>
                                                  </div>
                                                )}
                                              </div>

                                              <div className="space-y-1.5 min-w-0 flex-1">
                                                <div className="flex flex-col">
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setSelectedItemName(item.itemName);
                                                    }}
                                                    className="font-semibold text-sm text-left hover:text-primary dark:hover:text-primary transition-colors focus:outline-none leading-tight pt-1"
                                                  >
                                                    {item.itemName}
                                                  </button>
                                                  <div onClick={(e) => e.stopPropagation()} className="scale-90 origin-left mt-0.5">
                                                    {getInventoryStatusBadge(item.itemName, item.quantity, item.unit)}
                                                  </div>
                                                </div>
                                                {item.description ? (
                                                  <div className="w-full text-sm text-muted-foreground mt-0.5">
                                                    <p className="line-clamp-2 text-xs leading-snug opacity-90">
                                                      {item.description}
                                                    </p>
                                                  </div>
                                                ) : (
                                                  <p className="text-xs text-muted-foreground/50 italic">No description</p>
                                                )}
                                                {item.specsBrand && (
                                                  <div className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                                                    {item.specsBrand}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </TableCell>
                                          <TableCell className="py-3 align-top">
                                            <div className="flex flex-col gap-1.5 items-start">
                                              <Badge variant="secondary" className="text-sm font-semibold">
                                                {item.quantity} <span className="text-xs font-normal ml-1 opacity-70">{item.unit}</span>
                                              </Badge>
                                            </div>
                                          </TableCell>
                                          <TableCell className="py-3 align-top rounded-r-lg overflow-hidden">
                                            <div className="flex flex-col gap-1.5 items-start">
                                              {item.isUrgent && item.status !== "direct_po" && item.directAction !== "po" && (
                                                <Badge variant="destructive" className="px-2 py-0.5 h-6 text-[10px] font-bold shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse mb-1.5 uppercase tracking-wider border-red-400 ring-1 ring-red-500/50">
                                                  Urgent
                                                </Badge>
                                              )}
                                              {getStatusBadge(item.status)}
                                            </div>
                                          </TableCell>
                                          {(isManager && (isPending || item.status === "sign_pending" || item.status === "cc_pending" || canManagerModifyStatus(item.status))) ||
                                            (isPurchaseOfficer && ["pending_po", "direct_po", "ready_for_po", "ready_for_delivery", "recheck", "approved", "ready_for_cc", "cc_pending", "cc_approved", "cc_rejected", "out_for_delivery", "delivery_processing", "delivery_stage", "delivered"].includes(item.status)) ||
                                            (isSiteEngineer && ["cc_pending", "cc_rejected", "ready_for_po", "out_for_delivery", "delivery_processing", "delivery_stage"].includes(item.status)) ? (
                                            <TableCell className="text-right p-4 align-middle rounded-r-lg overflow-hidden">
                                              <div className="flex items-center justify-end gap-3 min-w-[300px]">
                                                {item.status === "sign_pending" ? (
                                                  <div className="flex items-center gap-2">
                                                    {/* Logic to show inline actions ONLY if NOT handled by the grouped section 
                                                        OR if we just want to point user to bottom */}
                                                    {pendingPOs && pendingPOs.length > 0 ? (
                                                      <div className="text-xs text-muted-foreground italic mr-2">
                                                        See actions below
                                                      </div>
                                                    ) : (
                                                      <>
                                                        <Button
                                                          variant="outline"
                                                          size="sm"
                                                          className="h-9 border-amber-200 text-amber-700 hover:bg-amber-50"
                                                          onClick={(e) => { e.stopPropagation(); setShowSignPendingApproveConfirm(item._id); }}
                                                          disabled={isLoading}
                                                        >
                                                          <Pencil className="h-4 w-4 mr-1.5" /> Sign PO
                                                        </Button>
                                                        <Button
                                                          variant="outline"
                                                          size="sm"
                                                          className="h-9 border-red-200 text-red-600 hover:bg-red-50"
                                                          onClick={(e) => { e.stopPropagation(); setShowItemRejectionInput(item._id); }}
                                                          disabled={isLoading}
                                                        >
                                                          <XCircle className="h-4 w-4 mr-1.5" /> Reject
                                                        </Button>
                                                      </>
                                                    )}
                                                  </div>
                                                ) : item.status === "sign_rejected" ? (
                                                  isPurchaseOfficer && onCreatePO && (
                                                    <Button
                                                      size="sm"
                                                      className="h-9 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all hover:scale-105"
                                                      onClick={(e) => { e.stopPropagation(); onCreatePO([item._id]); }}
                                                    >
                                                      <RefreshCw className="h-4 w-4 mr-1.5" /> Resubmit PO
                                                    </Button>
                                                  )
                                                ) : (
                                                  <div className="flex items-center gap-3">
                                                    {/* For merged CC where all items are ready_for_po: show Create PO button per item */}
                                                    {isMergedCCItem && ccPendingItems.every(i => i.status === "ready_for_po") ? (
                                                      onCreatePO ? (
                                                        <Button
                                                          size="sm"
                                                          className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                                                          onClick={(e) => { e.stopPropagation(); onCreatePO([item._id]); }}
                                                        >
                                                          <ShoppingCart className="h-4 w-4 mr-1.5" /> Create PO
                                                        </Button>
                                                      ) : null
                                                    ) : isMergedCCItem ? null : (
                                                      <RenderActionSegments
                                                        item={item}
                                                        mergedCCIds={allCCIds as any}
                                                        showMergedCCButton={true}
                                                      />
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            </TableCell>
                                          ) : (
                                            <TableCell className="hidden"></TableCell>
                                          )}
                                        </TableRow>
                                        {/* Merged CC group footer — shown after last CC item */}
                                        {isLastMergedCC && (
                                          <TableRow className="h-2 hover:bg-transparent">
                                            <TableCell colSpan={6} className="py-0 px-3 pt-0">
                                              <div className={cn(
                                                "h-1 rounded-b-lg border border-t-0",
                                                ccPendingItems.every(i => i.status === "ready_for_po")
                                                  ? "bg-emerald-500/10 border-emerald-400/30"
                                                  : "bg-purple-500/10 border-purple-400/30"
                                              )} />
                                            </TableCell>
                                          </TableRow>
                                        )}
                                        {
                                          showItemRejectionInput === item._id && (
                                            <TableRow className="bg-muted/10 hover:bg-muted/10">
                                              <TableCell colSpan={6} className="p-3">
                                                <div className="flex flex-col gap-2 max-w-md ml-auto bg-card border rounded-md p-3 shadow-sm" onClick={(e) => e.stopPropagation()}>
                                                  <Label className="text-xs font-semibold">Rejection Reason</Label>
                                                  <Textarea
                                                    value={itemRejectionReasons[item._id] || ""}
                                                    onChange={(e) =>
                                                      setItemRejectionReasons((prev) => ({
                                                        ...prev,
                                                        [item._id]: e.target.value,
                                                      }))
                                                    }
                                                    placeholder="Enter rejection reason..."
                                                    className="text-xs min-h-[60px]"
                                                  />
                                                  <div className="flex justify-end gap-2">
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => setShowItemRejectionInput(null)}
                                                      className="h-7 text-xs"
                                                    >
                                                      Cancel
                                                    </Button>
                                                    <Button
                                                      variant="destructive"
                                                      size="sm"
                                                      onClick={() => handleItemReject(item._id)}
                                                      disabled={isLoading || !itemRejectionReasons[item._id]?.trim()}
                                                      className="h-7 text-xs"
                                                    >
                                                      Confirm Reject
                                                    </Button>
                                                  </div>
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          )
                                        }
                                      </Fragment >
                                    );
                                  })
                                  }

                                </>
                              )
                            })()}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      // Fallback to single item display if allRequests not loaded yet
                      <div className="block">
                        {/* Card View - Grouped POs first */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-4">
                          {/* Pending PO Groups (ordered status) - vendor-wise */}
                          {pendingPOs && pendingPOs.filter((p: any) => p.status === "ordered").map((group: any) => (
                            <div key={`card-pending-po-${group.poNumber}-${group.vendor?._id}`} className="flex flex-col border rounded-xl bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow ring-1 ring-orange-500/20">
                              <div className="p-4 bg-orange-50 dark:bg-orange-950/20 border-b flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-white dark:bg-orange-900/40 flex items-center justify-center shadow-sm text-orange-600">
                                  <Building2 className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-foreground truncate">{group.vendor?.companyName || "Unknown Vendor"}</h3>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" /> Pending PO</span>
                                    <span>•</span>
                                    <span className="font-mono">PO: {group.poNumber}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-bold">₹{group.totalAmount.toLocaleString()}</div>
                                </div>
                              </div>
                              <div className="p-3 bg-muted/10 space-y-2">
                                {group.items.map((po: any, idx: number) => (
                                  <div key={po._id} className="flex items-center gap-2.5 text-sm p-2 rounded-lg bg-background/60 border border-border/50 hover:bg-background/80 transition-colors">
                                    <span className="text-xs font-black font-mono bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-2 py-1 rounded-lg shadow-sm min-w-[28px] text-center">
                                      #{po.itemOrder || (idx + 1)}
                                    </span>
                                    <Badge variant="secondary" className="h-5 text-[10px] px-1.5">{po.requestQuantity || po.quantity} {po.requestUnit || po.unit}</Badge>
                                    <span className="truncate flex-1 font-semibold">{po.itemName || po.itemDescription?.split('\n')[0]}</span>
                                    <span className="font-mono text-xs font-bold text-green-600 dark:text-green-400">₹{po.totalAmount?.toLocaleString() || 0}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="p-3 mt-auto border-t bg-muted/20 flex flex-col gap-2">
                                <div className="flex w-full items-center gap-2">
                                  {isPurchaseOfficer && (
                                    <Button
                                      size="sm"
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // Prepare bulk delivery data with all items from this vendor's PO (with tracking)
                                        const bulkItems = prepareBulkDeliveryItems(group.items);

                                        setBulkDeliveryData({
                                          items: bulkItems,
                                          vendorName: group.vendor.companyName,
                                          poNumber: group.poNumber
                                        });
                                      }}
                                    >
                                      <CheckCircle className="h-4 w-4 mr-1" /> Available
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="px-2"
                                    onClick={() => { setPdfPreviewPoNumber(group.poNumber); setPdfPreviewRequestIds(group.items.map((i: any) => i.requestId)); }}
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {pendingPOs && pendingPOs.filter((p: any) => p.status === "sign_pending").map((group: any) => (
                            <div key={`card-group-${group.poNumber}-${group.vendor?._id}`} className="flex flex-col border rounded-xl bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow ring-1 ring-amber-500/20">
                              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border-b flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-white dark:bg-amber-900/40 flex items-center justify-center shadow-sm text-amber-600">
                                  <Building2 className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-foreground truncate">{group.vendor?.companyName || "Unknown Vendor"}</h3>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <span className="flex items-center gap-1"><Pencil className="h-3 w-3" /> Sign Pending</span>
                                    <span>•</span>
                                    <span className="font-mono">PO: {group.poNumber}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-bold">₹{group.totalAmount.toLocaleString()}</div>
                                </div>
                              </div>
                              <div className="p-3 bg-muted/10 space-y-2">
                                {group.items.map((po: any, idx: number) => (
                                  <div key={po._id} className="flex items-center gap-2.5 text-sm p-2 rounded-lg bg-background/60 border border-border/50 hover:bg-background/80 transition-colors">
                                    <span className="text-xs font-black font-mono bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-2 py-1 rounded-lg shadow-sm min-w-[28px] text-center">
                                      #{po.itemOrder || (idx + 1)}
                                    </span>
                                    <Badge variant="secondary" className="h-5 text-[10px] px-1.5">{po.requestQuantity || po.quantity} {po.requestUnit || po.unit}</Badge>
                                    <span className="truncate flex-1 font-semibold">{po.itemName || po.itemDescription?.split('\n')[0]}</span>
                                    <span className="font-mono text-xs font-bold text-green-600 dark:text-green-400">₹{po.totalAmount?.toLocaleString() || 0}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="p-3 mt-auto border-t bg-muted/20 flex items-center gap-2">
                                {isManager && (
                                  <Button
                                    size="sm"
                                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const poIds = group.items.map((i: any) => i._id);
                                      setShowSignPendingApproveConfirm({ type: 'po_batch', ids: poIds } as any);
                                    }}
                                  >
                                    Sign PO
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={isManager ? "px-2" : "flex-1"}
                                  onClick={() => { setPdfPreviewPoNumber(group.poNumber); setPdfPreviewRequestIds(group.items.map((i: any) => i.requestId)); }}
                                >
                                  <FileText className="h-4 w-4" />
                                  {!isManager && <span className="ml-1.5">PO View</span>}
                                </Button>
                                {isManager && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="px-2 border-red-200 text-red-600 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const poIds = group.items.map((i: any) => i._id);
                                      setShowRejectionInput({ type: 'po_batch', ids: poIds } as any);
                                    }}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                          {/* Sign Rejected PO Groups - Vendor-wise (Card View) */}
                          {pendingPOs && pendingPOs.filter((p: any) => p.status === "sign_rejected").map((group: any) => (
                            <div key={`card-rejected-${group.poNumber}-${group.vendor?._id}`} className="flex flex-col border rounded-xl bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow ring-1 ring-red-500/20">
                              <div className="p-4 bg-red-50 dark:bg-red-950/20 border-b flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-white dark:bg-red-900/40 flex items-center justify-center shadow-sm text-red-600">
                                  <Building2 className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-foreground truncate">{group.vendor?.companyName || "Unknown Vendor"}</h3>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <span className="flex items-center gap-1 text-red-600"><XCircle className="h-3 w-3" /> Sign Rejected</span>
                                    <span>•</span>
                                    <span className="font-mono">PO: {group.poNumber}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-bold">₹{group.totalAmount.toLocaleString()}</div>
                                </div>
                              </div>
                              <div className="p-3 bg-muted/10 space-y-2">
                                {group.items.map((po: any, idx: number) => (
                                  <div key={po._id} className="flex items-center gap-2.5 text-sm p-2 rounded-lg bg-background/60 border border-border/50 hover:bg-background/80 transition-colors">
                                    <span className="text-xs font-black font-mono bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-2 py-1 rounded-lg shadow-sm min-w-[28px] text-center">
                                      #{po.itemOrder || (idx + 1)}
                                    </span>
                                    <Badge variant="secondary" className="h-5 text-[10px] px-1.5">{po.requestQuantity || po.quantity} {po.requestUnit || po.unit}</Badge>
                                    <span className="truncate flex-1 font-semibold">{po.itemName || po.itemDescription?.split('\n')[0]}</span>
                                    <span className="font-mono text-xs font-bold text-green-600 dark:text-green-400">₹{po.totalAmount?.toLocaleString() || 0}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="p-3 mt-auto border-t bg-muted/20 flex items-center gap-2">
                                {isPurchaseOfficer && onCreatePO && (
                                  <Button
                                    size="sm"
                                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const requestIds = group.items.map((i: any) => i.requestId);
                                      if (requestIds.length > 0) {
                                        onCreatePO(requestIds);
                                      }
                                    }}
                                  >
                                    <RefreshCw className="h-4 w-4 mr-1.5" /> Resubmit PO ({group.items.length} items)
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={isPurchaseOfficer ? "px-3" : "flex-1"}
                                  onClick={() => { setPdfPreviewPoNumber(group.poNumber); setPdfPreviewRequestIds(group.items.map((i: any) => i.requestId)); }}
                                >
                                  <FileText className="h-4 w-4" />
                                  {!isPurchaseOfficer && <span className="ml-1.5">PO View</span>}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {(allRequests || [])
                            .sort((a, b) => {
                              const orderA = a.itemOrder ?? a.createdAt;
                              const orderB = b.itemOrder ?? b.createdAt;
                              return orderA - orderB;
                            })
                            .map((item, idx) => {
                              const isPending = item.status === "pending";
                              const displayNumber = item.itemOrder ?? idx + 1;
                              const isSelected = selectedItemsForAction.has(item._id);
                              const itemPhotos = getItemPhotos(item);

                              // Check if item is part of a sign_pending PO group
                              const itemPOGroup = pendingPOs?.find((group: any) =>
                                group.status === "sign_pending" &&
                                group.items.some((i: any) => i.requestId === item._id)
                              );
                              // Also check if item is part of a pending_po group (ordered status)
                              const itemPendingPOGroup = pendingPOs?.find((group: any) =>
                                group.status === "ordered" &&
                                group.items.some((i: any) => i.requestId === item._id)
                              );
                              // Also check if item is part of a sign_rejected PO group
                              const itemRejectedPOGroup = pendingPOs?.find((group: any) =>
                                group.status === "sign_rejected" &&
                                group.items.some((i: any) => i.requestId === item._id)
                              );
                              if (itemPOGroup || itemPendingPOGroup || itemRejectedPOGroup) return null; // Rendered in group card

                              return (
                                <div
                                  key={item._id}
                                  className={cn(
                                    "group relative flex flex-col rounded-2xl bg-card text-card-foreground shadow-sm transition-all duration-300 hover:shadow-xl overflow-hidden hover:-translate-y-1",
                                    getStatusBgTint(item.status),
                                    // Apply status color class (inherits to Left primarily)
                                    getStatusBorderClass(item.status),
                                    // Left thick border inheriting status color
                                    "border-l-[6px] border-l-[color:inherit]",
                                    // Other sides neutral/thin (overriding status color)
                                    "border-t border-r border-b border-t-border/40 border-r-border/40 border-b-border/40",

                                    isSelected && "ring-4 ring-primary/20 bg-primary/5"
                                  )}
                                >
                                  {/* Selection Checkbox */}
                                  {((isManager && item.status === "pending") || (isPurchaseOfficer && ["pending_po", "direct_po", "ready_for_po", "ready_for_delivery"].includes(item.status))) && (
                                    <div className="absolute top-2 right-2 z-10">
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggleItemSelection(item._id)}
                                        className={cn(
                                          "h-5 w-5 bg-background shadow-sm border-2",
                                          item.status === "ready_for_po"
                                            ? "border-emerald-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                                            : "data-[state=checked]:border-primary"
                                        )}
                                      />
                                    </div>
                                  )}

                                  {/* Top Section: Image & Basic Info */}
                                  <div className="p-5 flex gap-6 border-b border-border/40 bg-muted/10 items-start min-h-[120px]">
                                    {/* Image Container - Fixed Width */}
                                    <div className="flex-shrink-0 relative w-[85px]">
                                      <div className="w-full aspect-square rounded-xl overflow-hidden bg-background ring-1 ring-border/50 flex items-center justify-center group-hover:ring-primary/20 transition-all shadow-sm">
                                        {itemPhotos.length > 0 ? (
                                          <CompactImageGallery
                                            images={itemPhotos}
                                            maxDisplay={1}
                                            size="xl"
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="flex flex-col items-center justify-center opacity-30">
                                            <ImageIcon className="h-6 w-6 mb-1" />
                                            <span className="text-[7px] font-black uppercase tracking-widest leading-none">EMPTY</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Content Container */}
                                    {/* Content Container */}
                                    <div className="min-w-0 flex-1 flex flex-col justify-between h-full pt-1">
                                      <div className="flex flex-col gap-1.5">
                                        <div className="flex items-start gap-2.5">
                                          <span className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-black font-mono px-2.5 py-1.5 rounded-lg shadow-lg shrink-0 mt-0.5">
                                            #{displayNumber}
                                          </span>
                                          <h4
                                            className="font-black text-lg leading-tight text-foreground dark:text-white hover:text-primary transition-colors cursor-pointer line-clamp-2 uppercase tracking-tight"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedItemName(item.itemName);
                                            }}
                                            title={item.itemName}
                                          >
                                            {item.itemName}
                                          </h4>
                                        </div>
                                        <div className="text-xs text-muted-foreground/90 dark:text-slate-300 leading-relaxed line-clamp-2 pr-2">
                                          {item.description || "No description provided for this item."}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Info Table-like Rows */}
                                  <div className="grid grid-cols-2 divide-x divide-border/40 border-b border-border/40 bg-card/30">
                                    <div className="p-3 flex flex-col gap-1.5">
                                      <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest leading-none">Quantity</span>
                                      <div className="flex items-baseline gap-1">
                                        <span className="text-lg font-black text-foreground">{item.quantity}</span>
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{item.unit}</span>
                                      </div>
                                    </div>
                                    <div className="p-3 flex flex-col gap-1.5 items-end">
                                      <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest leading-none">Current Status</span>
                                      <div className="flex flex-col items-end gap-1">
                                        {getStatusBadge(item.status)}
                                        {item.isUrgent && item.status !== "direct_po" && item.directAction !== "po" && <Badge variant="destructive" className="h-4 text-[9px] px-1 font-black uppercase tracking-widest animate-pulse border-none">Urgent</Badge>}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Inventory Row - Table-like */}
                                  <div className="px-3 py-2 bg-muted/5 border-b border-border/40 flex items-center justify-between gap-4">
                                    <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest min-w-fit">Inventory</span>
                                    <div className="flex-1 overflow-hidden">
                                      {getInventoryStatusBadge(item.itemName, item.quantity, item.unit)}
                                    </div>
                                  </div>


                                  {/* Item Details Grid */}





                                  {/* Actions Footer for Cards */}
                                  {((isManager && (isPending || item.status === "recheck" || item.status === "sign_pending" || item.status === "cc_pending" || item.status === "sign_rejected" || item.status === "rejected")) ||
                                    (isPurchaseOfficer && ["pending_po", "direct_po", "ready_for_po", "ready_for_delivery", "recheck", "approved", "ready_for_cc", "cc_pending", "cc_rejected", "out_for_delivery", "delivery_processing", "delivery_stage", "delivered"].includes(item.status)) ||
                                    (isSiteEngineer && ["cc_pending", "cc_rejected", "ready_for_po", "out_for_delivery", "delivery_processing", "delivery_stage"].includes(item.status))) && (
                                      <div className={cn(
                                        "p-4 border-t bg-muted/5 w-full",
                                        (item.status === "sign_pending" || item.status === "sign_rejected") ? "grid grid-cols-2 gap-3" : "flex"
                                      )}>
                                        {item.status === "sign_pending" ? (
                                          <>
                                            <Button
                                              variant="default"
                                              size="sm"
                                              className="h-9 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                                              onClick={(e) => { e.stopPropagation(); setShowSignPendingApproveConfirm(item._id); }}
                                              disabled={isLoading}
                                            >
                                              <Pencil className="h-4 w-4 mr-1.5" /> Sign PO
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-9 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-950/20"
                                              onClick={(e) => { e.stopPropagation(); setShowItemRejectionInput(item._id); }}
                                              disabled={isLoading}
                                            >
                                              <XCircle className="h-4 w-4 mr-1.5" /> Reject
                                            </Button>
                                          </>
                                        ) : (item.status === "pending") ? (
                                          /* Standard Approve/Reject */
                                          <RenderActionSegments item={item} isCard />
                                        ) : item.status === "cc_pending" ? (
                                          <div className="flex flex-col gap-3 w-full">
                                            {/* Vendor Details Section */}
                                            {item.vendorQuotes && item.vendorQuotes.length > 0 && (
                                              <div className="flex flex-col gap-1.5 p-2 bg-background/50 rounded-md border border-border/50">
                                                <div className="flex items-center gap-1.5">
                                                  <Building2 className="h-3 w-3 text-muted-foreground" />
                                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vendor Details</span>
                                                </div>
                                                <div className="flex flex-col gap-0.5 pl-4.5">
                                                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                                    Vendors Quoted: {item.vendorQuotes.length} vendors
                                                  </span>
                                                </div>
                                              </div>
                                            )}

                                            <RenderActionSegments
                                              item={item}
                                              isCard
                                              mergedCCIds={allCCIdsGlobal as any}
                                              showMergedCCButton={
                                                allCCStatusItems.length <= 1 || item._id === firstCCItemIdGlobal
                                              }
                                            />
                                          </div>
                                        ) : (
                                          <RenderActionSegments item={item} isCard />
                                        )}
                                      </div>
                                    )}


                                  {/* Resubmit PO Footer for Purchase Officer (Card View) - Sign Rejected */}
                                  {isPurchaseOfficer && item.status === "sign_rejected" && onCreatePO && (
                                    <div className="p-4 border-t bg-muted/5 w-full">
                                      <Button
                                        size="sm"
                                        className="w-full h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all hover:scale-[1.02] border-0"
                                        onClick={(e) => { e.stopPropagation(); onCreatePO([item._id]); }}
                                      >
                                        <RefreshCw className="h-4 w-4 mr-2" /> Resubmit PO
                                      </Button>
                                    </div>
                                  )}


                                  {/* Rejection Input Overlay - In-place Card Style */}
                                  {showItemRejectionInput === item._id && (
                                    <div className="absolute inset-x-2 bottom-2 z-20 bg-background/95 p-3 rounded-lg border shadow-lg animate-in slide-in-from-bottom-2">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                          <Label className="text-xs font-bold text-destructive flex items-center gap-1.5">
                                            <AlertCircle className="h-3 w-3" /> Rejection Note
                                          </Label>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 rounded-full hover:bg-muted"
                                            onClick={() => setShowItemRejectionInput(null)}
                                            title="Cancel"
                                          >
                                            <XCircle className="h-4 w-4 text-muted-foreground" />
                                          </Button>
                                        </div>
                                        <Textarea
                                          value={itemRejectionReasons[item._id] || ""}
                                          onChange={(e) => setItemRejectionReasons((prev) => ({ ...prev, [item._id]: e.target.value }))}
                                          placeholder="Reason for rejection..."
                                          className="min-h-[60px] text-xs resize-none bg-background focus-visible:ring-destructive/20"
                                          autoFocus
                                        />
                                        <div className="flex justify-end gap-2">
                                          <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => handleItemReject(item._id)}
                                            className="h-7 text-xs px-3 shadow-sm w-full"
                                          >
                                            Confirm Reject
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                              );
                            })}
                        </div>
                      </div>
                    )
                  ) : (
                    // Fallback to single item display if allRequests not loaded yet
                    <div className="space-y-4">
                      <div className="p-4 border rounded-lg bg-card space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          {request.isUrgent && request.status !== "direct_po" && request.directAction !== "po" && (
                            <Badge variant="destructive" className="text-xs uppercase">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Urgent
                            </Badge>
                          )}
                          {(allItemsHaveSameStatus || overallStatus === "partially_processed") && getStatusBadge(overallStatus || request.status)}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-muted-foreground">Item Name</Label>
                            <p className="font-medium">{request.itemName}</p>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Quantity</Label>
                            <p className="font-medium">
                              {request.quantity} {request.unit}
                            </p>
                          </div>
                        </div>

                        {request.description && (
                          <div>
                            <Label className="text-muted-foreground">Description</Label>
                            <p className="text-sm">{request.description}</p>
                          </div>
                        )}

                        {request.specsBrand && (
                          <div>
                            <Label className="text-muted-foreground">Specs/Brand</Label>
                            <p className="text-sm font-medium">{request.specsBrand}</p>
                          </div>
                        )}

                        {request.notes && (
                          <div>
                            <Label className="text-muted-foreground">Notes</Label>
                            <p className="text-sm whitespace-pre-wrap">{request.notes}</p>
                          </div>
                        )}

                        {request.photo && (
                          <div>
                            <Label className="text-muted-foreground">Photo</Label>
                            <div className="mt-2">
                              <img
                                src={request.photo.imageUrl}
                                alt="Request photo"
                                className="max-w-full h-auto rounded-md border max-h-64 object-contain"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Approval Information Removed (Simplified) */}
                {/* Rejection Information - Consolidated */}
                {((allRequests && allRequests.some(i => (i.status === "rejected" || i.status === "sign_rejected") && i.rejectionReason)) || request.rejectionReason) && (
                  <div className="space-y-3 pt-2">
                    <Label className="text-xs font-bold text-destructive uppercase tracking-wider flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Rejection Details
                    </Label>
                    <div className="space-y-2">
                      {allRequests && allRequests.some(i => (i.status === "rejected" || i.status === "sign_rejected") && i.rejectionReason) ? (
                        allRequests
                          .filter(item => (item.status === "rejected" || item.status === "sign_rejected") && item.rejectionReason)
                          .map((item) => (
                            <div key={item._id} className="p-3 bg-red-50/50 dark:bg-red-950/10 border-l-2 border-red-500 rounded-r-md">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-bold text-red-900 dark:text-red-200">
                                  {item.itemName}
                                </span>
                                <span className="text-sm text-red-700 dark:text-red-300 leading-snug">
                                  {item.rejectionReason}
                                </span>
                              </div>
                            </div>
                          ))
                      ) : (
                        <div className="p-3 bg-red-50/50 dark:bg-red-950/10 border-l-2 border-red-500 rounded-r-md">
                          <span className="text-sm text-red-700 dark:text-red-300 leading-snug">
                            {request.rejectionReason}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}


                {/* Delivery Information */}
                {request.deliveryMarkedAt && (
                  <>
                    <Separator className="my-4" />
                    <div>
                      <Label className="text-muted-foreground text-xs uppercase tracking-wider">Delivery Status</Label>
                      <div className="mt-1 flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle className="h-4 w-4" />
                        Delivered on {format(new Date(request.deliveryMarkedAt), "dd MMM, hh:mm a")}
                      </div>
                    </div>
                  </>
                )}

                {/* Notes Section - Refined */}
                <Separator className="my-4" />
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold flex items-center gap-2">
                      <NotebookPen className="h-4 w-4 text-primary" />
                      Notes & Timeline
                    </h4>
                    {notes && notes.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] font-medium text-muted-foreground hover:text-primary px-2"
                        onClick={() => setShowNotesTimeline(true)}
                      >
                        View History ({notes.length})
                      </Button>
                    )}
                  </div>

                  {/* Latest Note Preview */}
                  {latestNote ? (
                    <div className="bg-muted/40 p-3 rounded-lg border border-border/50 text-sm relative group">
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                            {latestNote.userName.charAt(0)}
                          </div>
                          <span className="font-semibold text-xs">{latestNote.userName}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(latestNote.createdAt), "MMM d, h:mm a")}</span>
                      </div>
                      <p className="text-foreground/80 text-xs leading-relaxed pl-7">{latestNote.content}</p>
                    </div>
                  ) : (
                    <div className="text-center py-4 bg-muted/20 rounded-lg border border-dashed border-border/60">
                      <p className="text-xs text-muted-foreground italic">No notes added yet</p>
                    </div>
                  )}

                  {/* Add Note Input */}
                  <div className="flex gap-2 items-end pt-1">
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Type a note..."
                      className="min-h-[38px] h-[38px] py-2 text-sm resize-none flex-1 bg-background focus:h-[60px] transition-all duration-200"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddNote();
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={handleAddNote}
                      disabled={!newNote.trim() || isSubmittingNote}
                      className="h-[38px] w-[38px] shrink-0 shadow-sm"
                    >
                      {isSubmittingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Actions - Simplified for Mobile Site Engineers */}
                {canMarkDelivery && isMobileLayout && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <div className="text-center">
                        <p className="text-base text-muted-foreground mb-4">
                          Did you receive all the materials?
                        </p>
                        <Button
                          onClick={handleMarkDelivery}
                          disabled={isLoading}
                          className="w-full h-16 text-lg font-bold bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="h-6 w-6 mr-3" />
                          ✓ Got Materials
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {/* Manager Actions - Simplified and Systematic */}
                {(canApprove || canReject) && !isMobileLayout && (
                  <>




                    {/* Direct Delivery Confirmation */}
                    {showDirectDeliveryConfirm && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                        <div className="w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl">
                          <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center">
                                <Package className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                  Confirm Direct Delivery
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                  Send {selectedItemsForAction.size > 0 ? selectedItemsForAction.size : 'all'} items directly to Out for Delivery from Inventory?
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-3">
                              <Button
                                onClick={async () => {
                                  const itemsToProcess = selectedItemsForAction.size > 0
                                    ? Array.from(selectedItemsForAction)
                                    : pendingItems.map(item => item._id);

                                  try {
                                    await bulkUpdateStatus({
                                      requestIds: itemsToProcess,
                                      status: "delivery_stage",
                                    });
                                    setShowDirectDeliveryConfirm(false);
                                    setSelectedItemsForAction(new Set());
                                    onOpenChange(false);
                                    toast.success(`${itemsToProcess.length} items sent to Out for Delivery`);
                                  } catch (error: any) {
                                    toast.error(error.message || "Failed to process Direct Delivery");
                                  }
                                }}
                                disabled={isLoading}
                                className="flex-1 bg-purple-600 hover:bg-purple-700"
                              >
                                <Package className="h-4 w-4 mr-2" />
                                Confirm
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setShowDirectDeliveryConfirm(false)}
                                disabled={isLoading}
                                className="flex-1"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}


                    {/* REMOVED INLINE CONFIRMATION DIALOGS - MOVED TO PORTALS BELOW */}
                  </>
                )}
              </div>

            </div>
          </div>



          {/* Footer - Sticky */}
          <DialogFooter className="px-3 sm:px-6 py-3 sm:py-4 border-t bg-muted/30">
            <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
              <div className="text-xs text-muted-foreground text-center sm:text-left order-2 sm:order-1">
                {pendingItems.length > 0 && (
                  <span>{pendingItems.length} item{pendingItems.length > 1 ? 's' : ''} pending review</span>
                )}
                {signPendingItems.length > 0 && (
                  <span className={pendingItems.length > 0 ? "ml-2 pl-2 border-l border-border/50" : ""}>
                    {signPendingItems.length} item{signPendingItems.length > 1 ? 's' : ''} waiting for signature
                  </span>
                )}
              </div>

              {(canReject || canApprove) && (
                <div className="flex items-center gap-3 w-full sm:w-auto order-1 sm:order-2">
                  {canReject && (
                    <Button
                      variant="outline"
                      className="flex-1 sm:flex-none border-red-500 text-red-600 hover:bg-red-50 font-bold h-10 px-6"
                      onClick={() => setShowRejectionInput(true)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {selectedItemsForAction.size > 0
                        ? `Reject (${selectedItemsForAction.size})`
                        : (pendingItems.length === 0 && signPendingItems.length > 0) ? "Reject PO" : "Reject All"}
                    </Button>
                  )}
                  {canApprove && (
                    <Button
                      className={cn(
                        "flex-1 sm:flex-none font-bold h-10 px-6 text-white",
                        (pendingItems.length === 0 && signPendingItems.length > 0)
                          ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-orange-500/20"
                          : "bg-emerald-600 hover:bg-emerald-700"
                      )}
                      onClick={() => setShowSignPendingApproveConfirm(true)}
                    >
                      {(pendingItems.length === 0 && signPendingItems.length > 0) ? <Pencil className="h-4 w-4 mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      {selectedItemsForAction.size > 0
                        ? (pendingItems.length === 0 && signPendingItems.length > 0 ? `Sign PO (${selectedItemsForAction.size})` : `Approve (${selectedItemsForAction.size})`)
                        : (pendingItems.length === 0 && signPendingItems.length > 0) ? "Sign PO" : "Approve All"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </DialogFooter>
        </DialogContent >
      </Dialog >

      {/* DIALOG-WRAPPED CONFIRMATION DIALOGS - REPLACING MANUAL PORTALS */}
      {showApproveConfirm && (
        <Dialog open={showApproveConfirm} onOpenChange={setShowApproveConfirm}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                  Confirm Approval
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Approve {selectedItemsForAction.size > 0 ? selectedItemsForAction.size : 'all'} pending items?
                </DialogDescription>
              </div>
            </div>
            <DialogFooter className="flex gap-3 sm:justify-start">
              <Button
                onClick={async () => {
                  const itemsToProcess = selectedItemsForAction.size > 0
                    ? Array.from(selectedItemsForAction)
                    : pendingItems.map(item => item._id);

                  // Keep dialog open, just close confirmation
                  setShowApproveConfirm(false);
                  setSelectedItemsForAction(new Set());

                  try {
                    await bulkUpdateStatus({
                      requestIds: itemsToProcess,
                      status: "approved",
                    });
                    toast.success(`${itemsToProcess.length} items approved`);
                  } catch (error: any) {
                    toast.error(error.message || "Failed to approve items");
                  }
                }}
                disabled={isLoading}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowApproveConfirm(false)}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showDirectPOConfirm && (
        <Dialog open={showDirectPOConfirm} onOpenChange={setShowDirectPOConfirm}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                  Confirm Direct PO
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Mark {selectedItemsForAction.size > 0 ? selectedItemsForAction.size : 'all'} items for Direct PO? This will bypass Cost Comparison as no stock is available.
                </DialogDescription>
              </div>
            </div>
            <DialogFooter className="flex gap-3 sm:justify-start">
              <Button
                onClick={async () => {
                  const itemsToProcess = selectedItemsForAction.size > 0
                    ? Array.from(selectedItemsForAction)
                    : pendingItems.map(item => item._id);

                  // Keep dialog open, just close confirmation
                  setShowDirectPOConfirm(false);
                  setSelectedItemsForAction(new Set());

                  try {
                    await bulkUpdateStatus({
                      requestIds: itemsToProcess,
                      status: "direct_po",
                    });
                    toast.success(`${itemsToProcess.length} items marked for Direct PO`);
                  } catch (error: any) {
                    toast.error(error.message || "Failed to process Ready for CC");
                  }
                }}
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Confirm
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDirectPOConfirm(false)}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showBulkSplitConfirm && (
        <Dialog open={showBulkSplitConfirm} onOpenChange={setShowBulkSplitConfirm}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 dark:bg-indigo-900/20 rounded-full flex items-center justify-center">
                <PieChart className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                  Check & Approve Splits for {selectedItemsForAction.size > 0 ? selectedItemsForAction.size : 'All'} Items?
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  This will automatically set inventory fulfillment to the <strong>maximum available stock</strong> for each item and approve the split plan.
                </DialogDescription>
              </div>
            </div>
            <DialogFooter className="flex gap-3 sm:justify-start">
              <Button
                onClick={async () => {
                  const itemsToProcess = selectedItemsForAction.size > 0
                    ? pendingItems.filter(item => selectedItemsForAction.has(item._id))
                    : pendingItems;

                  let processedCount = 0;
                  try {
                    await Promise.all(itemsToProcess.map(async (item) => {
                      const status = Array.isArray(inventoryStatus) ? inventoryStatus.find((s: any) => s.requestedName === item.itemName) : undefined;
                      if (status && status.centralStock > 0) {
                        const maxStock = Math.min(status.centralStock, item.quantity);
                        // Upsert CC with max inventory
                        await upsertCC({
                          requestId: item._id,
                          vendorQuotes: item.vendorQuotes?.map(q => ({
                            vendorId: q.vendorId,
                            unitPrice: q.unitPrice,
                            amount: q.amount,
                            unit: q.unit,
                            discountPercent: (q as any).discountPercent,
                            gstPercent: (q as any).gstPercent
                          })) || [], // Map strict types
                          isDirectDelivery: false,
                          inventoryFulfillmentQuantity: maxStock
                        });
                        // Approve Split
                        await approveSplit({ requestId: item._id });
                        processedCount++;
                      }
                    }));

                    setShowBulkSplitConfirm(false);
                    setSelectedItemsForAction(new Set());
                    onOpenChange(false);
                    toast.success(`${processedCount} items split and approved`);
                  } catch (error: any) {
                    toast.error("Failed to batch process: " + error.message);
                  }
                }}
                disabled={isLoading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm All
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBulkSplitConfirm(false)}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showPermissionConfirm && (
        <Dialog open={!!showPermissionConfirm} onOpenChange={(open) => !open && setShowPermissionConfirm(null)}>
          <DialogContent className="sm:max-w-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 p-0 overflow-hidden">
            <div className={cn(
              "p-4 text-white",
              showPermissionConfirm.permission === "delivery" && "bg-gradient-to-r from-purple-500 to-purple-700",
              showPermissionConfirm.permission === "split" && "bg-gradient-to-r from-blue-500 to-blue-700",
              showPermissionConfirm.permission === "po" && "bg-gradient-to-r from-orange-500 to-orange-700"
            )}>
              <div className="flex items-center gap-3">
                {showPermissionConfirm.permission === "delivery" && <Package className="h-6 w-6" />}
                {showPermissionConfirm.permission === "split" && <GitFork className="h-6 w-6" />}
                {showPermissionConfirm.permission === "po" && <ShoppingCart className="h-6 w-6" />}
                <div>
                  <DialogTitle className="text-lg font-bold text-white">Grant Permission</DialogTitle>
                  <DialogDescription className="text-sm opacity-90 text-white/80">{showPermissionConfirm.permissionLabel}</DialogDescription>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                Are you sure you want to grant <span className="font-semibold text-gray-900 dark:text-white">{showPermissionConfirm.permissionLabel}</span> permission for:
              </p>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 my-3">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {showPermissionConfirm.itemName}
                </p>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
                ⚠️ This action cannot be undone. The permission will be locked.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowPermissionConfirm(null)}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGrantPermission}
                  disabled={isLoading}
                  className={cn(
                    "flex-1 text-white",
                    showPermissionConfirm.permission === "delivery" && "bg-purple-600 hover:bg-purple-700",
                    showPermissionConfirm.permission === "split" && "bg-blue-600 hover:bg-blue-700",
                    showPermissionConfirm.permission === "po" && "bg-orange-600 hover:bg-orange-700"
                  )}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Granting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Grant Permission
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showItemApproveConfirm && (
        <Dialog open={!!showItemApproveConfirm} onOpenChange={(open) => !open && setShowItemApproveConfirm(null)}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                  Confirm Item Approval
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Approve this individual item?
                </DialogDescription>
              </div>
            </div>
            <DialogFooter className="flex gap-3 sm:justify-start">
              <Button
                onClick={() => {
                  if (showItemApproveConfirm) {
                    handleItemApprove(showItemApproveConfirm);
                    setShowItemApproveConfirm(null);
                  }
                }}
                disabled={isLoading}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowItemApproveConfirm(null)}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showItemDirectPOConfirm && (
        <Dialog open={!!showItemDirectPOConfirm} onOpenChange={(open) => !open && setShowItemDirectPOConfirm(null)}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                  Confirm Direct PO
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Create a Direct PO for this item? This will bypass Cost Comparison as no stock is available.
                </DialogDescription>
              </div>
            </div>
            <DialogFooter className="flex gap-3 sm:justify-start">
              <Button
                onClick={() => {
                  if (showItemDirectPOConfirm) {
                    handleItemDirectPO(showItemDirectPOConfirm);
                    setShowItemDirectPOConfirm(null);
                  }
                }}
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Confirm
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowItemDirectPOConfirm(null)}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showItemDirectDeliveryConfirm && (
        <Dialog open={!!showItemDirectDeliveryConfirm} onOpenChange={(open) => !open && setShowItemDirectDeliveryConfirm(null)}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center">
                <Package className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                  Confirm Item Delivery
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Send this individual item directly to Out for Delivery from Inventory?
                </DialogDescription>
              </div>
            </div>
            <DialogFooter className="flex gap-3 sm:justify-start">
              <Button
                onClick={async () => {
                  if (!showItemDirectDeliveryConfirm) return;
                  try {
                    await updateStatus({
                      requestId: showItemDirectDeliveryConfirm,
                      status: "delivery_stage", // Maps to ready_for_cc + directAction: delivery
                    });
                    setShowItemDirectDeliveryConfirm(null);
                    toast.success("Item sent to Out for Delivery");
                  } catch (error: any) {
                    toast.error(error.message || "Failed to process item");
                  }
                }}
                disabled={isLoading}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
              >
                <Package className="h-4 w-4 mr-2" />
                Confirm
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowItemDirectDeliveryConfirm(null)}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showRejectionInput && (
        <Dialog open={!!showRejectionInput} onOpenChange={(open) => !open && setShowRejectionInput(false)}>
          <DialogContent className="sm:max-w-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            <div className="flex flex-col items-center text-center gap-4 mb-6">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center ring-8 ring-red-50 dark:ring-red-900/10">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <div className="space-y-2">
                <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                  Confirm Rejection
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-500 dark:text-gray-400 max-w-[260px] mx-auto leading-relaxed">
                  Reject {selectedItemsForAction.size > 0
                    ? `${selectedItemsForAction.size} item(s)`
                    : `all ${signPendingItems.length + pendingItems.length} item(s)`}?
                </DialogDescription>
              </div>
            </div>

            <div className="mb-6">
              <Label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block text-left">
                Rejection Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this is being rejected..."
                rows={3}
                className="w-full resize-none border-gray-200 focus:ring-red-500 focus:border-red-500 dark:border-gray-700 dark:bg-gray-800"
              />
            </div>

            <DialogFooter className="grid grid-cols-2 gap-3 sm:justify-between w-full">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectionInput(false);
                  setRejectionReason("");
                }}
                className="w-full h-11 font-medium border-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  // 0. Batch PO Reject
                  if ((showRejectionInput as any)?.type === 'po_batch') {
                    const ids = (showRejectionInput as any).ids;
                    setIsLoading(true);
                    try {
                      await Promise.all(ids.map((id: Id<"purchaseOrders">) => rejectDirectPOById({ poId: id, reason: rejectionReason })));
                      toast.success("Purchase Order Rejected");
                      setShowRejectionInput(false);
                      setRejectionReason("");
                      closeAndRefresh();
                    } catch (err: any) {
                      toast.error("Failed to reject PO: " + err.message);
                    } finally {
                      setIsLoading(false);
                    }
                    return;
                  }

                  // 1. Single Item Rejection (passed via ID)
                  if (typeof showRejectionInput === 'string') {
                    const requestId = showRejectionInput as Id<"requests">;
                    const item = allRequests?.find(r => r._id === requestId);
                    if (item?.status === "sign_pending") {
                      await handleSingleRejectDirectPO(requestId, rejectionReason);
                    } else {
                      await handleItemReject(requestId);
                    }
                    return;
                  }

                  // 2. Bulk Rejection
                  const itemsToProcess = selectedItemsForAction.size > 0
                    ? Array.from(selectedItemsForAction)
                    : [...signPendingItems.map(item => item._id), ...pendingItems.map(item => item._id)];

                  setShowRejectionInput(false);

                  // Separate items by status to use correct mutations
                  const directPOIds: Id<"requests">[] = [];
                  const standardIds: Id<"requests">[] = [];

                  itemsToProcess.forEach(id => {
                    const item = allRequests?.find(r => r._id === id);
                    if (item?.status === "sign_pending" || item?.status === "sign_rejected") {
                      directPOIds.push(id);
                    } else {
                      standardIds.push(id);
                    }
                  });

                  setIsLoading(true);
                  try {
                    const promises = [];

                    if (directPOIds.length > 0) {
                      promises.push(Promise.all(directPOIds.map(id =>
                        rejectDirectPO({ requestId: id, reason: rejectionReason.trim() })
                      )));
                    }

                    if (standardIds.length > 0) {
                      promises.push(bulkUpdateStatus({
                        requestIds: standardIds,
                        status: "rejected",
                        rejectionReason: rejectionReason.trim(),
                      }));
                    }

                    await Promise.all(promises);
                    toast.success(`${itemsToProcess.length} items rejected`);
                    setRejectionReason("");
                    setSelectedItemsForAction(new Set());
                    closeAndRefresh();
                  } catch (error: any) {
                    toast.error(error.message || "Failed to reject items");
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={!rejectionReason.trim() || isLoading}
                className="w-full h-11 font-medium bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 transition-all hover:scale-[1.02]"
              >
                {isLoading ? "Processing..." : "Reject All"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* User Info Dialog */}
      < UserInfoDialog
        open={!!selectedUserId
        }
        onOpenChange={(open) => {
          if (!open) setSelectedUserId(null);
        }}
        userId={selectedUserId}
      />

      {/* Item Info Dialog */}
      < ItemInfoDialog
        open={!!selectedItemName}
        onOpenChange={(open) => {
          if (!open) setSelectedItemName(null);
        }}
        itemName={selectedItemName}
      />

      {/* Site Info Dialog */}
      < LocationInfoDialog
        open={!!selectedSiteId}
        onOpenChange={(open) => {
          if (!open) setSelectedSiteId(null);
        }}
        locationId={selectedSiteId}
      />

      <ProjectInfoDialog
        open={!!selectedProjectId}
        onOpenChange={(open) => {
          if (!open) setSelectedProjectId(null);
        }}
        projectId={selectedProjectId}
      />

      {/* Notes Timeline Dialog */}
      {
        request?.requestNumber && (
          <NotesTimelineDialog
            requestNumber={request.requestNumber}
            open={showNotesTimeline}
            onOpenChange={setShowNotesTimeline}
          />
        )
      }

      {/* Sign Pending Approval Confirmation (Single & Bulk) */}
      {showSignPendingApproveConfirm && (
        <Dialog open={!!showSignPendingApproveConfirm} onOpenChange={(open) => !open && setShowSignPendingApproveConfirm(null)}>
          <DialogContent className="sm:max-w-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 p-6">
            <div className="flex flex-col items-center text-center gap-4 mb-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center ring-8 ring-green-50 dark:ring-green-900/10">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-2">
                <DialogTitle className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                  {typeof showSignPendingApproveConfirm === 'string' ? 'Approve Direct PO' :
                    (showSignPendingApproveConfirm as any)?.type === 'po_batch' ? 'Sign Purchase Order' : 'Batch Approval'}
                </DialogTitle>

                {(showSignPendingApproveConfirm as any)?.type === 'po_batch' ? (
                  <div className="w-full text-left mt-2">
                    {(() => {
                      const ids = (showSignPendingApproveConfirm as any).ids;
                      // Find the group that contains items with matching IDs
                      const matchingGroup = pendingPOs?.find(group =>
                        group.items?.some((item: any) => ids.includes(item._id))
                      );
                      const batchItems = matchingGroup?.items?.filter((item: any) => ids.includes(item._id)) || [];
                      const totalValue = batchItems.reduce((sum: number, item: any) => sum + (item.totalAmount || 0), 0);

                      if (batchItems.length === 0 || !matchingGroup) return null;

                      return (
                        <div className="bg-muted/30 rounded-lg p-3 border border-border/50 space-y-3">
                          {/* Vendor & PO Header */}
                          <div className="flex justify-between items-start border-b border-border/40 pb-2">
                            <div>
                              <div className="font-bold text-sm text-foreground">{matchingGroup.vendor?.companyName}</div>
                              <div className="text-xs text-muted-foreground font-mono mt-0.5">PO: {matchingGroup.poNumber}</div>
                            </div>
                            <Badge variant="outline" className="bg-background font-mono text-xs">
                              ₹{totalValue.toLocaleString()}
                            </Badge>
                          </div>

                          {/* Items List */}
                          <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                            {batchItems.map((po: any, idx: number) => {
                              return (
                                <div key={po._id} className="flex justify-between items-center text-xs bg-background/60 p-2 rounded-lg border border-border/50 hover:bg-background/80 transition-colors">
                                  <div className="flex gap-2.5 items-center overflow-hidden">
                                    <span className="text-xs font-black font-mono bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-2 py-1 rounded-lg shadow-sm min-w-[28px] text-center">#{po.itemOrder || (idx + 1)}</span>
                                    <div className="flex flex-col min-w-0 gap-0.5">
                                      <span className="font-semibold truncate leading-tight" title={po.itemName || po.itemDescription}>{po.itemName || po.itemDescription?.split('\n')[0] || "Item"}</span>
                                      <span className="text-[10px] text-muted-foreground font-medium bg-muted/40 px-1.5 py-0.5 rounded w-fit">{po.requestQuantity || po.quantity} {po.requestUnit || po.unit}</span>
                                    </div>
                                  </div>
                                  <div className="font-mono font-bold text-right whitespace-nowrap pl-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40 px-2 py-1 rounded">
                                    ₹{po.totalAmount?.toLocaleString() || 0}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="text-center pt-1">
                            <p className="text-[10px] text-muted-foreground italic">
                              Signing this PO will approve {batchItems.length} item(s).
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <DialogDescription className="text-base text-gray-500 dark:text-gray-400 max-w-[280px] mx-auto leading-relaxed">
                    {typeof showSignPendingApproveConfirm === 'string'
                      ? "Are you sure you want to approve this Direct PO?"
                      : <>You are about to <span className="font-bold text-emerald-600 dark:text-emerald-400">approve</span> {selectedItemsForAction.size > 0 ? selectedItemsForAction.size : (pendingItems.length > 0 ? pendingItems.length : signPendingItems.length)} item(s).</>
                    }
                  </DialogDescription>
                )}
              </div>
            </div>
            <DialogFooter className="grid grid-cols-2 gap-3 sm:justify-between w-full">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setShowSignPendingApproveConfirm(null);
                }}
                className="w-full h-12 font-bold border-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-white transition-all shadow-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={async (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (typeof showSignPendingApproveConfirm === 'string') {
                    await handleSingleApproveDirectPO(showSignPendingApproveConfirm as Id<"requests">);
                  } else if ((showSignPendingApproveConfirm as any)?.type === 'po_batch') {
                    // Authenticated batch approve by PO IDs
                    const ids = (showSignPendingApproveConfirm as any).ids;
                    setIsLoading(true);
                    try {
                      await Promise.all(ids.map((id: Id<"purchaseOrders">) => approveDirectPOById({ poId: id })));
                      toast.success("Purchase Order Signed Successfully");
                      setShowSignPendingApproveConfirm(null);
                      closeAndRefresh();
                    } catch (err: any) {
                      toast.error("Failed to sign PO: " + err.message);
                    } finally {
                      setIsLoading(false);
                    }
                  } else {
                    await handleApproveAll();
                  }
                }}
                disabled={isLoading}
                className={cn(
                  "w-full h-12 font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]",
                  signPendingItems.length > 0 || (showSignPendingApproveConfirm as any)?.type === 'po_batch'
                    ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-orange-500/20"
                    : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/20"
                )}
              >
                {isLoading ? "Processing..." : (typeof showSignPendingApproveConfirm === 'string' ? "Confirm Approve" : "Confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}


      {/* Edit PO Quantity Dialog */}
      <EditPOQuantityDialog
        open={!!editQuantityItem}
        onOpenChange={(open) => !open && setEditQuantityItem(null)}
        requestId={editQuantityItem?.id || null}
        currentQuantity={editQuantityItem?.quantity || 0}
        itemName={editQuantityItem?.name || ""}
        unit={editQuantityItem?.unit || ""}
        onSuccess={() => {
          setEditQuantityItem(null);
          // Data will refresh automatically via Convex reactivity
        }}
      />

      {/* Split PO Quantity Dialog (vendor can't supply full amount) */}
      <SplitPOQuantityDialog
        open={!!splitPOQuantityItem}
        onOpenChange={(open) => !open && setSplitPOQuantityItem(null)}
        requestId={splitPOQuantityItem?.id || null}
        currentQuantity={splitPOQuantityItem?.quantity || 0}
        itemName={splitPOQuantityItem?.name || ""}
        unit={splitPOQuantityItem?.unit || ""}
        onSuccess={() => {
          setSplitPOQuantityItem(null);
        }}
      />

      <BulkDeliveryDialog
        open={!!bulkDeliveryData}
        onOpenChange={(open) => !open && setBulkDeliveryData(null)}
        items={bulkDeliveryData?.items || []}
        vendorName={bulkDeliveryData?.vendorName || ""}
        poNumber={bulkDeliveryData?.poNumber || ""}
        mode={bulkDeliveryData?.mode || "delivery"}
        onDirectDelivery={async (quantities) => {
          if (!bulkDeliveryData) return;
          const items = bulkDeliveryData.items;
          let deliveredCount = 0;
          for (const item of items) {
            const qty = quantities[item.requestId];
            if (qty > 0) {
              await markReadyForDelivery({
                requestId: item.requestId,
                deliveryQuantity: qty,
                targetStatus: "delivered",
              });
              deliveredCount++;
            }
          }
          if (deliveredCount > 0) {
            toast.success(`Successfully marked ${deliveredCount} item(s) as directly delivered`);
          }
        }}
      />

      {/* Direct Delivery Confirmation Dialog */}
      {showBulkDirectDeliveryConfirm && (
        <Dialog open={!!showBulkDirectDeliveryConfirm} onOpenChange={(open) => !open && setShowBulkDirectDeliveryConfirm(null)}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-violet-100 dark:bg-violet-900/20 rounded-full flex items-center justify-center">
                <Truck className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                  Confirm Direct Delivery
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Mark all {showBulkDirectDeliveryConfirm.items.length} item(s) from PO {showBulkDirectDeliveryConfirm.poNumber} as Delivered? This bypasses the Delivery Challan stage.
                </DialogDescription>
              </div>
            </div>
            <DialogFooter className="flex gap-3 sm:justify-start">
              <Button
                onClick={async () => {
                  if (!showBulkDirectDeliveryConfirm) return;
                  try {
                    setIsLoading(true);
                    let deliveredCount = 0;
                    for (const item of showBulkDirectDeliveryConfirm.items) {
                      await markReadyForDelivery({
                        requestId: item.requestId,
                        deliveryQuantity: item.requestedQuantity,
                        targetStatus: "delivered",
                      });
                      deliveredCount++;
                    }
                    setShowBulkDirectDeliveryConfirm(null);
                    toast.success(`Successfully marked ${deliveredCount} item(s) as directly delivered`);
                  } catch (error: any) {
                    toast.error(error.message || "Failed to process direct delivery");
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Truck className="h-4 w-4 mr-2" />
                Confirm Delivery
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBulkDirectDeliveryConfirm(null)}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Direct PO Creation Dialog */}
      <DirectPODialog
        open={showDirectPODialog}
        onOpenChange={setShowDirectPODialog}
        initialData={directPOInitialData}
      />

      {/* Multi-Item DC Creation Dialog */}
      <CreateDCMultiDialog
        open={showBulkDCDialog}
        onOpenChange={(open) => {
          setShowBulkDCDialog(open);
          if (!open) {
            setSelectedDCItems(new Set());
          }
        }}
        items={Array.from(selectedDCItems).map(requestId => {
          const item = allRequests?.find(i => i._id === requestId);
          const poNumber = requestToPONumber.get(requestId);
          return {
            requestId,
            itemName: item?.itemName || "",
            quantity: item?.quantity || 0,
            unit: item?.unit || "",
            poNumber
          };
        })}
        poNumber={
          // Get PO number from first selected item
          requestToPONumber.get(Array.from(selectedDCItems)[0] || "")
        }
      />

      {/* View DC Dialog */}
      <ConfirmDeliveryDialog
        open={!!showConfirmDelivery}
        onOpenChange={(open) => !open && setShowConfirmDelivery(null)}
        requestId={showConfirmDelivery}
      />

      <ViewDCDialog
        open={viewDCId !== null}
        onOpenChange={(open) => !open && setViewDCId(null)}
        deliveryId={viewDCId}
      />
    </div >
  );
}