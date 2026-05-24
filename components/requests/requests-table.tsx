"use client";

/**
 * Requests Table Component
 * 
 * Displays material requests in a table with status badges, urgent tags, and filtering.
 */

import { useState, Fragment, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ExpandableText } from "@/components/ui/expandable-text";
import { Eye, AlertCircle, FileText, Edit, Trash2, Send, ChevronDown, ChevronUp, ChevronRight, MapPin, Package, PackageX, Sparkles, NotebookPen, ScrollText, LayoutGrid, Table as TableIcon, ShoppingCart, Truck, Clock, CheckCircle2, CheckCircle, XCircle, Loader2, Pencil, RefreshCw, PieChart, Layers, Search, X, Table2, Filter, Check, Plus, Calendar, AlertTriangle } from "lucide-react";
import { CompactImageGallery } from "@/components/ui/image-gallery";
import { LazyImage } from "@/components/ui/lazy-image";
import { cn, normalizeSearchQuery, matchesAnySearchQuery } from "@/lib/utils";
import { useUserRole } from "@/hooks/use-user-role";
import { ROLES } from "@/lib/auth/roles";
import { UserInfoDialog } from "./user-info-dialog";
import { ItemInfoDialog } from "./item-info-dialog";
import { LocationInfoDialog } from "@/components/locations/location-info-dialog";
import { ProjectInfoDialog } from "@/components/projects/project-info-dialog";
import { NotesTimelineDialog } from "./notes-timeline-dialog";
import { GRNAuditDialog } from "./grn-audit-dialog";
import { PDFPreviewDialog } from "@/components/purchase/pdf-preview-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import type { Id } from "@/convex/_generated/dataModel";
import { EditPOQuantityDialog } from "@/components/purchase/edit-po-quantity-dialog";
import { CreateDCMultiDialog } from "@/components/purchase/create-dc-multi-dialog";
import { ViewDCDialog } from "@/components/purchase/view-dc-dialog";

type RequestStatus =
  | "draft"
  | "pending"
  | "sign_pending"
  | "approved"
  | "rejected"
  | "sign_rejected"
  | "recheck"
  | "ready_for_cc"
  | "cc_pending"
  | "cc_approved"
  | "cc_rejected"
  | "direct_cc"
  | "ready_for_po"
  | "pending_po"
  | "rejected_po"
  | "ready_for_delivery"
  | "delivery_processing"
  | "delivered"
  | "recheck_requested"
  | "partially_processed"
  | "direct_po"
  | "ordered"
  | "out_for_delivery"
  | "delivery_stage"
  | "closed"
  | "po_rejected";

// Helper to get card border/bg styles based on status
const getCardStyles = (status: RequestStatus | "mixed") => {
  const baseClasses = "group border-l-[6px] border rounded-2xl p-4 sm:p-5 shadow-lg hover:shadow-xl dark:shadow-black/40 transition-all duration-300 bg-card max-w-full overflow-hidden relative";

  if (status === "mixed") return `${baseClasses} border-slate-200 dark:border-slate-800`;

  switch (status) {
    case "draft":
      return `${baseClasses} border-slate-400 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-950`;
    case "pending":
    case "sign_pending":
      return `${baseClasses} border-amber-500 dark:border-amber-600 bg-amber-50/50 dark:bg-slate-950`;
    case "approved":
      return `${baseClasses} border-emerald-500 dark:border-emerald-600 bg-emerald-50/50 dark:bg-slate-950`;
    case "rejected":
    case "cc_rejected":
    case "rejected_po":
    case "sign_rejected":
      return `${baseClasses} border-rose-500 dark:border-rose-600 bg-rose-50/50 dark:bg-slate-950`;
    case "recheck":
      return `${baseClasses} border-indigo-500 dark:border-indigo-600 bg-indigo-50/50 dark:bg-slate-950`;
    case "ready_for_cc":
      return `${baseClasses} border-blue-500 dark:border-blue-600 bg-blue-50/50 dark:bg-slate-950`;
    case "cc_pending":
      return `${baseClasses} border-purple-500 dark:border-purple-600 bg-purple-50/50 dark:bg-slate-950`;
    case "cc_approved":
    case "ready_for_po":
      return `${baseClasses} border-teal-500 dark:border-teal-600 bg-teal-50/50 dark:bg-slate-950`;
    case "pending_po":
    case "direct_po":
      return `${baseClasses} border-orange-500 dark:border-orange-600 bg-orange-50/50 dark:bg-slate-950`;
    case "ready_for_delivery":
      return `${baseClasses} border-emerald-500 dark:border-emerald-600 bg-emerald-50/50 dark:bg-slate-950`;
    case "delivered":
      return `${baseClasses} border-green-600 dark:border-green-600 bg-green-50/50 dark:bg-slate-950`;
    case "out_for_delivery":
    case "delivery_processing":
    case "delivery_stage":
      return `${baseClasses} border-sky-500 dark:border-sky-600 bg-sky-50/50 dark:bg-slate-950`;
    default:
      return `${baseClasses} border-border bg-card dark:bg-slate-950`;
  }
};

// Enhanced status color mapping for view buttons with better visuals
const getStatusButtonStyles = (status: RequestStatus) => {
  const baseClasses = "border-2 font-medium shadow-sm hover:shadow-md transition-all duration-200";

  switch (status) {
    case "draft":
      return `${baseClasses} border-slate-300 text-slate-700 bg-gradient-to-r from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-200 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300 dark:from-slate-800 dark:to-slate-700 dark:hover:from-slate-700 dark:hover:to-slate-600`;
    case "pending":
    case "sign_pending":
      return `${baseClasses} border-amber-300 text-amber-800 bg-gradient-to-r from-amber-50 to-amber-100 hover:from-amber-100 hover:to-amber-200 hover:border-amber-400 dark:border-amber-600 dark:text-amber-300 dark:from-amber-900 dark:to-amber-800 dark:hover:from-amber-800 dark:hover:to-amber-700`;
    case "approved":
      return `${baseClasses} border-emerald-300 text-emerald-800 bg-gradient-to-r from-emerald-50 to-emerald-100 hover:from-emerald-100 hover:to-emerald-200 hover:border-emerald-400 dark:border-emerald-600 dark:text-emerald-300 dark:from-emerald-900 dark:to-emerald-800 dark:hover:from-emerald-800 dark:hover:to-emerald-700`;
    case "recheck":
    case "ready_for_cc":
    case "cc_pending":
    case "cc_approved":
    case "ready_for_po":
    case "pending_po":
    case "direct_po":
    case "partially_processed":
      return `${baseClasses} border-indigo-300 text-indigo-800 bg-gradient-to-r from-indigo-50 to-indigo-100 hover:from-indigo-100 hover:to-indigo-200 hover:border-indigo-400 dark:border-indigo-600 dark:text-indigo-300 dark:from-indigo-900 dark:to-indigo-800 dark:hover:from-indigo-800 dark:hover:to-indigo-700`;
    case "ready_for_delivery":
    case "delivery_processing":
    case "delivery_stage":
    case "out_for_delivery":
      return `${baseClasses} border-orange-300 text-orange-800 bg-gradient-to-r from-orange-50 to-orange-100 hover:from-orange-100 hover:to-orange-200 hover:border-orange-400 dark:border-orange-600 dark:text-orange-300 dark:from-orange-900 dark:to-orange-800 dark:hover:from-orange-800 dark:hover:to-orange-700`;
    case "delivered":
      return `${baseClasses} border-teal-300 text-teal-800 bg-gradient-to-r from-teal-50 to-teal-100 hover:from-teal-100 hover:to-teal-200 hover:border-teal-400 dark:border-teal-600 dark:text-teal-300 dark:from-teal-900 dark:to-teal-800 dark:hover:from-teal-800 dark:hover:to-teal-700`;
    case "rejected":
    case "cc_rejected":
    case "rejected_po":
    case "sign_rejected":
      return `${baseClasses} border-rose-300 text-rose-800 bg-gradient-to-r from-rose-50 to-rose-100 hover:from-rose-100 hover:to-rose-200 hover:border-rose-400 dark:border-rose-600 dark:text-rose-300 dark:from-rose-900 dark:to-rose-800 dark:hover:from-rose-800 dark:hover:to-rose-700`;
    default:
      return `${baseClasses} border-blue-300 text-blue-800 bg-gradient-to-r from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 hover:border-blue-400 dark:border-blue-600 dark:text-blue-300 dark:from-blue-900 dark:to-blue-800 dark:hover:from-blue-800 dark:hover:to-blue-700`;
  }
};

interface Request {
  _id: Id<"requests">;
  requestNumber: string;
  createdBy: Id<"users">;
  siteId: Id<"sites">;
  itemName: string;
  description: string;
  specsBrand?: string;
  quantity: number;
  unit: string;
  requiredBy: number;
  isUrgent: boolean;
  photo?: {
    imageUrl: string;
    imageKey: string;
  };
  photos?: Array<{
    imageUrl: string;
    imageKey: string;
  }>;
  itemOrder?: number; // Order of item within the request (1, 2, 3...)
  status: RequestStatus;
  approvedBy?: Id<"users">;
  approvedAt?: number;
  rejectionReason?: string;
  deliveryMarkedAt?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  directAction?: "po" | "delivery" | "all" | "split_po" | "split_delivery" | "split_po_delivery"; // Flag for direct action
  project?: {
    _id: Id<"projects">;
    name: string;
  } | null;
  site?: {
    _id: Id<"sites">;
    name: string;
    code?: string;
    address?: string;
  } | null;
  creator?: {
    _id: Id<"users">;
    fullName: string;
    role: string;
    profileImage?: string;
  } | null;
  approver?: {
    _id: Id<"users">;
    fullName: string;
    role: string;
    profileImage?: string;
  } | null;
  notesCount?: number;
  poId?: Id<"purchaseOrders"> | null;
  poNumber?: string | null;
  ccId?: Id<"costComparisons"> | null;
  ccNumber?: string | null;
  dcId?: Id<"deliveries"> | null;
  dcNumber?: string | null;
  deliveryId?: Id<"deliveries">;
  selectedVendorId?: Id<"vendors"> | string | null;
}

interface RequestsTableProps {
  requests: Request[] | undefined;
  idType?: "request" | "po" | "cc" | "dc";
  onIdTypeChange?: (val: "request" | "po" | "cc" | "dc") => void;
  filterProjectId?: Id<"projects"> | "all" | null;
  onFilterProjectIdChange?: (val: Id<"projects"> | "all" | null) => void;
  filterDate?: Date | null;
  onFilterDateChange?: (val: Date | null) => void;
  availableProjects?: Array<{_id: Id<"projects">, name: string}>;
  onViewDetails?: (requestId: Id<"requests">) => void;
  onOpenCC?: (requestId: Id<"requests">, requestIds?: Id<"requests">[]) => void; // Open cost comparison dialog
  onDirectPO?: (requestId: Id<"requests">) => void; // Handle Direct PO action
  onDirectDelivery?: (requestId: Id<"requests">) => void; // Handle Direct Delivery action
  showCreator?: boolean; // Show creator column (for manager view)
  onEditDraft?: (requestNumber: string) => void; // Edit draft request
  onDeleteDraft?: (requestNumber: string) => void; // Delete draft request
  onSendDraft?: (requestNumber: string) => void; // Send draft request
  newlySentRequestNumbers?: Set<string>; // Request numbers that were just sent (for animation)
  viewMode?: "card" | "table"; // View mode: card or table
  onConfirmDelivery?: (requestId: Id<"requests">) => void; // Confirm delivery of request
  singleColumn?: boolean; // Force single column layout
  alwaysExpanded?: boolean; // Always show expanded details (e.g. for dashboard)
  simplifiedStatuses?: boolean; // Show simplified status badges for site engineers
  preciseStatuses?: boolean; // Show precise status badges (ungrouped) for managers
  hideStatusOnCard?: boolean; // Hide status badge on card view
  hideItemCountOnCard?: boolean; // Hide item count badge on card view
  minimalDashboardView?: boolean; // Hide detailed info (Required By, Location, Items) for dashboard
  onCheck?: (requestId: Id<"requests">) => void; // Check request history
  onCreatePO?: (requestId: Id<"requests">) => void; // Create PO
  onCreateBulkPO?: (requestIds: Id<"requests">[]) => void; // Create PO for multiple items
  onMoveToCC?: (requestId: Id<"requests">) => void; // Move to CC
  onViewPDF?: (poNumber: string, requestId: Id<"requests">) => void; // View PDF with optional request filter
  searchQuery?: string;
}

