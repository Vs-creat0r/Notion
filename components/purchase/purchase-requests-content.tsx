"use client";

/**
 * Purchase Requests Content Component
 * 
 * Client component for purchase officer to view and manage requests.
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Check, CheckCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RequestDetailsDialog } from "@/components/requests/request-details-dialog";
import { ItemInfoDialog } from "@/components/requests/item-info-dialog";
import { LocationInfoDialog } from "@/components/locations/location-info-dialog";
import { toast } from "sonner";
import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";
import { Clock, FileText, ShoppingCart, Truck, Search, Filter, LayoutGrid, Table as TableIcon, Eye, AlertCircle, FileText as FileTextIcon, Edit, Zap, XCircle } from "lucide-react";
import { RequestCardWithCC } from "./request-card-with-cc";
import { PurchaseRequestGroupCard } from "./purchase-request-group-card";
import { CostComparisonDialog } from "./cost-comparison-dialog";
import { CompactImageGallery } from "@/components/ui/image-gallery";
import { cn } from "@/lib/utils";
import { DirectPODialog, type DirectPOInitialData } from "./direct-po-dialog";
import { CheckDialog } from "./check-dialog";
import { useViewMode } from "@/hooks/use-view-mode";
import { RequestsTable } from "@/components/requests/requests-table";
import { PDFPreviewDialog } from "./pdf-preview-dialog";
import { ConfirmDeliveryDialog } from "@/components/requests/confirm-delivery-dialog";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Table2, X } from "lucide-react";
import { PendingPODialog } from "./pending-po-dialog";
import { DirectCCSetupDialog } from "./direct-cc-setup-dialog";
import { DirectDeliveryDialog } from "./direct-delivery-dialog";

// Enhanced status configuration with better visual hierarchy
const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any; color: string }> = {
  draft: { label: "Draft", variant: "outline", icon: FileTextIcon, color: "gray" },
  pending: { label: "Pending Approval", variant: "secondary", icon: Clock, color: "yellow" },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle, color: "red" },
  recheck: { label: "Recheck", variant: "default", icon: AlertCircle, color: "orange" },
  ready_for_cc: { label: "Ready for CC", variant: "default", icon: FileText, color: "blue" },
  cc_pending: { label: "CC Pending", variant: "secondary", icon: Clock, color: "amber" },
  cc_rejected: { label: "CC Rejected", variant: "destructive", icon: XCircle, color: "red" },
  ready_for_po: { label: "Ready for PO", variant: "default", icon: ShoppingCart, color: "emerald" },
  sign_pending: { label: "Sign Pending", variant: "secondary", icon: Clock, color: "amber" },
  sign_rejected: { label: "Sign Rejected", variant: "destructive", icon: XCircle, color: "red" },
  pending_po: { label: "Pending PO", variant: "secondary", icon: Clock, color: "amber" },
  // Delivery statuses grouped at the end
  ready_for_delivery: { label: "Ready for Delivery", variant: "default", icon: Truck, color: "indigo" },
  delivery_processing: { label: "Out for Delivery", variant: "secondary", icon: Truck, color: "blue" },
  delivery_stage: { label: "Out for Delivery", variant: "secondary", icon: Truck, color: "blue" }, // Legacy support
  delivered: { label: "Delivered", variant: "secondary", icon: CheckCircle, color: "green" },
};



// Color mapping for filter items
const colorMap: Record<string, { checkboxActive: string; checkboxBorder: string; text: string; bgHover: string }> = {
  gray: { checkboxActive: "bg-slate-500 border-slate-500 text-white", checkboxBorder: "border-slate-400", text: "text-slate-700 dark:text-slate-300", bgHover: "data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800" },
  yellow: { checkboxActive: "bg-yellow-500 border-yellow-500 text-white", checkboxBorder: "border-yellow-500", text: "text-yellow-700 dark:text-yellow-400", bgHover: "data-[selected=true]:bg-yellow-50 dark:data-[selected=true]:bg-yellow-900/20" },
  red: { checkboxActive: "bg-red-600 border-red-600 text-white", checkboxBorder: "border-red-500", text: "text-red-700 dark:text-red-400", bgHover: "data-[selected=true]:bg-red-50 dark:data-[selected=true]:bg-red-900/20" },
  orange: { checkboxActive: "bg-orange-500 border-orange-500 text-white", checkboxBorder: "border-orange-500", text: "text-orange-700 dark:text-orange-400", bgHover: "data-[selected=true]:bg-orange-50 dark:data-[selected=true]:bg-orange-900/20" },
  blue: { checkboxActive: "bg-blue-500 border-blue-500 text-white", checkboxBorder: "border-blue-500", text: "text-blue-700 dark:text-blue-400", bgHover: "data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20" },
  amber: { checkboxActive: "bg-amber-500 border-amber-500 text-white", checkboxBorder: "border-amber-500", text: "text-amber-700 dark:text-amber-400", bgHover: "data-[selected=true]:bg-amber-50 dark:data-[selected=true]:bg-amber-900/20" },
  emerald: { checkboxActive: "bg-emerald-500 border-emerald-500 text-white", checkboxBorder: "border-emerald-500", text: "text-emerald-700 dark:text-emerald-400", bgHover: "data-[selected=true]:bg-emerald-50 dark:data-[selected=true]:bg-emerald-900/20" },
  indigo: { checkboxActive: "bg-indigo-500 border-indigo-500 text-white", checkboxBorder: "border-indigo-500", text: "text-indigo-700 dark:text-indigo-400", bgHover: "data-[selected=true]:bg-indigo-50 dark:data-[selected=true]:bg-indigo-900/20" },
  green: { checkboxActive: "bg-green-600 border-green-600 text-white", checkboxBorder: "border-green-600", text: "text-green-700 dark:text-green-400", bgHover: "data-[selected=true]:bg-green-50 dark:data-[selected=true]:bg-green-900/20" },
};

export function PurchaseRequestsContent() {

  const [selectedRequestId, setSelectedRequestId] = useState<Id<"requests"> | null>(null);
  const [ccRequestId, setCCRequestId] = useState<Id<"requests"> | null>(null);
  const [ccRequestIds, setCCRequestIds] = useState<Id<"requests">[]>([]);
  const [checkRequestId, setCheckRequestId] = useState<Id<"requests"> | null>(null);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const { viewMode, toggleViewMode } = useViewMode();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<Id<"sites"> | null>(null);
  const [showDirectPODialog, setShowDirectPODialog] = useState(false);
  const [directPOMode, setDirectPOMode] = useState<"standard" | "direct">("standard");
  const [directPOInitialData, setDirectPOInitialData] = useState<DirectPOInitialData | null>(null);
  const [pdfPreviewPoNumber, setPdfPreviewPoNumber] = useState<string | null>(null);
  const [pdfPreviewRequestId, setPdfPreviewRequestId] = useState<string | null>(null);
  const [showPendingPODialog, setShowPendingPODialog] = useState(false);
  const [showDirectCCDialog, setShowDirectCCDialog] = useState(false);
  const [showDirectDCDialog, setShowDirectDCDialog] = useState(false);

  // Read requestId from URL if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const reqId = url.searchParams.get("requestId");
      if (reqId) {
        setSelectedRequestId(reqId as Id<"requests">);
        url.searchParams.delete("requestId");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, []);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load page size from localStorage after hydration (client-side only)
  useEffect(() => {
    setIsHydrated(true);
    const saved = localStorage.getItem('purchaseRequestsPageSize');
    if (saved) {
      setPageSize(Number(saved));
    }
  }, []);

  // Save page size to localStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('purchaseRequestsPageSize', pageSize.toString());
    }
  }, [pageSize, isHydrated]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus.length, viewMode]);

  // Debounced search (optional but good for consistency)
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const allRequests = useQuery(api.requests.getPurchaseRequestsByStatus, {});
  const vendors = useQuery(api.vendors.getAllVendors);
  const convex = useConvex();

  // Enhanced filtering with search - group by requestNumber like manager pages
  const filteredRequestGroups = useMemo(() => {
    if (!allRequests) return [];

    let filtered = allRequests;

    // Filter by status dropdown
    // Special handling for legacy 'delivery_stage' mapping to 'delivery_processing'
    if (filterStatus.length > 0) {
      filtered = filtered.filter((r) => {
        if (filterStatus.includes("delivery_processing") && r.status === "delivery_stage") return true;
        return filterStatus.includes(r.status);
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((request) => {
        const matchesRequestNumber = request.requestNumber.toLowerCase().includes(query);
        const matchesItemName = request.itemName.toLowerCase().includes(query);
        const matchesSiteName = request.site?.name.toLowerCase().includes(query);
        const matchesCreatorName = request.creator?.fullName.toLowerCase().includes(query);
        const matchesDescription = request.description?.toLowerCase().includes(query);

        return matchesRequestNumber || matchesItemName || matchesSiteName || matchesCreatorName || matchesDescription;
      });
    }

    // Group by requestNumber like manager pages
    const groupedRequests = new Map<string, typeof filtered>();

    filtered.forEach((request) => {
      const group = groupedRequests.get(request.requestNumber) || [];
      group.push(request);
      groupedRequests.set(request.requestNumber, group);
    });

    // Convert to array and sort like manager pages
    const groupedRequestsArray = Array.from(groupedRequests.entries())
      .map(([requestNumber, items]) => {
        // Sort items within group by itemOrder or createdAt
        const sortedItems = items.sort((a, b) => {
          const orderA = a.itemOrder ?? a.createdAt;
          const orderB = b.itemOrder ?? b.createdAt;
          return orderA - orderB; // Ascending order
        });
        return {
          requestNumber,
          items: sortedItems,
          firstItem: sortedItems[0], // Use first item for shared data
        };
      })
      .sort((a, b) => {
        // Sort groups by the newest item's updatedAt
        const aLatest = Math.max(...a.items.map((i) => i.updatedAt || i.createdAt));
        const bLatest = Math.max(...b.items.map((i) => i.updatedAt || i.createdAt));
        return bLatest - aLatest;
      });

    return groupedRequestsArray;
  }, [allRequests, filterStatus, debouncedSearchQuery]);

  // Pagination Logic
  const totalItems = filteredRequestGroups.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const paginatedGroups = filteredRequestGroups.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const paginatedRequests = paginatedGroups.flatMap(group => group.items);

  const directToPO = useMutation(api.requests.directToPO);
  const updatePurchaseStatus = useMutation(api.requests.updatePurchaseRequestStatus);
  const [showConfirmDelivery, setShowConfirmDelivery] = useState<Id<"requests"> | null>(null);
  // Mixed vendor alert state
  const [mixedVendorAlert, setMixedVendorAlert] = useState<{
    groups: { vendorName: string; vendorId: string; items: string[] }[];
    requestIds: Id<"requests">[][];
  } | null>(null);

  const handleDirectPO = async (requestId: Id<"requests">) => {
    try {
      await directToPO({ requestId });
      toast.success("Request moved to Ready for PO");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleDirectDelivery = async (requestId: Id<"requests">) => {
    try {
      await updatePurchaseStatus({ requestId, status: "ready_for_delivery" });
      toast.success("Request moved to Out for Delivery");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleMoveToCC = async (requestId: Id<"requests">) => {
    try {
      await updatePurchaseStatus({ requestId, status: "ready_for_cc" });
      toast.success("Request moved to Ready for CC");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleCheck = (requestId: Id<"requests">) => {
    setCheckRequestId(requestId);
  };

  const handleCreatePO = async (requestId: Id<"requests">) => {
    const toastId = toast.loading("Checking history...");
    let rejectedPO = null;

    try {
      const allPOs = await convex.query(api.purchaseOrders.getAllPurchaseOrders);
      const request = allRequests?.find(r => r._id === requestId);

      // Sort POs by creation time to get the latest rejection
      const sortedPOs = allPOs?.slice().sort((a: any, b: any) => b._creationTime - a._creationTime);

      // Try to find existing rejected PO for this request to restore full data
      rejectedPO = sortedPOs?.find((po: any) =>
        ['rejected', 'sign_rejected'].includes(po.status) &&
        (
          po.items?.some((i: any) => String(i.requestId) === String(requestId)) ||
          (request && po.requestNumber && po.requestNumber === request.requestNumber)
        )
      );
    } catch (error) {
      console.error("Failed to fetch PO history:", error);
      // Continue without restoration if fetch fails
    }

    toast.dismiss(toastId);

    if (rejectedPO) {
      // Restore from Rejected PO
      setDirectPOInitialData({
        requestNumber: undefined, // Create new number
        vendorId: rejectedPO.vendor?._id,
        deliverySiteId: rejectedPO.site?._id,
        deliverySiteName: rejectedPO.site?.name,
        items: (rejectedPO as any).items.map((item: any) => {
          // Extract GST rate and split into SGST/CGST
          const gstRate = item.gstTaxRate || 0;
          return {
            requestId: item.requestId,
            itemDescription: item.itemDescription || item.itemName || "",
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitRate || item.unitPrice,
            discountPercent: item.discountPercent || 0,
            sgst: gstRate / 2,
            cgst: gstRate / 2,
            hsnCode: item.hsnSacCode || item.hsnCode
          };
        }),
        vendorDetails: rejectedPO.vendor ? {
          name: rejectedPO.vendor.companyName,
          email: rejectedPO.vendor.email,
          phone: rejectedPO.vendor.phone,
          contactName: rejectedPO.vendor.contactName,
          gstNumber: rejectedPO.vendor.gstNumber,
          address: rejectedPO.vendor.address
        } : undefined,
        notes: rejectedPO.rejectionReason ? `[Rejection Reason: ${rejectedPO.rejectionReason}]\n${rejectedPO.notes || ''}` : rejectedPO.notes,
        validTill: rejectedPO.validTill ? new Date(rejectedPO.validTill).toISOString().split('T')[0] : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      });
      toast.success("Restored rejected draft details");
      setDirectPOMode("standard");
      setShowDirectPODialog(true);
      return;
    }

    const request = allRequests?.find(r => r._id === requestId);
    if (request) {
      let unitPrice = 0;
      let discountPercent = 0;
      let sgst = 0;
      let cgst = 0;
      const vendorId = request.selectedVendorId;

      // Try to find price from selected vendor quote
      if (vendorId && request.vendorQuotes) {
        const quote = request.vendorQuotes.find(q => q.vendorId === vendorId);
        if (quote) {
          unitPrice = quote.unitPrice || 0;
          discountPercent = (quote as any).discountPercent || 0;
          const gst = (quote as any).gstPercent || 0;
          sgst = gst ? gst / 2 : 0;
          cgst = gst ? gst / 2 : 0;
        }
      }

      setDirectPOInitialData({
        requestNumber: request.requestNumber,
        vendorId: vendorId || undefined,
        deliverySiteId: request.site?._id,
        deliverySiteName: request.site?.name,
        items: [{
          requestId: request._id,
          itemDescription: request.itemName,
          description: request.description,
          quantity: request.quantity,
          unit: request.unit,
          unitPrice: unitPrice,
          discountPercent: discountPercent,
          sgst: sgst,
          cgst: cgst,
        }],
        vendorDetails: (vendorId && vendors) ? (() => {
          const v = vendors.find(v => v._id === vendorId);
          return v ? {
            name: v.companyName,
            email: v.email,
            phone: v.phone,
            contactName: v.contactName,
            gstNumber: v.gstNumber,
            address: v.address
          } : undefined;
        })() : undefined,
        notes: (request as any).rejectionReason ? `[Rejection Reason: ${(request as any).rejectionReason}]` : undefined,
      });
    } else {
      setDirectPOInitialData(null);
    }

    setDirectPOMode("standard");
    setShowDirectPODialog(true);
  };

  const handleCreateBulkPO = async (requestIds: Id<"requests">[]) => {
    if (!requestIds.length) return;

    const toastId = toast.loading("Preparing PO...");

    // Get all request objects
    const requests = allRequests?.filter(r => requestIds.includes(r._id)) || [];
    if (requests.length === 0) {
      toast.dismiss(toastId);
      return;
    }

    // Try to find existing rejected PO for these requests to restore full data
    let rejectedPO = null;
    try {
      const allPOs = await convex.query(api.purchaseOrders.getAllPurchaseOrders);
      // Sort POs by creation time to get the latest rejection
      const sortedPOs = allPOs?.slice().sort((a: any, b: any) => b._creationTime - a._creationTime);

      // Try to find a rejected PO that matches any of these request IDs
      rejectedPO = sortedPOs?.find((po: any) =>
        ['rejected', 'sign_rejected'].includes(po.status) &&
        (
          po.items?.some((i: any) => requestIds.includes(i.requestId)) ||
          requestIds.some(rid => {
            const req = requests.find(r => r._id === rid);
            return req && po.requestNumber && po.requestNumber === req.requestNumber;
          })
        )
      );
    } catch (error) {
      console.error("Failed to fetch PO history:", error);
    }

    toast.dismiss(toastId);

    // If we found a rejected PO, restore all its data
    if (rejectedPO) {
      const rpo = rejectedPO as any;
      setDirectPOInitialData({
        requestNumber: undefined, // Create new PO number
        vendorId: rpo.vendorId || rpo.vendor?._id,
        deliverySiteId: rpo.deliverySiteId || rpo.site?._id,
        deliverySiteName: rpo.deliverySite?.name || rpo.site?.name || rpo.deliveryAddress,
        items: rpo.items?.map((item: any) => {
          // Extract GST rate and split into SGST/CGST
          const gstRate = item.gstTaxRate || 0;
          return {
            requestId: item.requestId,
            itemDescription: item.itemDescription || item.itemName || "",
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitRate || item.unitPrice || 0,
            discountPercent: item.discountPercent || 0,
            sgst: gstRate / 2,
            cgst: gstRate / 2,
            hsnCode: item.hsnSacCode || item.hsnCode
          };
        }) || requests.map(req => ({
          requestId: req._id,
          itemDescription: req.itemName,
          description: req.description,
          quantity: req.quantity,
          unit: req.unit,
          unitPrice: 0,
          discountPercent: 0,
          sgst: 0,
          cgst: 0,
        })),
        vendorDetails: rpo.vendor ? {
          name: rpo.vendor.companyName,
          email: rpo.vendor.email,
          phone: rpo.vendor.phone,
          contactName: rpo.vendor.contactName,
          gstNumber: rpo.vendor.gstNumber,
          address: rpo.vendor.address
        } : undefined,
        notes: rpo.rejectionReason ? `[Rejection Reason: ${rpo.rejectionReason}]\n${rpo.notes || ''}` : rpo.notes,
        validTill: rpo.validTill ? new Date(rpo.validTill).toISOString().split('T')[0] : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      });
      toast.success("Restored rejected PO details");
      setDirectPOMode("standard");
      setShowDirectPODialog(true);
      return;
    }

    // No rejected PO found, create new from request data
    // Use the first request to determine common fields (Site, Vendor)
    const firstRequest = requests[0];
    const commonVendorId = firstRequest.selectedVendorId;
    const commonSiteId = firstRequest.site?._id;

    // Check for mixed vendors/sites?
    const mixedVendors = requests.some(r => r.selectedVendorId !== commonVendorId);
    const mixedSites = requests.some(r => r.site?._id !== commonSiteId);

    if (mixedSites) {
      toast.warning("Selected items have different delivery sites. Using site from first item.");
    }

    if (mixedVendors) {
      // Group items by vendor and show alert
      const vendorGroups = new Map<string, typeof requests>();
      requests.forEach(req => {
        const vid = (req.selectedVendorId as string) || "unknown";
        if (!vendorGroups.has(vid)) vendorGroups.set(vid, []);
        vendorGroups.get(vid)!.push(req);
      });

      if (vendorGroups.size > 1) {
        const groups = Array.from(vendorGroups.entries()).map(([vid, reqs]) => {
          const vendor = vendors?.find(v => v._id === vid);
          return {
            vendorName: vendor?.companyName || "Unknown Vendor",
            vendorId: vid,
            items: reqs.map(r => r.itemName),
          };
        });
        setMixedVendorAlert({
          groups,
          requestIds: Array.from(vendorGroups.values()).map(reqs => reqs.map(r => r._id)),
        });
        toast.dismiss(toastId);
        return;
      }
    }

    // Map items
    const items = await Promise.all(requests.map(async (req) => {
      let quantity = req.quantity;

      // Fetch Cost Comparison to get "purchaseQuantity" (Buffer/Extra) if available
      // We try/catch to ensure one failure doesn't block the whole PO creation
      try {
        const cc = await convex.query(api.costComparisons.getCostComparisonByRequestId, { requestId: req._id });
        if (cc && cc.purchaseQuantity) {
          quantity = cc.purchaseQuantity;
        }
      } catch (e) {
        console.error("Failed to fetch CC for request", req._id, e);
      }

      let unitPrice = 0;
      let discountPercent = 0;
      let sgst = 0;
      let cgst = 0;
      if (req.selectedVendorId && req.vendorQuotes) {
        const quote = req.vendorQuotes.find(q => q.vendorId === req.selectedVendorId);
        if (quote) {
          unitPrice = quote.unitPrice || 0;
          discountPercent = (quote as any).discountPercent || 0;
          const gst = (quote as any).gstPercent || 0;
          sgst = gst ? gst / 2 : 0;
          cgst = gst ? gst / 2 : 0;
        }
      }
      return {
        requestId: req._id,
        itemDescription: req.itemName,
        description: req.description,
        quantity: quantity,
        originalQuantity: req.quantity,
        unit: req.unit,
        unitPrice: unitPrice,
        discountPercent: discountPercent,
        sgst: sgst,
        cgst: cgst,
      };
    }));

    // Fetch vendor details if we have a vendor ID
    let vendorDetails = undefined;
    if (commonVendorId && vendors) {
      const v = vendors.find(v => v._id === commonVendorId);
      if (v) {
        vendorDetails = {
          name: v.companyName,
          email: v.email,
          phone: v.phone,
          contactName: v.contactName,
          gstNumber: v.gstNumber,
          address: v.address
        };
      }
    }

    setDirectPOInitialData({
      requestNumber: firstRequest.requestNumber,
      vendorId: commonVendorId || undefined,
      deliverySiteId: commonSiteId,
      deliverySiteName: firstRequest.site?.name,
      items: items,
      vendorDetails: vendorDetails,
      notes: undefined,
      validTill: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    });

    setDirectPOMode("standard");
    setShowDirectPODialog(true);
  };

  const handleOpenDirectPO = () => {
    setDirectPOMode("direct");
    setDirectPOInitialData(null);
    setShowDirectPODialog(true);
  };

  return (
    <>
      {/* ── Pending PO full-page view (replaces main table) ── */}
      {showPendingPODialog && (
        <div className="space-y-6">
          <PendingPODialog
            onBack={() => setShowPendingPODialog(false)}
            onViewPO={(poNumber, requestId) => {
              setPdfPreviewPoNumber(poNumber);
              setPdfPreviewRequestId(requestId);
            }}
            onCreateDirectPO={() => {
              setShowPendingPODialog(false);
              handleOpenDirectPO();
            }}
          />
          {/* Keep PDF preview dialog mounted */}
          <PDFPreviewDialog
            open={!!pdfPreviewPoNumber}
            onOpenChange={(open) => { if (!open) { setPdfPreviewPoNumber(null); setPdfPreviewRequestId(null); } }}
            poNumber={pdfPreviewPoNumber}
            requestId={pdfPreviewRequestId}
          />
          <DirectPODialog
            open={showDirectPODialog}
            onOpenChange={(open) => {
              setShowDirectPODialog(open);
              if (!open) setDirectPOInitialData(null);
            }}
            initialData={directPOInitialData}
            mode={directPOMode}
          />
        </div>
      )}

      {/* ── Normal requests view ── */}
      {!showPendingPODialog && (
        <div className="space-y-6">


          {/* Controls: Search, View, Filter, Actions */}
          <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
            {/* Row 1: Search and View Toggle */}
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by request number, item, site, or requester..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`pl-9 pr-9 h-9 sm:h-10 text-base w-full ${searchQuery.trim() ? 'ring-2 ring-blue-500/50 border-blue-500' : ''}`}
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
                    title="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleViewMode}
                className="h-9 sm:h-10 w-9 sm:w-10 flex-shrink-0"
                title={`Switch to ${viewMode === "card" ? "table" : "card"} view`}
              >
                {viewMode === "card" ? (
                  <Table2 className="h-4 w-4" />
                ) : (
                  <LayoutGrid className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
              {/* Status Filter */}
              <div className="flex-1 sm:flex-none sm:w-[250px]">
                {isHydrated ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between h-9 sm:h-10"
                      >
                        {filterStatus.length > 0
                          ? `${filterStatus.length} selected`
                          : "Filter by status"}
                        <Filter className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search status..." />
                        <CommandList className="max-h-[600px] overflow-y-auto">
                          <CommandEmpty>No status found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => setFilterStatus([])}
                              className="font-medium h-auto py-3 items-start"
                            >
                              <div
                                className={cn(
                                  "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary mt-0.5",
                                  filterStatus.length === 0
                                    ? "bg-primary text-primary-foreground"
                                    : "opacity-50 [&_svg]:invisible"
                                )}
                              >
                                <Check className={cn("h-4 w-4")} />
                              </div>
                              <span className="flex-1 whitespace-normal break-words leading-tight">All Statuses</span>
                            </CommandItem>
                            {/* Draft (My Drafts) Special Case */}
                            <CommandItem
                              onSelect={() => {
                                setFilterStatus((prev) =>
                                  prev.includes("draft")
                                    ? prev.filter((s) => s !== "draft")
                                    : [...prev, "draft"]
                                );
                              }}
                              className={cn("h-auto py-3 items-start", colorMap.gray.bgHover)}
                            >
                              <div
                                className={cn(
                                  "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border mt-0.5",
                                  filterStatus.includes("draft")
                                    ? colorMap.gray.checkboxActive
                                    : cn(colorMap.gray.checkboxBorder, "opacity-50 [&_svg]:invisible")
                                )}
                              >
                                <Check className={cn("h-4 w-4")} />
                              </div>
                              <span className={cn("flex-1 whitespace-normal break-words leading-tight", colorMap.gray.text)}>Draft (My Drafts)</span>
                            </CommandItem>
                            {Object.entries(statusConfig)
                              .filter(([key]) => key !== "draft" && key !== "delivery_stage")
                              .map(([key, config]) => (
                                <CommandItem
                                  key={key}
                                  onSelect={() => {
                                    setFilterStatus((prev) =>
                                      prev.includes(key)
                                        ? prev.filter((s) => s !== key)
                                        : [...prev, key]
                                    );
                                  }}
                                  className={cn("h-auto py-3 items-start", (colorMap[config.color] || colorMap.gray).bgHover)}
                                >
                                  <div
                                    className={cn(
                                      "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border mt-0.5",
                                      filterStatus.includes(key)
                                        ? (colorMap[config.color] || colorMap.gray).checkboxActive
                                        : cn((colorMap[config.color] || colorMap.gray).checkboxBorder, "opacity-50 [&_svg]:invisible")
                                    )}
                                  >
                                    <Check className={cn("h-4 w-4")} />
                                  </div>
                                  <span className={cn("flex-1 whitespace-normal break-words leading-tight", (colorMap[config.color] || colorMap.gray).text)}>{config.label}</span>
                                </CommandItem>
                              ))}
                          </CommandGroup>
                          {filterStatus.length > 0 && (
                            <>
                              <CommandSeparator />
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => setFilterStatus([])}
                                  className="justify-center text-center"
                                >
                                  Clear filters
                                </CommandItem>
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Button variant="outline" className="w-full justify-between h-9 sm:h-10 opacity-50" disabled>
                    Filter by status
                    <Filter className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                )}
              </div>

              {/* Pending PO Button - Left side after filter */}
              <Button
                variant="outline"
                onClick={() => setShowPendingPODialog(true)}
                className={cn(
                  "h-9 sm:h-10 transition-all ml-1",
                  "border-amber-500/60 text-amber-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-500 dark:hover:bg-amber-900/20 dark:text-amber-400 dark:border-amber-500/50 flex-shrink-0"
                )}
              >
                <Clock className="h-4 w-4 mr-2" />
                Pending PO
              </Button>

              {/* Direct Action Buttons - Pushed to the right side */}
              <div className="flex items-center gap-2 flex-wrap ml-auto">
                <Button
                  size="sm"
                  onClick={() => setShowDirectCCDialog(true)}
                  className="h-9 sm:h-10 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
                >
                  <FileText className="h-4 w-4" />
                  RFQ
                </Button>

                <Button
                  onClick={handleOpenDirectPO}
                  size="sm"
                  className="h-9 sm:h-10 gap-1.5 bg-orange-500 hover:bg-orange-600 text-white shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
                >
                  <Zap className="h-4 w-4" />
                  Direct PO
                </Button>

                <Button
                  size="sm"
                  onClick={() => setShowDirectDCDialog(true)}
                  className="h-9 sm:h-10 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
                >
                  <Truck className="h-4 w-4" />
                  Direct DC
                </Button>
              </div>
            </div>
          </div>

          {/* Pagination - Top */}
          <div className="mb-3">
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              totalItems={totalItems}
              pageSizeOptions={[10, 25, 50, 100]}
              itemCount={paginatedRequests.length}
            />
          </div>

          {/* Requests Display */}
          {filteredRequestGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-3">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">No requests found</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {searchQuery
                        ? "Try adjusting your search criteria"
                        : "No requests found with current status filter"
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : viewMode === "table" ? (
            <RequestsTable
              requests={paginatedRequests as any}
              viewMode="table"
              onViewDetails={setSelectedRequestId}
              onOpenCC={(requestId, allIds) => {
                setCCRequestId(requestId);
                setCCRequestIds(allIds ?? [requestId]);
              }}
              onDirectPO={handleDirectPO}
              onDirectDelivery={handleDirectDelivery}
              onCheck={handleCheck}
              onCreatePO={handleCreatePO}
              onCreateBulkPO={handleCreateBulkPO}
              onMoveToCC={handleMoveToCC}
              onConfirmDelivery={setShowConfirmDelivery}
              onViewPDF={(poNumber, requestId) => { setPdfPreviewPoNumber(poNumber); setPdfPreviewRequestId(requestId); }}
              showCreator={true}
            />
          ) : (
            <div className="space-y-8">
              {paginatedGroups.map((group) => {
                const { requestNumber, items, firstItem } = group;
                const hasMultipleItems = items.length > 1;

                // Determine overall status for the group
                const allItemsHaveSameStatus = items.length > 0
                  ? items.every((item) => item.status === items[0].status)
                  : true;

                const overallStatus = allItemsHaveSameStatus ? items[0].status : "partially_processed";
                const statusInfo = statusConfig[overallStatus] || { label: overallStatus, variant: "outline", icon: FileText, color: "gray" };

                // Count urgent items
                const urgentCount = items.filter((item) => item.isUrgent && item.status !== "direct_po" && item.directAction !== "po").length;

                return (
                  <PurchaseRequestGroupCard
                    key={requestNumber}
                    requestNumber={requestNumber}
                    items={items as any}
                    firstItem={firstItem as any}
                    statusInfo={statusInfo}
                    hasMultipleItems={hasMultipleItems}
                    urgentCount={urgentCount}
                    onViewDetails={setSelectedRequestId}
                    onOpenCC={(requestId, allIds) => {
                      setCCRequestId(requestId);
                      setCCRequestIds(allIds ?? [requestId]);
                    }}
                    onSiteClick={setSelectedSiteId}
                    onItemClick={setSelectedItemName}
                    canEditVendor={true}
                    onDirectPO={handleDirectPO}
                    onDirectDelivery={handleDirectDelivery}
                    onMoveToCC={handleMoveToCC}
                    onCheck={handleCheck}
                    onCreatePO={handleCreatePO}
                    onCreateBulkPO={handleCreateBulkPO}
                    onViewPDF={(poNumber, requestId) => { setPdfPreviewPoNumber(poNumber); setPdfPreviewRequestId(requestId); }}
                  />
                );
              })}
            </div>
          )}

          {/* Pagination - Bottom */}
          <div className="mt-4 border-t pt-4">
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              totalItems={totalItems}
              pageSizeOptions={[10, 25, 50, 100]}
              itemCount={paginatedRequests.length}
            />
          </div>
        </div>
      )}

      {/* Dialogs */}
      <RequestDetailsDialog
        open={!!selectedRequestId}
        onOpenChange={(open) => { if (!open) setSelectedRequestId(null); }}
        requestId={selectedRequestId}
        onCheck={handleCheck}
        onCreatePO={handleCreateBulkPO}
        onOpenCC={(requestId, allIds) => {
          setCCRequestId(requestId);
          setCCRequestIds(allIds ?? [requestId]);
        }}
      />

      {ccRequestId && (
        <CostComparisonDialog
          open={!!ccRequestId}
          onOpenChange={(open) => { if (!open) { setCCRequestId(null); setCCRequestIds([]); } }}
          requestId={ccRequestId}
          requestIds={ccRequestIds.length > 1 ? ccRequestIds : undefined}
        />
      )}

      {checkRequestId && (
        <CheckDialog
          open={!!checkRequestId}
          onOpenChange={(open) => !open && setCheckRequestId(null)}
          requestId={checkRequestId}
        />
      )}

      <ConfirmDeliveryDialog
        open={!!showConfirmDelivery}
        onOpenChange={(open) => !open && setShowConfirmDelivery(null)}
        requestId={showConfirmDelivery}
      />

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

      <DirectPODialog
        open={showDirectPODialog}
        onOpenChange={(open) => {
          setShowDirectPODialog(open);
          if (!open) setDirectPOInitialData(null);
        }}
        initialData={directPOInitialData}
        mode={directPOMode}
      />

      <PDFPreviewDialog
        open={!!pdfPreviewPoNumber}
        onOpenChange={(open) => { if (!open) { setPdfPreviewPoNumber(null); setPdfPreviewRequestId(null); } }}
        poNumber={pdfPreviewPoNumber}
        requestId={pdfPreviewRequestId}
      />

      {/* RFQ Dialog */}
      <DirectCCSetupDialog
        open={showDirectCCDialog}
        onOpenChange={setShowDirectCCDialog}
      />

      {/* Direct DC Dialog */}
      <DirectDeliveryDialog
        open={showDirectDCDialog}
        onOpenChange={setShowDirectDCDialog}
      />
    </>
  );
}