export function RequestsTable({
  requests,
  idType = "request",
  onIdTypeChange,
  filterProjectId,
  onFilterProjectIdChange,
  filterDate,
  onFilterDateChange,
  availableProjects = [],
  onViewDetails,
  onOpenCC,
  onDirectPO,
  onDirectDelivery,
  showCreator = false,
  onEditDraft,
  onDeleteDraft,
  onSendDraft,
  newlySentRequestNumbers = new Set(),
  viewMode = "table",
  onConfirmDelivery,
  singleColumn = false,
  alwaysExpanded = false,
  simplifiedStatuses = false,
  preciseStatuses = false,
  hideStatusOnCard = false,
  hideItemCountOnCard = false,
  minimalDashboardView = false,
  onCheck,
  onCreatePO,
  onCreateBulkPO,
  onMoveToCC,
  onViewPDF,
  searchQuery,
}: RequestsTableProps) {
  const userRole = useUserRole();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<Id<"sites"> | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);

  const [selectedRequestNumberForNotes, setSelectedRequestNumberForNotes] = useState<string | null>(null);
  const [selectedRequestNumberForGRN, setSelectedRequestNumberForGRN] = useState<string | null>(null);
  const [pdfPreviewPoNumber, setPdfPreviewPoNumber] = useState<string | null>(null);

  // Confirmation Dialog States
  const [showReadyForCCConfirm, setShowReadyForCCConfirm] = useState<Id<"requests"> | null>(null);
  const [showReadyForPOConfirm, setShowReadyForPOConfirm] = useState<Id<"requests"> | null>(null);
  const [showReadyForDeliveryConfirm, setShowReadyForDeliveryConfirm] = useState<Id<"requests"> | null>(null);
  const [editQuantityItem, setEditQuantityItem] = useState<{ id: Id<"requests">; quantity: number; name: string; unit: string } | null>(null);

  // CC multi-select state
  const [selectedCCItems, setSelectedCCItems] = useState<Set<Id<"requests">>>(new Set());
  const toggleCCItem = (id: Id<"requests">) => {
    setSelectedCCItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // PO multi-select state (for selecting which items to create PO for in merged groups)
  const [selectedPOItems, setSelectedPOItems] = useState<string[]>([]);
  const togglePOItem = (id: Id<"requests">) => {
    const idStr = id as string;
    setSelectedPOItems(prev => {
      if (prev.includes(idStr)) {
        return prev.filter(x => x !== idStr);
      } else {
        const itemToSelect = requests?.find(r => r._id === id);
        if (itemToSelect) {
          const selectedItems = prev.map(pId => requests?.find(r => r._id === pId)).filter(Boolean);
          if (selectedItems.length > 0) {
            const firstVendor = selectedItems[0]?.selectedVendorId;
            if (itemToSelect.selectedVendorId !== firstVendor) {
              toast.error("Cannot select items with different vendors for PO creation.");
              return prev;
            }
          }
        }
        return [...prev, idStr];
      }
    });
  };
  const isPOItemSelected = (id: Id<"requests">) => selectedPOItems.includes(id as string);

  const [showCreateDCDialog, setShowCreateDCDialog] = useState(false);
  const [dcDialogItems, setDcDialogItems] = useState<{ requestId: Id<"requests">; itemName: string; quantity: number; unit: string; poNumber?: string }[]>([]);
  const [viewDCId, setViewDCId] = useState<Id<"deliveries"> | null>(null);

  // Collect all unique item names from requests
  const uniqueItemNames = useMemo(() => {
    if (!requests) return [];
    const names = new Set<string>();
    requests.forEach((req) => names.add(req.itemName));
    return Array.from(names);
  }, [requests]);

  // Query inventory status for all items
  const inventoryStatusData = useQuery(
    api.inventory.getInventoryStatusForItems,
    uniqueItemNames.length > 0 ? { itemNames: uniqueItemNames } : "skip"
  );

  // Create Map for efficient lookup
  const inventoryStatus = useMemo(() => {
    if (!inventoryStatusData) return null;
    if (Array.isArray(inventoryStatusData)) {
      const map: Record<string, any> = {};
      inventoryStatusData.forEach((s: any) => {
        map[s.requestedName] = s;
      });
      return map;
    }
    return inventoryStatusData as any;
  }, [inventoryStatusData]);

  // Helper function to get inventory status badge for an item
  const getInventoryStatusBadge = (itemName: string, requestedQuantity: number, unit: string) => {
    if (!inventoryStatus) return null;

    const status = inventoryStatus[itemName];
    const encodedItemName = encodeURIComponent(itemName);

    // Handler for New Item - Redirect to Inventory
    const handleNewItemClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedItemName(itemName);
    };

    // Handler for Existing Item - Open Info Dialog
    const handleExistingItemClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedItemName(itemName);
    };

    if (!status) return null;

    if (status.status === "new_item") {
      return (
        <Badge
          variant="outline"
          className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800 text-[10px] px-2 py-0.5 h-6 gap-1.5 hover:bg-indigo-100 cursor-pointer transition-colors shadow-sm"
          onClick={handleNewItemClick}
          title="This item is not in inventory. Click to add it."
        >
          <Sparkles className="h-3 w-3" />
          New Item
        </Badge>
      );
    }

    if (status.status === "out_of_stock") {
      return (
        <Badge
          variant="destructive"
          className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900 text-[10px] px-2 py-0.5 h-6 gap-1.5 hover:bg-red-100 cursor-pointer transition-colors shadow-sm"
          onClick={handleExistingItemClick}
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
    const isInsufficient = remaining < 0;
    const isLowStock = !isInsufficient && (remaining < stockAvailable * 0.2);

    if (isInsufficient) {
      // Requested more than available
      return (
        <Badge
          variant="outline"
          className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800 text-[10px] px-2 py-0.5 h-6 gap-1.5 hover:bg-orange-100 cursor-pointer transition-colors shadow-sm"
          onClick={handleExistingItemClick}
          title={`Insufficient stock. Available: ${stockAvailable}, Requested: ${requestedQuantity}`}
        >
          <AlertCircle className="h-3 w-3" />
          Low Stock: {stockAvailable}/{requestedQuantity}
        </Badge>
      );
    }

    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-2 py-0.5 h-6 gap-1.5 cursor-pointer hover:opacity-80 transition-all shadow-sm",
          isLowStock
            ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800"
            : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
        )}
        onClick={handleExistingItemClick}
        title={`Stock Available: ${stockAvailable}`}
      >
        <Package className="h-3 w-3" />
        {stockAvailable} {stockUnit}
      </Badge>
    );
  };

  // Helper function to collect photos from both photo and photos fields
  const getItemPhotos = (item: Request) => {
    const photos: Array<{ imageUrl: string; imageKey: string }> = [];

    // Check for new photos array first
    if (item.photos && item.photos.length > 0) {
      item.photos.forEach((photo) => {
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

  // Get all photos from all items in a request group
  const getRequestPhotos = (items: Request[]) => {
    const photos: Array<{ imageUrl: string; imageKey: string }> = [];

    items.forEach((item) => {
      // Check for new photos array first
      if (item.photos && item.photos.length > 0) {
        item.photos.forEach((photo) => {
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
    });

    return photos;
  };

  if (!requests) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  // Group requests by requestNumber (requests are already filtered by parent)
  const groupedRequests = new Map<string, Request[]>();
  requests.forEach((req) => {
    const group = groupedRequests.get(req.requestNumber) || [];
    group.push(req);
    groupedRequests.set(req.requestNumber, group);
  });

  // Convert to array and sort by request number (newest first)
  const groupedRequestsArray = Array.from(groupedRequests.entries())
    .map(([requestNumber, items]) => {
      // Sort items within group by itemOrder (latest first: 3, 2, 1) or createdAt as fallback
      const sortedItems = items.sort((a, b) => {
        const orderA = a.itemOrder ?? a.createdAt;
        const orderB = b.itemOrder ?? b.createdAt;
        return orderB - orderA; // Descending order: 3, 2, 1...
      });
      return {
        requestNumber,
        items: sortedItems,
        firstItem: sortedItems[0], // Use latest item for shared data (site, date, status, etc.)
      };
    })
    .sort((a, b) => {
      // Sort groups by the newest item's updatedAt
      const aLatest = Math.max(...a.items.map((i) => i.updatedAt));
      const bLatest = Math.max(...b.items.map((i) => i.updatedAt));
      return bLatest - aLatest;
    });

  const toggleGroup = (requestNumber: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(requestNumber)) {
        next.delete(requestNumber);
      } else {
        next.add(requestNumber);
      }
      return next;
    });
  };

  // Get status badge with role-based display (14 for managers, 6 for site engineers)
  const getStatusBadge = (status: RequestStatus | "mixed") => {
    if (simplifiedStatuses && !preciseStatuses) {
      // User request: Don't show status text/badge on card layout, just use border color
      return null;
    }

    // ===== PRECISE / MANAGER VIEW - ALL 14 INTERNAL STATUSES =====
    if (preciseStatuses || userRole === ROLES.MANAGER || userRole === ROLES.PURCHASE_OFFICER) {
      if (status === "mixed") {
        return (
          <Badge variant="outline" className="bg-slate-100/50 text-slate-700 border-slate-300 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Mixed Status
          </Badge>
        );
      }
      if (status === "draft") {
        return (
          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/80 dark:text-slate-200 dark:border-slate-700 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">
            <Pencil className="h-3.5 w-3.5" />
            Draft
          </Badge>
        );
      }
      if (status === "pending") {
        return (
          <Badge variant="outline" className="bg-amber-100/80 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-100 dark:border-amber-700 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm ring-1 ring-amber-400/20">
            <Clock className="h-3.5 w-3.5" />
            Approval Pending
          </Badge>
        );
      }
      if (status === "rejected") {
        return (
          <Badge variant="outline" className="bg-rose-100/80 text-rose-800 border-rose-300 dark:bg-rose-900/60 dark:text-rose-100 dark:border-rose-700 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">
            <XCircle className="h-3.5 w-3.5" />
            Rejected
          </Badge>
        );
      }
      if (status === "recheck") {
        return (
          <Badge variant="outline" className="bg-indigo-100/80 text-indigo-800 border-indigo-300 dark:bg-indigo-900/60 dark:text-indigo-100 dark:border-indigo-700 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" />
            Recheck Req.
          </Badge>
        );
      }
      if (status === "ready_for_cc") {
        return (
          <Badge variant="outline" className="bg-blue-100/80 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-100 dark:border-blue-700 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm ring-1 ring-blue-400/20">
            <FileText className="h-3.5 w-3.5" />
            Ready for CC
          </Badge>
        );
      }
      if (status === "cc_pending") {
        return (
          <Badge variant="outline" className="bg-purple-100/80 text-purple-800 border-purple-300 dark:bg-purple-900/60 dark:text-purple-100 dark:border-purple-700 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">
            <Clock className="h-3.5 w-3.5" />
            CC In Progress
          </Badge>
        );
      }
      if (status === "cc_rejected") {
        return (
          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">
            <XCircle className="h-3.5 w-3.5" />
            CC Rejected
          </Badge>
        );
      }
      if (status === "ready_for_po") {
        return (
          <Badge variant="outline" className="bg-teal-100/80 text-teal-800 border-teal-300 dark:bg-teal-900/60 dark:text-teal-100 dark:border-teal-700 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm ring-1 ring-teal-400/20">
            <ShoppingCart className="h-3.5 w-3.5" />
            Ready for PO
          </Badge>
        );
      }
      if (status === "sign_pending") {
        return (
          <Badge variant="outline" className="bg-amber-100/60 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">
            <Pencil className="h-3.5 w-3.5" />
            Sign Pending
          </Badge>
        );
      }
      if (status === "sign_rejected") {
        return (
          <Badge variant="outline" className="bg-rose-100/60 text-rose-700 border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">
            <XCircle className="h-3.5 w-3.5" />
            Sign Rejected
          </Badge>
        );
      }
      if (status === "pending_po") {
        return (
          <Badge variant="outline" className="bg-orange-100/80 text-orange-800 border-orange-300 dark:bg-orange-900/60 dark:text-orange-100 dark:border-orange-700 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">
            <Clock className="h-3.5 w-3.5" />
            PO Pending
          </Badge>
        );
      }
      if (status === "ready_for_delivery") {
        return (
          <Badge variant="outline" className="bg-emerald-100/80 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-100 dark:border-emerald-700 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm ring-1 ring-emerald-400/20">
            <Package className="h-3.5 w-3.5" />
            Ready to Ship
          </Badge>
        );
      }
      if (status === "out_for_delivery") {
        return (
          <Badge variant="outline" className="bg-sky-100/80 text-sky-800 border-sky-300 dark:bg-sky-900/60 dark:text-sky-100 dark:border-sky-700 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm animate-pulse">
            <Truck className="h-3.5 w-3.5" />
            Out for Delivery
          </Badge>
        );
      }
      if (status === "delivered") {
        return (
          <Badge variant="outline" className="bg-emerald-500 text-white border-emerald-600 dark:bg-emerald-600 dark:border-emerald-500 gap-1.5 pl-1.5 pr-2.5 font-black shadow-md">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Delivered
          </Badge>
        );
      }

      // Handle extra statuses
      if (status === "approved") return <Badge variant="outline" className="bg-emerald-100/80 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-100 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">Approved</Badge>;
      if (status === "cc_approved") return <Badge variant="outline" className="bg-teal-100/80 text-teal-800 border-teal-300 dark:bg-teal-900/60 dark:text-teal-100 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">CC Approved</Badge>;
      if (status === "direct_po") return <Badge variant="outline" className="bg-orange-100/80 text-orange-800 border-orange-300 dark:bg-orange-900/60 dark:text-orange-100 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">Direct PO</Badge>;
      if (status === "ordered") return <Badge variant="outline" className="bg-emerald-100/80 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-100 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">Ordered</Badge>;
      if (status === "partially_processed") return <Badge variant="outline" className="bg-yellow-100/80 text-yellow-800 border-yellow-300 dark:bg-yellow-900/60 dark:text-yellow-100 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">Partial</Badge>;
      if (status === "delivery_stage" || status === "delivery_processing") return <Badge variant="outline" className="bg-sky-100/80 text-sky-800 border-sky-300 dark:bg-sky-900/60 dark:text-sky-100 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm animate-pulse"><Truck className="h-3.5 w-3.5" />Out for Delivery</Badge>;
      if (status === "rejected_po" || status === "po_rejected") return <Badge variant="outline" className="bg-rose-100/80 text-rose-800 border-rose-300 dark:bg-rose-900/60 dark:text-rose-100 gap-1.5 pl-1.5 pr-2.5 font-bold shadow-sm">PO Rejected</Badge>;

      return <Badge variant="outline">{status}</Badge>;
    }

    // ===== SIMPLIFIED / SITE ENGINEER VIEW - ONLY 6 SIMPLIFIED STATUSES =====
    if (status === "draft") {
      return (
        <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800 gap-1.5 pl-1.5 pr-2.5">
          <Pencil className="h-3.5 w-3.5" />
          Draft
        </Badge>
      );
    }
    if (status === "pending") {
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800 gap-1.5 pl-1.5 pr-2.5">
          <Clock className="h-3.5 w-3.5" />
          Pending Approval
        </Badge>
      );
    }
    if (status === "rejected") {
      return (
        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800 gap-1.5 pl-1.5 pr-2.5">
          <XCircle className="h-3.5 w-3.5" />
          Rejected
        </Badge>
      );
    }
    if (status === "out_for_delivery") {
      return (
        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800 gap-1.5 pl-1.5 pr-2.5">
          <Truck className="h-3.5 w-3.5" />
          Out for Delivery
        </Badge>
      );
    }
    if (status === "delivered") {
      return (
        <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-400 dark:border-teal-800 gap-1.5 pl-1.5 pr-2.5">
          <Package className="h-3.5 w-3.5" />
          Delivered
        </Badge>
      );
    }
    // All other statuses → "Approved & Processing"
    return (
      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-400 dark:border-indigo-800 gap-1.5 pl-1.5 pr-2.5">
        <Loader2 className="h-3.5 w-3.5" />
        Approved & Processing
      </Badge>
    );
  };

  if (groupedRequestsArray.length === 0 && requests.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No requests yet. Create your first request to get started.
      </div>
    );
  }

  if (groupedRequestsArray.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No requests found matching your filters.
      </div>
    );
  }

  // Card View Component
  const CardView = () => (
    <>
      <div className={cn(
        "grid gap-6",
        singleColumn
          ? "grid-cols-1"
          : "grid-cols-1 md:grid-cols-2 2xl:grid-cols-3"
      )}>
        {groupedRequestsArray.map((group) => {
          const { requestNumber, items, firstItem } = group;
          const isExpanded = alwaysExpanded || expandedGroups.has(requestNumber);
          const isNewlySent = newlySentRequestNumbers.has(requestNumber);
          const hasMultipleItems = items.length > 1;
          const urgentCount = items.filter((item) => item.isUrgent && item.status !== "direct_po" && item.directAction !== "po").length;
          const reviewableItemsCount = items.filter((item) => ["pending", "sign_pending"].includes(item.status)).length;

          const allItemsHaveSameStatus = items.length > 0
            ? items.every((item) => item.status === items[0].status)
            : true;

          const getOverallStatus = () => {
            return items[0].status;
          };

          const overallStatus = getOverallStatus();
          const hasMixedStatuses = !allItemsHaveSameStatus;

          // Helper to get status color hex code for gradient (Same as Table View)
          const getStatusColorHex = (status: string) => {
            if (status === "draft") return "#94a3b8"; // slate-400
            if (["pending", "sign_pending"].includes(status)) return "#f59e0b"; // amber-500
            if (status === "approved" || status === "ready_for_delivery") return "#10b981"; // emerald-500
            if (status === "delivered") return "#16a34a"; // green-600
            if (status === "recheck") return "#6366f1"; // indigo-500
            if (status === "ready_for_cc") return "#3b82f6"; // blue-500
            if (status === "cc_pending") return "#a855f7"; // purple-500
            if (status === "ready_for_po") return "#14b8a6"; // teal-500
            if (["pending_po", "direct_po"].includes(status)) return "#f97316"; // orange-500
            if (["out_for_delivery", "delivery_processing", "delivery_stage"].includes(status)) return "#0ea5e9"; // sky-500
            if (["rejected", "sign_rejected", "cc_rejected", "rejected_po"].includes(status)) return "#f43f5e"; // rose-500
            return "#e2e8f0"; // slate-200 (muted)
          };

          // Helper to generate gradient for mixed statuses (Sequence based)
          const getLeftBorderGradient = (items: Request[]) => {
            if (items.length === 0) return null;

            const total = items.length;
            const segmentSize = 100 / total;
            const gradientStops: string[] = [];

            // Items are already sorted by Order (4, 3, 2, 1) or CreatedAt
            // We map them top-to-bottom
            items.forEach((item, index) => {
              const color = getStatusColorHex(item.status);
              const start = index * segmentSize;
              const end = (index + 1) * segmentSize;

              gradientStops.push(`${color} ${start}%`);
              gradientStops.push(`${color} ${end}%`);
            });

            return `linear-gradient(to bottom, ${gradientStops.join(", ")})`;
          };

          const borderGradient = hasMixedStatuses ? getLeftBorderGradient(items) : null;

          // Helper to get item-specific background color based on status - LIGHTER & SUBTLE
          const getItemStatusBgColor = (status: string) => {
            if (status === "draft") return "bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800";
            if (["pending", "sign_pending"].includes(status)) return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
            if (status === "approved") return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800";
            if (status === "recheck") return "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800";
            if (status === "ready_for_cc") return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
            if (status === "cc_pending") return "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800";
            if (["cc_approved", "ready_for_po"].includes(status)) return "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800";
            if (["pending_po", "direct_po"].includes(status)) return "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800";
            if (["ready_for_delivery", "out_for_delivery", "delivery_processing", "delivery_stage"].includes(status)) return "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800"; // Delivery Stage
            if (status === "delivered") return "bg-green-100/50 dark:bg-green-900/30 border-green-300 dark:border-green-800";
            if (["rejected", "sign_rejected", "cc_rejected", "rejected_po"].includes(status)) return "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800";
            if (hasMixedStatuses) return "bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800"; // Neutral for mixed
            return "bg-card border-border";
          };

          // Helper to get item-specific left border color based on status
          // Helper to get item-specific left border color based on status
          const getItemStatusBorderColor = (status: string) => {
            if (status === "draft") return "bg-slate-400";
            if (["pending", "sign_pending"].includes(status)) return "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]";
            if (status === "approved") return "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]";
            if (status === "recheck") return "bg-indigo-500";
            if (status === "ready_for_cc") return "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]";
            if (status === "cc_pending") return "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.3)]";
            if (["cc_approved", "ready_for_po"].includes(status)) return "bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.3)]";
            if (["pending_po", "direct_po"].includes(status)) return "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.3)]";
            if (["ready_for_delivery", "out_for_delivery", "delivery_processing", "delivery_stage"].includes(status)) return "bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.3)]";
            if (status === "delivered") return "bg-green-600 shadow-[0_0_10px_rgba(22,163,74,0.3)]";
            if (["rejected", "sign_rejected", "cc_rejected", "rejected_po"].includes(status)) return "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)]";
            return "bg-primary/20";
          };

          // Helper to render a single item row
          const renderItemRow = (item: Request, isFirst: boolean = false, showBadges: boolean = true, itemIndex?: number) => {
            const photos = getItemPhotos(item);
            const hasPhotos = photos && photos.length > 0;

            return (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full group/item">
                {/* CC Checkbox for ready_for_cc items */}
                {item.status === "ready_for_cc" && userRole !== "manager" && (
                  <div className="shrink-0 self-start sm:self-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedCCItems.has(item._id)}
                      onChange={() => toggleCCItem(item._id)}
                      className="h-4 w-4 rounded border-violet-400 accent-violet-600 cursor-pointer"
                    />
                  </div>
                )}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {/* Item Image - Only if exists */}
                  {hasPhotos && (
                    <div className="shrink-0">
                      <div className="p-0.5 rounded-lg bg-slate-200 dark:bg-slate-800">
                        <CompactImageGallery images={photos} maxDisplay={1} size="md" />
                      </div>
                    </div>
                  )}

                  {/* Name and Index */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {itemIndex && (
                        <span className="text-[10px] font-black text-primary/50 font-mono">#{String(itemIndex).padStart(2, '0')}</span>
                      )}
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-[0.15em] opacity-60">Material Required</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedItemName(item.itemName); }}
                      className="font-black text-xl sm:text-2xl text-foreground dark:text-white hover:text-primary transition-colors text-left block w-full truncate leading-tight tracking-tight"
                    >
                      {item.itemName}
                    </button>
                    {item.description && !minimalDashboardView && (
                      <div className="mt-1">
                        <ExpandableText text={item.description} className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-1 italic" limit={50} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:gap-6 shrink-0 justify-between sm:justify-end border-t sm:border-t-0 border-border/10 pt-3 sm:pt-0">
                  {/* Site / Project Location */}
                  {(item.site || item.project) && (
                    <div className="flex flex-col items-start sm:items-center gap-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">Project / Location</span>
                      <div className="flex flex-col gap-1 items-end sm:items-center">
                        {item.project && (
                          <div
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/5 text-primary border border-primary/10 cursor-pointer hover:bg-primary/10 transition-colors"
                            onClick={(e) => { e.stopPropagation(); setSelectedProjectId(item.project!._id); }}
                          >
                            <span className="text-[10px] font-black uppercase tracking-wide">{item.project.name}</span>
                          </div>
                        )}
                        {!item.project && item.site && (
                          <div
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-400/10 border border-transparent hover:border-primary/20 hover:text-primary transition-all cursor-pointer group/site"
                            onClick={(e) => { e.stopPropagation(); setSelectedSiteId(item.siteId); }}
                          >
                            <MapPin className="h-3 w-3 shrink-0 text-muted-foreground group-hover/site:text-primary" />
                            <span className="text-[10px] font-semibold truncate max-w-[120px]">{item.site.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Quantity Block */}
                  <div className="flex flex-col items-end gap-1 px-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">Quantity</span>
                    <div className="flex items-baseline gap-1 bg-black/5 dark:bg-white/5 px-3 py-1 rounded-lg border border-border/20">
                      <span className="text-xl sm:text-2xl font-black text-foreground tracking-tighter tabular-nums">{item.quantity}</span>
                      <span className="text-xs font-black text-muted-foreground/70 uppercase ml-1">{item.unit}</span>
                    </div>
                  </div>
                </div>

                {showBadges && (
                  <div className="flex items-center gap-2 mt-4 sm:mt-0 sm:ml-4 sm:pl-4 sm:border-l border-border/20">
                    {item.isUrgent && (
                      <Badge variant="destructive" className="h-5 px-1.5 text-[8px] font-black uppercase ring-2 ring-red-500/10">Urgent</Badge>
                    )}
                    {getStatusBadge(item.status)}
                    {onConfirmDelivery && ["out_for_delivery", "delivery_processing", "delivery_stage"].includes(item.status) && (
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); onConfirmDelivery(item._id); }}
                        className="h-7 px-3 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm border border-emerald-500 animate-pulse ml-auto"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Confirm Receipt
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          };

          return (
            <div
              key={requestNumber}
              className={cn(
                getCardStyles(overallStatus || (firstItem.status as any)),
                isNewlySent && "ring-2 ring-primary ring-offset-2",
                "!border-l-transparent"
              )}
              style={{
                backgroundImage: getLeftBorderGradient(items) || undefined,
                backgroundSize: "6px 100%",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "left top",
                backgroundOrigin: "border-box"
              }}
            >
              {/* Card Header with Labels */}
              <div className="flex items-start justify-between mb-3 sm:mb-4 pb-2 sm:pb-3 border-b border-border/50 gap-2 sm:gap-3">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">Request ID</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl sm:text-2xl font-black font-mono text-primary dark:text-white tracking-tighter">#{requestNumber}</span>
                    {!hideStatusOnCard && (
                      <div className="scale-125 origin-left ml-2 sm:ml-3">
                        {getStatusBadge(overallStatus || firstItem.status)}
                      </div>
                    )}
                    {urgentCount > 0 && (
                      <Badge variant="destructive" className="ml-2 h-7 px-3 text-xs font-black gap-1.5 shadow-md animate-pulse border-red-500 uppercase">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {urgentCount === items.length ? "Urgent" : `Urgent (${urgentCount}/${items.length})`}
                      </Badge>
                    )}
                  </div>
                </div>

                {!minimalDashboardView && (
                  <div className="text-right space-y-2">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Required By</div>
                      <div className="flex items-center justify-end gap-1.5 text-sm font-semibold text-foreground">
                        <span className={cn(
                          new Date(firstItem.requiredBy) < new Date() ? "text-red-600" : ""
                        )}>
                          {format(new Date(firstItem.requiredBy), "dd MMM, yyyy")}
                        </span>
                      </div>
                    </div>

                    {firstItem.site && (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Site Location</div>
                        <div
                          className="flex items-center justify-end gap-1.5 text-xs font-medium cursor-pointer hover:text-primary transition-colors group"
                          title={firstItem.site.name}
                          onClick={(e) => { e.stopPropagation(); setSelectedSiteId(firstItem.siteId); }}
                        >
                          <MapPin className="h-3.5 w-3.5 text-primary/70 group-hover:scale-110 transition-transform" />
                          <span className="max-w-[120px] truncate group-hover:underline">{firstItem.site.name}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4 mb-4">
                {/* First Item - Always visible */}
                <div className={cn("p-3.5 rounded-xl border shadow-md relative overflow-hidden", getItemStatusBgColor(items[0].status))}>
                  <div className={cn("absolute top-0 left-0 w-1 h-full", getItemStatusBorderColor(items[0].status))}></div>
                  <div className="pl-2">
                    {renderItemRow(items[0], true, true, items[0].itemOrder ?? items.length)}
                  </div>
                </div>

                {/* Additional Items Logic - Show for all to maintain structure */}
                {(!minimalDashboardView || hasMultipleItems) && (
                  <div className="space-y-3">
                    {/* Check if we should show expanded list: 
                        If minimalDashboardView is TRUE, we want to SHOW ALL ITEMS directly (expanded) 
                        OR if it's explicitly expanded by user logic.
                        
                        Wait, user request says: "sho all itme inside equid ... top onsahbto exiadatd" 
                        Interpret: Show all items inside request card, expanded on dashboard.
                     */}
                    {isExpanded || minimalDashboardView ? (
                      <div className={cn(
                        "space-y-3 animate-in fade-in slide-in-from-top-2 duration-200",
                        !alwaysExpanded && !minimalDashboardView && "pl-3 border-l-2 border-dashed border-border/50"
                      )}>
                        {items.slice(1).map((item, idx) => (
                          <div key={item._id} className={cn("p-3 rounded-lg border relative overflow-hidden shadow-md", getItemStatusBgColor(item.status))}>
                            <div className={cn("absolute top-0 left-0 w-1 h-full", getItemStatusBorderColor(item.status))}></div>
                            <div className="pl-2">
                              {renderItemRow(item, false, true, item.itemOrder ?? (items.length - 1 - idx))}
                            </div>
                          </div>
                        ))}
                        {/* Only show 'Show Less' button if it's NOT alwaysExpanded AND NOT minimalDashboardView */}
                        {!alwaysExpanded && !minimalDashboardView && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleGroup(requestNumber); }}
                            className="w-full py-1 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
                          >
                            Show Less <ChevronDown className="h-3 w-3 rotate-180" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <Button
                        variant={hasMultipleItems ? "secondary" : "ghost"}
                        size="sm"
                        onClick={(e) => {
                          if (hasMultipleItems) {
                            e.stopPropagation();
                            toggleGroup(requestNumber);
                          }
                        }}
                        disabled={!hasMultipleItems}
                        className={cn(
                          "w-full h-8 mt-2 text-xs font-semibold",
                          !hasMultipleItems && "opacity-50 cursor-default"
                        )}
                      >
                        {hasMultipleItems ? `View All (${items.length}) Items` : "Single Item"}
                        {hasMultipleItems && <ChevronDown className="h-3.5 w-3.5 ml-1.5" />}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 -mx-3 sm:-mx-4 -mb-3 sm:-mb-4 mt-3 sm:mt-4 bg-slate-50/80 dark:bg-slate-900/40 border-t border-border/50 rounded-b-xl backdrop-blur-sm">
                <div className="flex items-center gap-2 pl-0 sm:pl-1 min-w-0 flex-shrink order-1">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {showCreator && (
                      <>
                        {/* Avatar */}
                        <div
                          className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shadow-sm cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all"
                          onClick={(e) => { e.stopPropagation(); setSelectedUserId(firstItem.createdBy); }}
                          title={`View ${firstItem.creator?.fullName || "User"}'s profile`}
                        >
                          {firstItem.creator?.profileImage ? (
                            <LazyImage
                              src={firstItem.creator.profileImage}
                              alt={firstItem.creator.fullName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                              {firstItem.creator?.fullName?.charAt(0).toUpperCase() || "?"}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider">Created By</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            {firstItem.creator && (
                              <span
                                className="text-xs font-bold text-foreground hover:text-primary cursor-pointer transition-colors truncate max-w-[100px] sm:max-w-none"
                                onClick={(e) => { e.stopPropagation(); setSelectedUserId(firstItem.createdBy); }}
                              >
                                {firstItem.creator.fullName}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/40 hidden sm:inline">•</span>
                            <span className="text-xs font-medium text-muted-foreground hidden sm:inline">{format(new Date(firstItem.createdAt), "dd MMM, hh:mm a")}</span>
                          </div>
                        </div>
                      </>
                    )}

                    {!showCreator && (
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider">Created</span>
                        <span className="text-xs font-bold text-foreground truncate select-all">{format(new Date(firstItem.createdAt), "dd MMM, hh:mm a")}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 pr-0 sm:pr-1 order-2 justify-end sm:justify-start ml-auto sm:ml-0">
                  {/* Notes Button - Original */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setSelectedRequestNumberForNotes(firstItem.requestNumber); }}
                    className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-white dark:hover:bg-slate-800 relative shadow-sm border border-transparent hover:border-border transition-all"
                    title="View Notes"
                  >
                    <NotebookPen className="h-4 w-4" />
                    {items[0].notesCount && items[0].notesCount > 0 && (
                      <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-0.5 bg-red-500 rounded-full ring-2 ring-white dark:ring-slate-950 text-[9px] font-bold text-white flex items-center justify-center">
                        {items[0].notesCount}
                      </span>
                    )}
                  </Button>

                  {/* Logs Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setSelectedRequestNumberForGRN(firstItem.requestNumber); }}
                    className="h-8 px-2.5 gap-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white dark:hover:bg-slate-800 relative shadow-sm border border-transparent hover:border-border transition-all ml-1"
                    title="View Request Logs"
                  >
                    <ScrollText className="h-4 w-4" />
                    <span className="text-xs font-semibold">Logs</span>
                  </Button>

                  {/* Draft Actions */}
                  {/* Show edit buttons only when ALL items are draft (Site Engineer Request) */}
                  {items.every(item => item.status === "draft") && (
                    <>
                      {onEditDraft && (
                        <Button variant="ghost" size="sm" onClick={() => onEditDraft(requestNumber)} className="h-8 w-8 p-0 rounded-full text-blue-600 hover:bg-blue-50 hover:text-blue-700" title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {onDeleteDraft && (
                        <Button variant="ghost" size="sm" onClick={() => onDeleteDraft(requestNumber)} className="h-8 w-8 p-0 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {onSendDraft && (
                        <Button variant="default" size="sm" onClick={() => onSendDraft(requestNumber)} className="h-8 w-8 p-0 rounded-full bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-200 dark:shadow-none ml-1" title="Send Request">
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}

                  {/* View DC Button - Card View */}
                  {["out_for_delivery", "delivery_processing", "delivery_stage", "delivered"].includes(firstItem.status) && firstItem.deliveryId && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setViewDCId(firstItem.deliveryId!); }}
                      className="h-8 px-4 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-sm ml-1 transition-all hover:scale-105"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      View DC
                    </Button>
                  )}

                  {/* Confirm Delivery Action */}
                  {onConfirmDelivery && ["out_for_delivery", "delivery_processing", "delivery_stage"].includes(firstItem.status) && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onConfirmDelivery(firstItem._id); }}
                      className="h-8 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-200 dark:shadow-none ml-1 animate-pulse transition-all hover:scale-105"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Confirm Delivery
                    </Button>
                  )}

                  {/* CC Batch Button - single entry point for merged CC groups */}
                  {onOpenCC && (() => {
                    const ccItems = items.filter(i => ["cc_pending", "cc_approved", "cc_rejected", "ready_for_po"].includes(i.status as string));
                    if (ccItems.length <= 1) return null; // Single item: handled per-item
                    const hasPending = ccItems.some(i => i.status === "cc_pending");
                    return (
                      <Button
                        variant={hasPending ? "default" : "outline"}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCC(ccItems[0]._id, ccItems.map(i => i._id));
                        }}
                        className={hasPending
                          ? "h-8 px-2.5 text-[10px] font-bold bg-purple-600 hover:bg-purple-700 text-white ml-1 shadow-sm"
                          : "h-8 px-2.5 text-[10px] font-bold border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-950 ml-1 shadow-sm"
                        }
                        title={hasPending ? "Review Cost Comparison" : "View Cost Comparison"}
                      >
                        {hasPending ? <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> : <Layers className="h-3.5 w-3.5 mr-1" />}
                        {hasPending ? `Review CC (${ccItems.length})` : `View CC (${ccItems.length})`}
                      </Button>
                    );
                  })()}

                  {/* PO Batch Button - only show when items are selected */}
                  {(onCreatePO || onCreateBulkPO) && (() => {
                    const poItems = items.filter(i => i.status === "ready_for_po");
                    if (poItems.length === 0) return null;
                    const groupSelectedPO = poItems.filter(i => isPOItemSelected(i._id));
                    // Only show this button when at least 1 item is selected
                    if (groupSelectedPO.length === 0) return null;

                    // Do not show bulk Create PO button if selected items have different vendors
                    if (groupSelectedPO.length > 1) {
                      const firstVendor = groupSelectedPO[0].selectedVendorId;
                      const hasDifferentVendors = groupSelectedPO.some(i => i.selectedVendorId !== firstVendor);
                      if (hasDifferentVendors) return null;
                    }

                    return (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const ids = groupSelectedPO.map(i => i._id);
                          if (onCreateBulkPO && ids.length > 1) {
                            onCreateBulkPO(ids);
                          } else {
                            ids.forEach(id => onCreatePO!(id));
                          }
                          setSelectedPOItems(prev => prev.filter(id => !ids.map(x => x as string).includes(id)));
                        }}
                        className="h-8 px-2.5 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white ml-1 shadow-sm animate-in fade-in duration-150"
                        title={`Create PO for ${groupSelectedPO.length} selected item(s)`}
                      >
                        <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                        Create PO ({groupSelectedPO.length})
                      </Button>
                    );
                  })()}

                  {/* PO View Button */}
                  {onViewPDF && firstItem.poNumber && ["sign_pending", "sign_rejected", "pending_po", "ready_for_delivery"].includes(firstItem.status as string) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); if (firstItem.poNumber) onViewPDF(firstItem.poNumber, firstItem._id); }}
                      className="h-8 px-3 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-950 ml-1 shadow-sm"
                      title="PO View"
                    >
                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                      PO View
                    </Button>
                  )}

                  {/* Main Action Button */}
                  {onViewDetails && (
                    <Button
                      variant={items.every(i => i.status === "sign_pending") ? "default" : (showCreator && reviewableItemsCount > 0 ? "default" : "outline")}
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onViewDetails(firstItem._id); }}
                      className={cn(
                        "h-8 px-4 text-xs font-semibold ml-1 shadow-sm transition-all",
                        items.every(i => i.status === "sign_pending")
                          ? "bg-orange-600 hover:bg-orange-700 text-white shadow-md hover:-translate-y-0.5"
                          : (showCreator && reviewableItemsCount > 0
                            ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:-translate-y-0.5"
                            : "bg-white dark:bg-card hover:bg-slate-50 hover:text-black dark:hover:bg-slate-800 dark:hover:text-white border-slate-200 hover:border-slate-300 dark:border-slate-700")
                      )}
                    >
                      {items.every(i => i.status === "sign_pending") ? <Pencil className="h-3.5 w-3.5 mr-1.5" /> : <Eye className="h-3.5 w-3.5 mr-1.5" />}
                      {items.every(i => i.status === "sign_pending") ? "Sign Review" : (showCreator && reviewableItemsCount > 0 ? "Review" : "View")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  // Table View
  return (
    <>
      {viewMode === "card" ? (
        <CardView />
      ) : (
        <>
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border">
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead className="w-[120px] font-bold text-xs uppercase tracking-tight text-muted-foreground/80">
                    {onIdTypeChange ? (
                      <Select value={idType} onValueChange={(v: any) => onIdTypeChange(v)}>
                        <SelectTrigger className="h-8 w-fit gap-1.5 border-none bg-transparent hover:bg-muted/50 px-2 py-1 -ml-2 text-xs font-bold uppercase tracking-tight text-muted-foreground/80 focus:ring-0 shadow-none rounded-md transition-colors">
                          <SelectValue placeholder="REQUEST ID" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="request">REQUEST ID</SelectItem>
                          <SelectItem value="po">PO ID</SelectItem>
                          <SelectItem value="cc">CC ID</SelectItem>
                          <SelectItem value="dc">DC ID</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      "Request ID"
                    )}
                  </TableHead>
                  <TableHead className="min-w-[180px] font-bold text-xs uppercase tracking-tight text-muted-foreground/80">
                    {onFilterProjectIdChange && availableProjects.length > 0 ? (
                      <Select value={filterProjectId || "all"} onValueChange={(v) => onFilterProjectIdChange(v === "all" ? null : v as Id<"projects">)}>
                        <SelectTrigger className="h-8 w-fit gap-1.5 border-none bg-transparent hover:bg-muted/50 px-2 py-1 -ml-2 text-xs font-bold uppercase tracking-tight text-muted-foreground/80 focus:ring-0 shadow-none rounded-md transition-colors">
                          <SelectValue placeholder="PROJECT / LOCATION" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">PROJECT / LOCATION</SelectItem>
                          {availableProjects.map(p => (
                            <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      "PROJECT / LOCATION"
                    )}
                  </TableHead>
                  <TableHead className="w-[150px] font-bold text-xs uppercase tracking-tight text-muted-foreground/80 overflow-visible">
                    {onFilterDateChange ? (
                      <div className="relative w-fit -ml-2">
                        <Input 
                          type="date"
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-50"
                          value={filterDate ? format(filterDate, "yyyy-MM-dd") : ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            onFilterDateChange(val ? new Date(val) : null);
                          }}
                        />
                        <button className="flex items-center justify-start h-8 w-fit gap-1.5 border-none bg-transparent hover:bg-muted/50 px-2 py-1 text-xs font-bold uppercase tracking-tight text-muted-foreground/80 rounded-md transition-colors pointer-events-none">
                          <span>{filterDate ? format(filterDate, "dd MMM yyyy") : "DATES"}</span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </button>
                      </div>
                    ) : (
                      "DATES"
                    )}
                  </TableHead>
                  <TableHead className="min-w-[300px] font-bold text-xs uppercase tracking-tight text-muted-foreground/80">Item Details</TableHead>
                  <TableHead className="w-[100px] text-center font-bold text-xs uppercase tracking-tight text-muted-foreground/80">QTY</TableHead>
                  <TableHead className="text-right min-w-[320px] font-bold text-xs uppercase tracking-tight text-muted-foreground/80">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedRequestsArray.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="h-[400px]">
                      <div className="flex flex-col items-center justify-center w-full h-full text-center animate-in fade-in-50 duration-500 py-24">
                        <div className="flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 ring-8 ring-slate-50 mb-6 dark:bg-slate-800 dark:ring-slate-900/50">
                          <FileText className="w-8 h-8 text-slate-400" strokeWidth={1.5} />
                        </div>
                        <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                          No requests found
                        </h3>
                        <p className="mt-2 text-sm max-w-sm text-slate-500 dark:text-slate-400">
                          {searchQuery
                            ? "Try adjusting your search criteria or clearing active filters to see more results."
                            : "No requests found with current status filter"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedRequestsArray.map((group) => {
                  const { requestNumber, items, firstItem } = group;
                  const isExpanded = expandedGroups.has(requestNumber);
                  const hasMultipleItems = items.length > 1;
                  const isNewlySent = newlySentRequestNumbers.has(requestNumber);

                  // Helper for overall status
                  const allItemsHaveSameStatus = items.every(i => i.status === items[0].status);
                  const overallStatus = allItemsHaveSameStatus ? items[0].status : (
                    items.some(i => !["pending", "draft"].includes(i.status)) ? "partially_processed" : null
                  );

                  // Count urgent items
                  const urgentCount = items.filter((item) => item.isUrgent && item.status !== "direct_po" && item.directAction !== "po").length;

                  // Get status color for left border - VIBRANT & THICKER
                  const getStatusBorderColor = (status: string) => {
                    if (status === "draft") return "border-l-slate-400";
                    if (["pending", "sign_pending"].includes(status)) return "border-l-amber-500";
                    if (status === "approved") return "border-l-emerald-500";
                    if (status === "recheck") return "border-l-indigo-500";
                    if (status === "ready_for_cc") return "border-l-blue-500";
                    if (status === "cc_pending") return "border-l-purple-500";
                    if (["cc_approved", "ready_for_po"].includes(status)) return "border-l-teal-500";
                    if (["pending_po", "direct_po"].includes(status)) return "border-l-orange-500";
                    if (["ready_for_delivery", "out_for_delivery", "delivery_processing", "delivery_stage"].includes(status)) return "border-l-sky-500";
                    if (status === "delivered") return "border-l-green-600";
                    if (["rejected", "sign_rejected", "cc_rejected", "rejected_po"].includes(status)) return "border-l-rose-500";
                    return "border-l-muted";
                  };

                  // Helper to get status color hex code for gradient
                  const getStatusColorHex = (status: string) => {
                    if (status === "draft") return "#94a3b8"; // slate-400
                    if (["pending", "sign_pending"].includes(status)) return "#f59e0b"; // amber-500
                    if (status === "approved" || status === "ready_for_delivery") return "#10b981"; // emerald-500
                    if (status === "delivered") return "#16a34a"; // green-600
                    if (status === "recheck") return "#6366f1"; // indigo-500
                    if (status === "ready_for_cc") return "#3b82f6"; // blue-500
                    if (status === "cc_pending") return "#a855f7"; // purple-500
                    if (status === "ready_for_po") return "#14b8a6"; // teal-500
                    if (["pending_po", "direct_po"].includes(status)) return "#f97316"; // orange-500
                    if (["out_for_delivery", "delivery_processing", "delivery_stage"].includes(status)) return "#0ea5e9"; // sky-500
                    if (["rejected", "sign_rejected", "cc_rejected", "rejected_po"].includes(status)) return "#f43f5e"; // rose-500
                    return "#e2e8f0"; // slate-200 (muted)
                  };

                  // Helper to generate gradient for mixed statuses (Sequence based)
                  const getLeftBorderGradient = (items: Request[]) => {
                    if (items.length === 0) return null;

                    const total = items.length;
                    const segmentSize = 100 / total;
                    const gradientStops: string[] = [];

                    // Items are already sorted by Order (4, 3, 2, 1) or CreatedAt
                    // We map them top-to-bottom
                    items.forEach((item, index) => {
                      const color = getStatusColorHex(item.status);
                      const start = index * segmentSize;
                      const end = (index + 1) * segmentSize;

                      gradientStops.push(`${color} ${start}%`);
                      gradientStops.push(`${color} ${end}%`);
                    });

                    return `linear-gradient(to bottom, ${gradientStops.join(", ")})`;
                  };

                  const hasMixedStatuses = !allItemsHaveSameStatus;
                  const borderGradient = hasMixedStatuses ? getLeftBorderGradient(items) : null;

                  // Get status background color for table row - VISIBLE & PREMIUM
                  const getStatusBgColor = (status: string) => {
                    if (hasMixedStatuses) return "bg-slate-50/50 dark:bg-slate-900/20"; // Neutral for mixed
                    if (status === "draft") return "bg-slate-50/80 dark:bg-slate-950/20 hover:bg-slate-100/50 dark:hover:bg-slate-900/40";
                    if (["pending", "sign_pending"].includes(status)) return "bg-amber-50/80 dark:bg-amber-950/20 hover:bg-amber-100/50 dark:hover:bg-amber-950/40";
                    if (status === "approved") return "bg-emerald-50/80 dark:bg-emerald-950/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/40";
                    if (status === "recheck") return "bg-indigo-50/80 dark:bg-indigo-950/20 hover:bg-indigo-100/50 dark:hover:bg-indigo-950/40";
                    if (status === "ready_for_cc") return "bg-blue-50/80 dark:bg-blue-950/20 hover:bg-blue-100/50 dark:hover:bg-blue-950/40";
                    if (status === "cc_pending") return "bg-purple-50/80 dark:bg-purple-950/20 hover:bg-purple-100/50 dark:hover:bg-purple-950/40";
                    if (["cc_approved", "ready_for_po"].includes(status)) return "bg-teal-50/80 dark:bg-teal-950/20 hover:bg-teal-100/50 dark:hover:bg-teal-950/40";
                    if (["pending_po", "direct_po"].includes(status)) return "bg-orange-50/80 dark:bg-orange-950/20 hover:bg-orange-100/50 dark:hover:bg-orange-950/40";
                    if (["ready_for_delivery", "out_for_delivery", "delivery_processing", "delivery_stage"].includes(status)) return "bg-sky-50/80 dark:bg-sky-950/20 hover:bg-sky-100/50 dark:hover:bg-sky-950/40";
                    if (status === "delivered") return "bg-green-50/80 dark:bg-green-950/20 hover:bg-green-100/50 dark:hover:bg-green-950/40";
                    if (["rejected", "sign_rejected", "cc_rejected", "rejected_po"].includes(status)) return "bg-rose-50/80 dark:bg-rose-950/20 hover:bg-rose-100/50 dark:hover:bg-rose-950/40";
                    return "bg-card hover:bg-accent/30";
                  };

                  // Get status bar color - EXPLICIT classes for Tailwind JIT
                  const getStatusBarColor = (status: string) => {
                    if (status === "draft") return "bg-slate-400";
                    if (["pending", "sign_pending"].includes(status)) return "bg-amber-500";
                    if (status === "approved" || status === "ready_for_delivery") return "bg-emerald-500";
                    if (status === "delivered") return "bg-green-600";
                    if (status === "recheck") return "bg-indigo-500";
                    if (status === "ready_for_cc") return "bg-blue-500";
                    if (status === "cc_pending") return "bg-purple-500";
                    if (status === "ready_for_po") return "bg-teal-500";
                    if (["pending_po", "direct_po"].includes(status)) return "bg-orange-500";
                    if (["out_for_delivery", "delivery_processing", "delivery_stage"].includes(status)) return "bg-sky-500";
                    if (["rejected", "sign_rejected", "cc_rejected", "rejected_po"].includes(status)) return "bg-rose-500";
                    return "bg-muted";
                  };

                  return (
                    <Fragment key={requestNumber}>
                      <TableRow
                        className={cn(
                          "transition-all duration-200 cursor-pointer !border-l-[6px] border-b-8 border-b-transparent rounded-lg my-2 relative",
                          "!border-l-transparent", // Always transparent to use gradient
                          getStatusBgColor(overallStatus || firstItem.status),
                          isNewlySent && "ring-2 ring-primary/20",
                          hasMultipleItems && isExpanded ? "border-b-0 shadow-none" : "shadow-sm hover:shadow-md"
                        )}
                        style={{
                          backgroundImage: getLeftBorderGradient(items) || undefined,
                          backgroundSize: "6px 100%",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "left top",
                          backgroundOrigin: "border-box"
                        }}
                        onClick={() => hasMultipleItems ? toggleGroup(requestNumber) : null}
                      >
                        {/* Expand/Collapse Header */}
                        <TableCell className="text-center py-4">
                          {hasMultipleItems && (
                            <div className="flex justify-center items-center h-7 w-7 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-foreground/60" /> : <ChevronRight className="h-4 w-4 text-foreground/60" />}
                            </div>
                          )}
                        </TableCell>

                        {/* Request # */}
                        <TableCell className="py-4">
                          <div className="font-mono text-lg font-black text-foreground tracking-tight">
                            {idType === "po" && firstItem.poNumber ? firstItem.poNumber :
                             idType === "cc" && firstItem.ccNumber ? firstItem.ccNumber :
                             idType === "dc" && firstItem.dcNumber ? firstItem.dcNumber :
                             `#${requestNumber}`}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {hasMultipleItems && (
                              <span className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wide">{items.length} items</span>
                            )}
                            {urgentCount > 0 && (
                              <Badge variant="destructive" className="h-4 px-1.5 text-[10px] gap-1 animate-pulse uppercase">
                                <AlertCircle className="h-2.5 w-2.5" />
                                {urgentCount === items.length ? "Urgent" : `Urgent (${urgentCount}/${items.length})`}
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Location */}
                        <TableCell className="py-4">
                          <div className="flex flex-col gap-1 max-w-[200px]">
                            {firstItem.project && (
                              <span
                                className="text-xs font-bold text-primary truncate cursor-pointer hover:underline"
                                title={firstItem.project.name}
                                onClick={(e) => { e.stopPropagation(); setSelectedProjectId(firstItem.project!._id); }}
                              >
                                {firstItem.project.name}
                              </span>
                            )}
                            {!firstItem.project && firstItem.site && (
                              <div
                                className="flex items-center gap-1 group bg-slate-400/5 hover:bg-slate-400/20 px-2 py-0.5 rounded-sm transition-colors cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); setSelectedSiteId(firstItem.siteId); }}
                              >
                                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />
                                <span className="truncate text-xs text-muted-foreground group-hover:underline group-hover:text-primary" title={firstItem.site?.name}>{firstItem.site?.name || "—"}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Date */}
                        <TableCell className="py-4">
                          <div className="space-y-2">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide mb-0.5">Required</span>
                              <span className={cn("text-sm font-bold", new Date(firstItem.requiredBy) < new Date() ? "text-red-600" : "text-foreground")}>
                                {format(new Date(firstItem.requiredBy), "dd MMM")}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide mb-0.5">Created</span>
                              <span className="text-xs text-muted-foreground/90 font-medium">{format(new Date(firstItem.createdAt), "dd/MM")}</span>
                            </div>
                          </div>
                        </TableCell>

                        {/* Items Preview */}
                        {isExpanded ? (
                          <TableCell className="py-4" colSpan={2}>
                            <span className="text-xs font-bold text-primary italic flex items-center gap-1.5 animate-pulse">
                              <ChevronDown className="h-3.5 w-3.5" /> Viewing details below...
                            </span>
                          </TableCell>
                        ) : (
                          <>
                            <TableCell className="py-4 min-w-[300px] align-top">
                              <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start gap-2">
                                    <span className="bg-primary/10 text-primary dark:text-white text-[10px] font-black font-mono px-1.5 py-0.5 rounded border border-primary/20 dark:border-primary/40 shadow-sm shrink-0 mt-0.5">
                                      #{firstItem.itemOrder ?? items.length}
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setSelectedItemName(firstItem.itemName); }}
                                      className="font-bold text-sm text-foreground dark:text-white mb-0.5 truncate hover:text-primary dark:hover:text-primary/90 hover:underline text-left block w-full leading-tight"
                                      title={firstItem.itemName}
                                    >
                                      {firstItem.itemName}
                                    </button>
                                  </div>
                                  {firstItem.description && (
                                    <div className="w-full text-xs text-muted-foreground mt-1">
                                      <ExpandableText text={firstItem.description} className="text-xs text-muted-foreground" limit={60} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-4 text-center align-top">
                              <div className="inline-flex flex-col items-center justify-center min-w-[60px] bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700/50 shadow-sm mt-1">
                                <span className="text-lg font-black text-foreground leading-none">{firstItem.quantity}</span>
                                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest mt-0.5">{firstItem.unit}</span>
                              </div>
                            </TableCell>
                          </>
                        )}

                        {/* Actions */}
                        <TableCell className="text-right py-4">
                          <div className="flex justify-end gap-1">
                            {/* Notes Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); setSelectedRequestNumberForNotes(firstItem.requestNumber); }}
                              className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 relative"
                              title="View Notes"
                            >
                              <NotebookPen className="h-4 w-4" />
                              {items[0].notesCount && items[0].notesCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-destructive text-[7px] text-destructive-foreground ring-1 ring-background">
                                  {items[0].notesCount}
                                </span>
                              )}
                            </Button>

                            {/* GRN Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); setSelectedRequestNumberForGRN(firstItem.requestNumber); }}
                              className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="View Request Logs"
                            >
                              <ScrollText className="h-4 w-4" />
                            </Button>

                            {firstItem.status === "draft" ? (
                              <>
                                {onViewDetails && (
                                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onViewDetails(firstItem._id); }} className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800" title="View Details">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
                                {onEditDraft && (
                                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEditDraft(requestNumber); }} className="h-8 w-8 p-0 rounded-full text-blue-600 hover:bg-blue-50 hover:text-blue-700" title="Edit">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                )}
                                {onDeleteDraft && (
                                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDeleteDraft(requestNumber); }} className="h-8 w-8 p-0 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700" title="Delete">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                                {onSendDraft && (
                                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onSendDraft(requestNumber); }} className="h-8 w-8 p-0 rounded-full text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" title="Send Request">
                                    <Send className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            ) : (
                              <>
                                {/* Recheck/Approved Actions */}

                                {!isExpanded && items.some(i => ["approved", "recheck"].includes(i.status)) && onCheck && !items.some(i => i.status === "ready_for_delivery") && (
                                  <Button
                                    size="sm"
                                    className="h-7 px-3 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm mr-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const checkItem = items.find(i => ["approved", "recheck"].includes(i.status));
                                      if (checkItem) onCheck(checkItem._id);
                                    }}
                                    title="Check/Split"
                                  >
                                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                                    Check/Split
                                  </Button>
                                )}
                                {!isExpanded && firstItem.status === "ready_for_cc" && userRole !== "manager" && (() => {
                                  // Count how many items from THIS group are selected
                                  const groupSelectedCC = items.filter(i => selectedCCItems.has(i._id));
                                  if (groupSelectedCC.length > 1) {
                                    // Show merged CC button
                                    return (
                                      <Button
                                        size="sm"
                                        className="h-7 px-3 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white shadow-sm mr-1 ring-2 ring-violet-400/40"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const ids = groupSelectedCC.map(i => i._id);
                                          onOpenCC?.(ids[0], ids);
                                          setSelectedCCItems(prev => {
                                            const next = new Set(prev);
                                            ids.forEach(id => next.delete(id));
                                            return next;
                                          });
                                        }}
                                      >
                                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                                        Create CC ({groupSelectedCC.length})
                                      </Button>
                                    );
                                  }
                                  return (
                                    <Button
                                      size="sm"
                                      className="h-7 px-3 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm mr-1"
                                      onClick={(e) => { e.stopPropagation(); (onOpenCC || onCheck)?.(firstItem._id); }}
                                      title="Create Cost Comparison"
                                    >
                                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                                      Create CC
                                    </Button>
                                  );
                                })()}

                                {/* When expanded and multiple CC items selected — show merged button on group header */}
                                {isExpanded && userRole !== "manager" && (() => {
                                  const groupSelectedCC = items.filter(i => selectedCCItems.has(i._id) && i.status === "ready_for_cc");
                                  if (groupSelectedCC.length < 2) return null;
                                  return (
                                    <Button
                                      size="sm"
                                      className="h-7 px-3 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white shadow-sm mr-1 ring-2 ring-violet-400/40"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const ids = groupSelectedCC.map(i => i._id);
                                        onOpenCC?.(ids[0], ids);
                                        setSelectedCCItems(prev => {
                                          const next = new Set(prev);
                                          ids.forEach(id => next.delete(id));
                                          return next;
                                        });
                                      }}
                                    >
                                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                                      Create CC ({groupSelectedCC.length})
                                    </Button>
                                  );
                                })()}
                                {userRole === "manager" && items.some(i => i.status === "cc_pending") && (
                                  <Button
                                    size="sm"
                                    className="h-7 px-3 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm mr-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const pendingItems = items.filter(i => i.status === "cc_pending");
                                      if (pendingItems.length > 0) {
                                        onOpenCC?.(pendingItems[0]._id, pendingItems.map(i => i._id));
                                      }
                                    }}
                                    title="Review Cost Comparison"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                    Review CC {items.filter(i => i.status === "cc_pending").length > 1 ? `(${items.filter(i => i.status === "cc_pending").length})` : ''}
                                  </Button>
                                )}
                                {!isExpanded && userRole !== "manager" && items.some(i => i.status === "cc_rejected") && (
                                  <Button
                                    size="sm"
                                    className="h-7 px-3 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm mr-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rejectedItems = items.filter(i => i.status === "cc_rejected");
                                      if (rejectedItems.length > 0) {
                                        (onOpenCC || onCheck)?.(rejectedItems[0]._id);
                                      }
                                    }}
                                    title="Resubmit Cost Comparison"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                    Resubmit CC
                                  </Button>
                                )}
                                {/* View CC Button - Collapsed Row - hide for merged CC (batch button handles it) */}
                                {!isExpanded && (() => {
                                  const ccItems = items.filter(i => ["cc_pending", "cc_approved", "cc_rejected", "ready_for_po"].includes(i.status as string));
                                  if (ccItems.length === 0) return null;
                                  // Merged CC: batch button already shown, skip this
                                  if (ccItems.length > 1) return null;
                                  // Single CC item: show View CC
                                  return (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-3 text-xs font-semibold shadow-sm border-purple-200 text-purple-700 hover:bg-purple-50 mr-1 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/30"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenCC?.(ccItems[0]._id) ?? onCheck?.(ccItems[0]._id);
                                      }}
                                      title="View Cost Comparison"
                                    >
                                      <Layers className="h-3 w-3 mr-1.5" />
                                      View CC
                                    </Button>
                                  );
                                })()}
                                {/* PO Batch Button - Collapsed Row - only show when items selected */}
                                {(onCreatePO || onCreateBulkPO) && items.some(i => i.status === "ready_for_po") && (() => {
                                  const poItems = items.filter(i => i.status === "ready_for_po");
                                  const groupSelectedPO = poItems.filter(i => isPOItemSelected(i._id));
                                  // Only show when at least 1 item selected
                                  if (groupSelectedPO.length === 0) return null;

                                  // Do not show bulk Create PO button if selected items have different vendors
                                  if (groupSelectedPO.length > 1) {
                                    const firstVendor = groupSelectedPO[0].selectedVendorId;
                                    const hasDifferentVendors = groupSelectedPO.some(i => i.selectedVendorId !== firstVendor);
                                    if (hasDifferentVendors) return null;
                                  }

                                  return (
                                    <Button
                                      size="sm"
                                      className="h-7 px-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm mr-1 animate-in fade-in duration-150"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const ids = groupSelectedPO.map(i => i._id);
                                        if (onCreateBulkPO && ids.length > 1) {
                                          onCreateBulkPO(ids);
                                        } else {
                                          ids.forEach(id => onCreatePO!(id));
                                        }
                                        setSelectedPOItems(prev => prev.filter(id => !ids.map(x => x as string).includes(id)));
                                      }}
                                      title={`Create PO for ${groupSelectedPO.length} selected`}
                                    >
                                      <ShoppingCart className="h-3 w-3 mr-1.5" />
                                      Create PO ({groupSelectedPO.length})
                                    </Button>
                                  );
                                })()}
                                {/* View DC Button - Collapsed Row */}
                                {!isExpanded && ["out_for_delivery", "delivery_processing", "delivery_stage", "delivered", "partially_processed", "ready_for_delivery"].includes(firstItem.status) && (
                                  <ViewDCFallbackButton item={firstItem} setViewDCId={setViewDCId} className="h-7 px-3 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white shadow-sm mr-1" />
                                )}
                                {onConfirmDelivery && ["out_for_delivery", "delivery_processing", "delivery_stage"].includes(firstItem.status) && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="h-7 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm animate-pulse mr-1"
                                    onClick={(e) => { e.stopPropagation(); onConfirmDelivery(firstItem._id); }}
                                    title="Confirm Delivery"
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Confirm
                                  </Button>
                                )}


                                {!isExpanded && userRole !== "manager" && items.some(i => i.status === "ready_for_delivery") && (
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const readyItemsToAssign = items.filter(i => i.status === "ready_for_delivery");
                                      setDcDialogItems(readyItemsToAssign.map(i => ({
                                        requestId: i._id,
                                        itemName: i.itemName,
                                        quantity: i.quantity,
                                        unit: i.unit,
                                        poNumber: i.poNumber || undefined
                                      })));
                                      setShowCreateDCDialog(true);
                                    }}
                                    className="h-7 px-3 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm mr-1"
                                    title="Create DC"
                                  >
                                    <Truck className="h-3 w-3 mr-1.5" />
                                    Create DC
                                  </Button>
                                )}

                                {!isExpanded && onCreatePO && (firstItem.status === "ready_for_po" || (firstItem.status as string) === "sign_rejected") && (() => {
                                  const poItems = items.filter(i => i.status === "ready_for_po");
                                  const isSignRejected = (firstItem.status as string) === "sign_rejected";
                                  // ready_for_po: batch button in header handles it — skip here
                                  if (!isSignRejected) return null;
                                  return (
                                    <Button
                                      size="sm"
                                      className="h-7 px-3 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm mr-1"
                                      onClick={(e) => { e.stopPropagation(); onCreatePO(firstItem._id); }}
                                      title="Resubmit PO"
                                    >
                                      <ShoppingCart className="h-3 w-3 mr-1.5" />
                                      Resubmit PO
                                    </Button>
                                  );
                                })()}
                                {onViewPDF && firstItem.poNumber && ["sign_pending", "sign_rejected", "pending_po", "ready_for_delivery"].includes(firstItem.status as string) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2.5 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-950 mr-1"
                                    onClick={(e) => { e.stopPropagation(); if (firstItem.poNumber) onViewPDF(firstItem.poNumber, firstItem._id); }}
                                    title="PO View"
                                  >
                                    <FileText className="h-3 w-3 mr-1" />
                                    PO View
                                  </Button>
                                )}
                                {onViewDetails && (
                                  <Button
                                    variant={userRole === ROLES.MANAGER && items.some(i => ["pending", "sign_pending"].includes(i.status)) ? "default" : "outline"}
                                    size="sm"
                                    className={cn(
                                      "h-7 px-3 text-xs font-bold shadow-sm transition-all rounded-md",
                                      userRole === ROLES.MANAGER && items.some(i => ["pending", "sign_pending"].includes(i.status))
                                        ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:-translate-y-0.5"
                                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200"
                                    )}
                                    onClick={(e) => { e.stopPropagation(); onViewDetails(firstItem._id); }}
                                    title={userRole === ROLES.MANAGER && items.some(i => ["pending", "sign_pending"].includes(i.status)) ? "Review Request" : "View Details"}
                                  >
                                    {userRole === ROLES.MANAGER && items.some(i => ["pending", "sign_pending"].includes(i.status)) ? "Review" : "View"}
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Details Row */}
                      {hasMultipleItems && isExpanded && (
                        <TableRow className={cn(
                          "border-t-0 border-b-8 border-b-transparent",
                          getStatusBgColor(overallStatus || firstItem.status)
                        )}>
                          <TableCell colSpan={7} className="p-0 border-t-0 bg-transparent">
                            <div className="py-3 px-6 sm:px-14 space-y-2">
                              {items.map((item, idx) => (
                                <div
                                  key={item._id}
                                  className={cn(
                                    "relative grid grid-cols-[24px_120px_2fr_100px_80px_320px] gap-4 items-center p-3 rounded-lg transition-all w-full mb-2 shadow-sm overflow-visible",
                                    "bg-white dark:bg-slate-950",
                                    getStatusBgColor(item.status),
                                    "border border-border/50 hover:shadow-md h-auto min-h-[80px]",
                                    selectedCCItems.has(item._id) && "ring-2 ring-violet-500/40",
                                    isPOItemSelected(item._id) && "ring-2 ring-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/20"
                                  )}
                                >
                                  {/* Status Bar */}
                                  <div className={cn("absolute left-0 top-0 bottom-0 w-[6px] z-10", getStatusBarColor(item.status))} />

                                  {/* CC / PO Checkbox */}
                                  <div className="flex items-center justify-center pl-2">
                                    {item.status === "ready_for_cc" && userRole !== "manager" && (
                                      <input
                                        type="checkbox"
                                        checked={selectedCCItems.has(item._id)}
                                        onChange={() => toggleCCItem(item._id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-4 w-4 rounded border-violet-400 accent-violet-600 cursor-pointer"
                                      />
                                    )}
                                    {item.status === "ready_for_po" && items.filter(i => i.status === "ready_for_po").length > 1 && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); togglePOItem(item._id); }}
                                        className={cn(
                                          "h-5 w-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer",
                                          isPOItemSelected(item._id)
                                            ? "bg-emerald-600 border-emerald-600 text-white"
                                            : "border-emerald-400 bg-white dark:bg-slate-900 hover:border-emerald-600"
                                        )}
                                        title="Select for PO creation"
                                      >
                                        {isPOItemSelected(item._id) && (
                                          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                          </svg>
                                        )}
                                      </button>
                                    )}
                                  </div>

                                  {/* Item Number */}
                                  <div className="text-center pb-1">
                                    <span className="bg-primary/10 text-primary text-xs font-black font-mono px-2 py-0.5 rounded border border-primary/20 shadow-sm block w-fit mx-auto truncate max-w-[110px]" title={item.poNumber || item.ccNumber || item.dcNumber || `#${item.itemOrder ?? (items.length - idx)}`}>
                                      {item.poNumber ? item.poNumber :
                                       item.ccNumber ? item.ccNumber :
                                       item.dcNumber ? item.dcNumber :
                                       `#${item.itemOrder ?? (items.length - idx)}`}
                                    </span>
                                  </div>

                                  {/* Item Name & Description */}
                                  <div className="min-w-0">
                                    <div className="flex flex-col">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedItemName(item.itemName); }}
                                        className="font-bold text-sm text-foreground mb-1 truncate hover:text-primary hover:underline text-left block w-full"
                                        title={item.itemName}
                                      >
                                        {item.itemName}
                                      </button>
                                      <div className="text-xs text-muted-foreground w-full">
                                        {item.description ? (
                                          <ExpandableText text={item.description} className="text-xs text-muted-foreground" limit={40} />
                                        ) : (
                                          <span className="italic opacity-50">No description</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Quantity & Location */}
                                  <div className="flex flex-col items-center justify-center gap-2">
                                    <div className="flex flex-col items-center">
                                      <span className="text-base font-black text-foreground tracking-tight">{item.quantity}</span>
                                      <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">{item.unit}</span>
                                    </div>
                                    {!item.project && item.site && (
                                        <div 
                                        className="flex items-center gap-1 bg-slate-500/10 hover:bg-slate-500/20 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                        onClick={(e) => { e.stopPropagation(); setSelectedSiteId(item.siteId); }}
                                        title={item.site.name}
                                        >
                                        <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
                                        <span className="text-[9px] font-bold truncate max-w-[80px]">{item.site.name}</span>
                                        </div>
                                    )}
                                  </div>

                                  {/* Tags (Urgent Only) */}
                                  <div className="flex flex-col gap-1.5 items-start mt-2 sm:mt-0">
                                    {item.isUrgent && item.status !== "direct_po" && item.directAction !== "po" && (
                                      <Badge variant="destructive" className="h-5 px-2 text-[10px] gap-1 animate-pulse shadow-sm shadow-red-500/20 uppercase">
                                        <AlertCircle className="h-3 w-3" />
                                        Urgent
                                      </Badge>
                                    )}
                                  </div>

                                  {/* Actions */}
                                  {/* Actions */}
                                  <div className="text-right flex flex-wrap justify-end items-center gap-1">
                                    {/* Calculated Inventory Status for Logic */}
                                    {(() => {
                                      const itemInventory = inventoryStatus && inventoryStatus[item.itemName];
                                      const hasFullStock = !!(
                                        itemInventory &&
                                        itemInventory.centralStock >= item.quantity
                                      );
                                      // Render Buttons
                                      return (
                                        <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                                          {item.status === "pending_po" ? (
                                            <>
                                              {userRole !== "manager" && (
                                                <Button
                                                  size="sm"
                                                  onClick={() => {
                                                    setEditQuantityItem({
                                                      id: item._id,
                                                      quantity: item.quantity,
                                                      name: item.itemName,
                                                      unit: item.unit
                                                    });
                                                  }}
                                                  className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex-1 sm:flex-none px-4"
                                                >
                                                  <CheckCircle className="h-3.5 w-3.5 mr-2" /> Available
                                                </Button>
                                              )}
                                              {onViewPDF && item.poNumber && (
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-8 px-3 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-950 ml-1 shadow-sm"
                                                  onClick={(e) => { e.stopPropagation(); onViewPDF(item.poNumber!, item._id); }}
                                                  title="PO View"
                                                >
                                                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                                                  PO View
                                                </Button>
                                              )}
                                            </>
                                          ) : (
                                            <>
                                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 w-full">

                                                {/* Check/Split */}
                                                {["approved", "recheck"].includes(item.status) && onCheck && (
                                                  <Button size="sm" onClick={() => onCheck(item._id)} className="h-8 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm w-full justify-center">
                                                    <Sparkles className="h-3.5 w-3.5 mr-1.5 shrink-0" /> Check/Split
                                                  </Button>
                                                )}
                                              </div>

                                              {/* Manager Review CC Button - only show if NOT a merged CC (merged CC has batch button at top) */}
                                              {userRole === "manager" && item.status === "cc_pending" && items.filter(i => i.status === "cc_pending").length <= 1 && (
                                                <Button
                                                  size="sm"
                                                  onClick={() =>
                                                    onOpenCC?.(
                                                      item._id,
                                                      items.filter((i) => i.status === "cc_pending").map((i) => i._id)
                                                    )
                                                  }
                                                  className="h-8 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm flex-1 sm:flex-none px-4"
                                                >
                                                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Review CC
                                                </Button>
                                              )}

                                              {/* Create CC Button */}
                                              {item.status === "ready_for_cc" && userRole !== "manager" && (
                                                <Button size="sm" onClick={() => (onOpenCC || onCheck)?.(item._id)} className="h-8 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm flex-1 sm:flex-none px-4">
                                                  <FileText className="h-3.5 w-3.5 mr-2" /> Create CC
                                                </Button>
                                              )}

                                              {/* Resubmit CC Button */}
                                              {item.status === "cc_rejected" && userRole !== "manager" && (
                                                <Button size="sm" onClick={() => (onOpenCC || onCheck)?.(item._id)} className="h-8 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm flex-1 sm:flex-none px-4">
                                                  <RefreshCw className="h-3.5 w-3.5 mr-2" /> Resubmit CC
                                                </Button>
                                              )}

                                              {/* View CC Button - hide per-item when merged CC (use top batch button instead) */}
                                              {["cc_pending", "cc_approved", "cc_rejected", "ready_for_po"].includes(item.status) &&
                                                (onOpenCC || onCheck) && (() => {
                                                  const ccSiblings = items.filter(i => ["cc_pending", "cc_approved", "cc_rejected", "ready_for_po"].includes(i.status as string));
                                                  // If merged CC (>1 items), don't show per-item View CC — top button handles it
                                                  if (ccSiblings.length > 1) return null;
                                                  return (
                                                    <Button size="sm" variant="outline" onClick={(e) => {
                                                      e.stopPropagation();
                                                      onOpenCC?.(item._id) ?? onCheck?.(item._id);
                                                    }} className="h-8 text-xs font-semibold shadow-sm flex-1 sm:flex-none px-4 border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/30">
                                                      <Layers className="h-3.5 w-3.5 mr-2" /> View CC
                                                    </Button>
                                                  );
                                                })()
                                              }

                                              {item.status === "ready_for_delivery" && userRole !== "manager" && (
                                                <Button
                                                  size="sm"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDcDialogItems([{
                                                      requestId: item._id,
                                                      itemName: item.itemName,
                                                      quantity: item.quantity,
                                                      unit: item.unit,
                                                      poNumber: item.poNumber || undefined
                                                    }]);
                                                    setShowCreateDCDialog(true);
                                                  }}
                                                  className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex-1 sm:flex-none px-4 shadow-sm"
                                                >
                                                  <Truck className="h-3.5 w-3.5 mr-2" />
                                                  Create DC
                                                </Button>
                                              )}

                                              {item.status === "ready_for_po" && onCreatePO && (() => {
                                                const poSiblings = items.filter(i => i.status === "ready_for_po");
                                                // Always show per-item Create PO button
                                                return (
                                                  <Button size="sm" onClick={() => onCreatePO(item._id)} className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex-1 sm:flex-none px-4 shadow-sm">
                                                    <ShoppingCart className="h-3.5 w-3.5 mr-2" /> Create PO
                                                  </Button>
                                                );
                                              })()}

                                              {/* View DC Button - For Out for Delivery / Delivered items */}
                                              {["out_for_delivery", "delivery_processing", "delivery_stage", "delivered"].includes(item.status) && item.deliveryId && (
                                                <Button
                                                  size="sm"
                                                  onClick={(e) => { e.stopPropagation(); setViewDCId(item.deliveryId!); }}
                                                  className="h-8 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white flex-1 sm:flex-none px-4 shadow-sm"
                                                >
                                                  <Eye className="h-3.5 w-3.5 mr-2" />
                                                  View DC
                                                </Button>
                                              )}

                                              {onConfirmDelivery && ["out_for_delivery", "delivery_processing", "delivery_stage"].includes(item.status) && (
                                                <Button
                                                  variant="default"
                                                  size="sm"
                                                  className="h-8 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm animate-pulse flex-1 sm:flex-none"
                                                  onClick={(e) => { e.stopPropagation(); onConfirmDelivery(item._id); }}
                                                >
                                                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                                                  Confirm
                                                </Button>
                                              )}

                                              {/* PDF Button for all PO-related statuses */}
                                              {onViewPDF && item.poNumber && ["sign_pending", "sign_rejected", "pending_po", "ready_for_delivery"].includes(item.status) && (
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-8 px-3 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-950 shadow-sm"
                                                  onClick={(e) => { e.stopPropagation(); onViewPDF(item.poNumber!, item._id); }}
                                                  title="PO View"
                                                >
                                                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                                                  PO View
                                                </Button>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      );
                                    })()}

                                    {/* View Button Removed as per request */}

                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
              </TableBody>
            </Table>
          </div>
        </div>

        </>
      )}


      {/* User Info Dialog */}
      <UserInfoDialog
        open={!!selectedUserId}
        onOpenChange={(open) => {
          if (!open) setSelectedUserId(null);
        }}
        userId={selectedUserId}
      />

      {/* Item Info Dialog */}
      <ItemInfoDialog
        open={!!selectedItemName}
        onOpenChange={(open) => {
          if (!open) setSelectedItemName(null);
        }}
        itemName={selectedItemName}
      />

      <LocationInfoDialog
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
        selectedRequestNumberForNotes && (
          <NotesTimelineDialog
            requestNumber={selectedRequestNumberForNotes}
            open={!!selectedRequestNumberForNotes}
            onOpenChange={(open) => {
              if (!open) setSelectedRequestNumberForNotes(null);
            }}
          />
        )
      }

      {/* GRN Audit Dialog */}
      {
        selectedRequestNumberForGRN && (
          <GRNAuditDialog
            requestNumber={selectedRequestNumberForGRN}
            open={!!selectedRequestNumberForGRN}
            onOpenChange={(open) => {
              if (!open) setSelectedRequestNumberForGRN(null);
            }}
            requestId={requests?.find(r => r.requestNumber === selectedRequestNumberForGRN)?._id}
            requestIds={requests?.filter(r => r.requestNumber === selectedRequestNumberForGRN).map(r => r._id) || []}
            poNumber={requests?.find(r => r.requestNumber === selectedRequestNumberForGRN)?.poNumber || undefined}
            onOpenCC={onOpenCC}
            onViewPDF={onViewPDF}
            onViewDC={(deliveryId) => setViewDCId(deliveryId)}
          />
        )
      }
      <PDFPreviewDialog
        open={!!pdfPreviewPoNumber}
        onOpenChange={(open) => !open && setPdfPreviewPoNumber(null)}
        poNumber={pdfPreviewPoNumber}
      />

      {/* Ready for CC Confirmation Dialog */}
      {
        showReadyForCCConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-sm mx-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl p-6 transform transition-all scale-100">
              <div className="flex flex-col items-center text-center gap-4 mb-6">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center ring-8 ring-blue-50 dark:ring-blue-900/10">
                  <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Ready for Cost Comparison
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[260px] mx-auto leading-relaxed">
                    Are you sure you want to mark this item as ready for cost comparison?
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowReadyForCCConfirm(null)}
                  className="w-full h-11 font-medium border-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (onMoveToCC && showReadyForCCConfirm) {
                      onMoveToCC(showReadyForCCConfirm);
                      setShowReadyForCCConfirm(null);
                    }
                  }}
                  className="w-full h-11 font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02]"
                >
                  Confirm
                </Button>
              </div>
            </div>
          </div>
        )
      }

      {/* Ready for PO Confirmation Dialog */}
      {
        showReadyForPOConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-sm mx-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl p-6 transform transition-all scale-100">
              <div className="flex flex-col items-center text-center gap-4 mb-6">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center ring-8 ring-emerald-50 dark:ring-emerald-900/10">
                  <ShoppingCart className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Confirm Direct PO
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[260px] mx-auto leading-relaxed mt-2">
                    This item will be marked for <span className="font-semibold text-emerald-600 dark:text-emerald-400">Direct Purchase Order</span>.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowReadyForPOConfirm(null)}
                  className="w-full h-11 font-medium border-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (onDirectPO && showReadyForPOConfirm) {
                      onDirectPO(showReadyForPOConfirm);
                      setShowReadyForPOConfirm(null);
                    }
                  }}
                  className="w-full h-11 font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02]"
                >
                  Confirm PO
                </Button>
              </div>
            </div>
          </div>
        )
      }

      {/* Ready for Delivery Confirmation Dialog */}
      {
        showReadyForDeliveryConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-sm mx-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl p-6 transform transition-all scale-100">
              <div className="flex flex-col items-center text-center gap-4 mb-6">
                <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center ring-8 ring-orange-50 dark:ring-orange-900/10">
                  <Truck className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Confirm Direct Delivery
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[260px] mx-auto leading-relaxed mt-2">
                    This item will be marked for <span className="font-semibold text-orange-600 dark:text-orange-400">Direct Delivery</span> from inventory.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowReadyForDeliveryConfirm(null)}
                  className="w-full h-11 font-medium border-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (onDirectDelivery && showReadyForDeliveryConfirm) {
                      onDirectDelivery(showReadyForDeliveryConfirm);
                      setShowReadyForDeliveryConfirm(null);
                    }
                  }}
                  className="w-full h-11 font-medium bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02]"
                >
                  Confirm Delivery
                </Button>
              </div>
            </div>
          </div>
        )
      }

      {/* Edit PO Quantity Dialog - Shows BEFORE Create DC for pending_po items */}
      <EditPOQuantityDialog
        open={!!editQuantityItem}
        onOpenChange={(open) => !open && setEditQuantityItem(null)}
        requestId={editQuantityItem?.id || null}
        currentQuantity={editQuantityItem?.quantity || 0}
        itemName={editQuantityItem?.name || ""}
        unit={editQuantityItem?.unit || ""}
        onSuccess={() => {
          setEditQuantityItem(null);
        }}
      />
      <CreateDCMultiDialog
        open={showCreateDCDialog}
        onOpenChange={(open) => {
          setShowCreateDCDialog(open);
          if (!open) setDcDialogItems([]);
        }}
        items={dcDialogItems}
        poNumber={dcDialogItems[0]?.poNumber}
      />

      {/* View DC Dialog */}
      <ViewDCDialog
        open={viewDCId !== null}
        onOpenChange={(open) => !open && setViewDCId(null)}
        deliveryId={viewDCId}
      />
    </>
  );
}

function ViewDCFallbackButton({ item, setViewDCId, className }: { item: any, setViewDCId: (id: Id<"deliveries">) => void, className?: string }) {
  const deliveries = useQuery(api.deliveries.getDeliveriesByPO, item.poId ? { poId: item.poId } : "skip");
  const fallbackId = deliveries?.[0]?._id;

  if (!item.deliveryId && !fallbackId) return null;

  return (
    <Button
      size="sm"
      className={className}
      onClick={(e) => { e.stopPropagation(); setViewDCId((item.deliveryId || fallbackId)!); }}
      title="View DC"
    >
      <Eye className="h-3 w-3 mr-1" />
      View DC
    </Button>
  );
}
