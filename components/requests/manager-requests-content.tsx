"use client";

/**
 * Manager Requests Content Component
 *
 * Client component for manager requests page with cost comparison support.
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSearchParams, useRouter } from "next/navigation";
import { RequestsTable } from "@/components/requests/requests-table";
import { RequestDetailsDialog } from "@/components/requests/request-details-dialog";
import { CostComparisonDialog } from "@/components/purchase/cost-comparison-dialog";
import { CheckDialog } from "@/components/purchase/check-dialog";
import { useViewMode } from "@/hooks/use-view-mode";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Filter, LayoutGrid, Table as TableIcon, Check, Package, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PaginationControls } from "@/components/ui/pagination-controls";
import type { Id } from "@/convex/_generated/dataModel";

import { PDFPreviewDialog } from "@/components/purchase/pdf-preview-dialog";
import { POSelectionDialog } from "@/components/purchase/po-selection-dialog";
import { PendingPODialog } from "@/components/purchase/pending-po-dialog";
import { DirectPODialog, type DirectPOInitialData } from "@/components/purchase/direct-po-dialog";
import { Zap } from "lucide-react";

type SortOption = "newest" | "oldest" | "items_desc" | "items_asc";

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

export function ManagerRequestsContent() {
    const [selectedRequestId, setSelectedRequestId] = useState<Id<"requests"> | null>(null);
    const [ccRequestId, setCCRequestId] = useState<Id<"requests"> | null>(null);
    const [checkRequestId, setCheckRequestId] = useState<Id<"requests"> | null>(null);
    const [ccRequestIds, setCCRequestIds] = useState<Id<"requests">[] | undefined>(undefined); // For batch CC viewing
    const [pdfPreviewPoNumber, setPdfPreviewPoNumber] = useState<string | null>(null);
    const [pdfRequestNumber, setPdfRequestNumber] = useState<string | null>(null);

    const searchParams = useSearchParams();
    const router = useRouter();

    // Read query params from URL if present
    useEffect(() => {
        if (!searchParams) return;
        
        const reqId = searchParams.get("requestId");
        const status = searchParams.get("status");
        const workF = searchParams.get("work_filter");
        const showPendingPO = searchParams.get("show_pending_po");
        
        let changed = false;
        const newParams = new URLSearchParams(searchParams.toString());
        
        if (reqId) {
            setSelectedRequestId(reqId as Id<"requests">);
            newParams.delete("requestId");
            changed = true;
        }
        if (status) {
            setStatusFilter(status.split(","));
            newParams.delete("status");
            changed = true;
        }
        if (workF) {
            setWorkFilter(workF);
            newParams.delete("work_filter");
            changed = true;
        }
        if (showPendingPO === "true") {
            setShowPendingPODialog(true);
            newParams.delete("show_pending_po");
            changed = true;
        }
        
        if (changed) {
            router.replace(`?${newParams.toString()}`);
        }
    }, [searchParams, router]);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [workFilter, setWorkFilter] = useState<string>("work_pending");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [inventoryFilter, setInventoryFilter] = useState<string>("all");
    const [sortBy, setSortBy] = useState<SortOption>("newest");
    const { viewMode, toggleViewMode } = useViewMode("manager-requests-view-mode");
    const [showPendingPODialog, setShowPendingPODialog] = useState(false);
    const [showDirectPODialog, setShowDirectPODialog] = useState(false);
    const [directPOMode, setDirectPOMode] = useState<"standard" | "direct">("standard");
    const [directPOInitialData, setDirectPOInitialData] = useState<DirectPOInitialData | null>(null);
    const [pdfPreviewRequestId, setPdfPreviewRequestId] = useState<string | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    /* Manager View: Shows comprehensive status breakdown */
    const allRequests = useQuery(api.requests.getAllRequests);

    // Collect all unique item names from requests to fetch inventory
    const uniqueItemNames = useMemo(() => {
        if (!allRequests) return [];
        const names = new Set<string>();
        allRequests.forEach((req) => names.add(req.itemName));
        return Array.from(names);
    }, [allRequests]);

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

    // Filter requests based on category, status, search query, and inventory status
    const filteredRequests = useMemo(() => {
        if (!allRequests) return [];

        return allRequests.filter((request) => {
            // Work Filter (Inbox vs All)
            if (workFilter === "work_pending") {
                // Detail Review: 
                // 1. General: Pending (Inbox) + CC Pending (Purchase Review)
                // 2. Site Engineer Context: Strictly "Pending" (Initial Approval) - user request
                const validStatuses = categoryFilter === "site_engineer"
                    ? ["pending"]
                    : ["pending", "cc_pending", "sign_pending", "sign_rejected"];

                if (!validStatuses.includes(request.status)) {
                    return false;
                }
            }

            // Category filter (Source/Phase based)
            if (categoryFilter !== "all") {
                let matchesCategory = false;
                switch (categoryFilter) {
                    case "site_engineer":
                        // Incoming from Site Engineer (All statuses)
                        matchesCategory = request.creator?.role === "site_engineer";
                        break;
                    case "purchases":
                        // Purchase Phase: Approved by Manager (Ready for CC), Incoming from Purchase (CC Pending),
                        // or Post-Purchase processing (Ready for PO, Delivered, etc.) OR Created by Purchase Officer
                        matchesCategory = request.creator?.role === "purchase_officer" ||
                            ["ready_for_cc", "cc_pending", "cc_approved", "cc_rejected", "ready_for_po", "delivery_stage", "delivered", "partially_processed", "sign_pending", "sign_rejected"].includes(request.status);
                        break;
                }
                if (!matchesCategory) {
                    return false;
                }
            }

            // Detailed Status filter (Multi-select)
            if (statusFilter.length > 0) {
                if (!statusFilter.includes(request.status)) {
                    return false;
                }
            }

            // Inventory Status Filter
            if (inventoryFilter !== "all") {
                if (!inventoryStatus) return false; // If loading, maybe show nothing or all? Safe to return false if strict
                const status = inventoryStatus[request.itemName];
                if (!status) return false;

                if (inventoryFilter === "new_item") {
                    if (status.status !== "new_item") return false;
                } else if (inventoryFilter === "out_of_stock") {
                    // Explicit out of stock status or 0 stock (and not new item)
                    const isOutOfStock = status.status === "out_of_stock" || (status.status !== "new_item" && (status.centralStock || 0) <= 0);
                    if (!isOutOfStock) return false;
                } else if (inventoryFilter === "partially_stocked") {
                    // Has stock but less than requested
                    const stock = status.centralStock || 0;
                    const isPartial = status.status !== "new_item" && stock > 0 && stock < request.quantity;
                    if (!isPartial) return false;
                } else if (inventoryFilter === "in_stock") {
                    // Has sufficient stock
                    const stock = status.centralStock || 0;
                    const isSufficient = status.status !== "new_item" && stock >= request.quantity;
                    if (!isSufficient) return false;
                }
            }

            // Search filter
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase().trim();
                const matchesRequestNumber = request.requestNumber.toLowerCase().includes(query);
                const matchesItemName = request.itemName.toLowerCase().includes(query);
                const matchesSiteName = request.site?.name.toLowerCase().includes(query);
                const matchesCreatorName = request.creator?.fullName.toLowerCase().includes(query);
                const matchesDescription = request.description?.toLowerCase().includes(query);

                return matchesRequestNumber || matchesItemName || matchesSiteName || matchesCreatorName || matchesDescription;
            }

            return true;
        });
    }, [allRequests, searchQuery, workFilter, categoryFilter, statusFilter, inventoryFilter, inventoryStatus]);

    // Group and Sort Logic for Pagination
    const groupedAndSortedRequests = useMemo(() => {
        if (!filteredRequests) return [];

        // Group by requestNumber
        const groups = new Map<string, any[]>();
        filteredRequests.forEach((req) => {
            const group = groups.get(req.requestNumber) || [];
            group.push(req);
            groups.set(req.requestNumber, group);
        });

        const sortedGroups = Array.from(groups.entries()).map(([requestNumber, items]) => ({
            requestNumber,
            items,
            latestUpdate: Math.max(...items.map(i => i.updatedAt)),
            createdAt: Math.min(...items.map(i => i.createdAt)),
            itemCount: items.length
        }));

        // Sort groups
        sortedGroups.sort((a, b) => {
            switch (sortBy) {
                case "newest":
                    return b.latestUpdate - a.latestUpdate;
                case "oldest":
                    return a.latestUpdate - b.latestUpdate;
                case "items_desc":
                    return b.itemCount - a.itemCount;
                case "items_asc":
                    return a.itemCount - b.itemCount;
                default:
                    return 0;
            }
        });

        return sortedGroups;
    }, [filteredRequests, sortBy]);

    // Flatten paginated groups back to items for RequestsTable
    const paginatedItems = useMemo(() => {
        const totalGroups = groupedAndSortedRequests.length;
        const totalPages = Math.ceil(totalGroups / pageSize);

        // Ensure current page is valid
        const validPage = Math.min(currentPage, Math.max(1, totalPages));
        if (validPage !== currentPage && totalGroups > 0) {
            setCurrentPage(validPage);
        }

        const startIndex = (validPage - 1) * pageSize;
        const pageGroups = groupedAndSortedRequests.slice(startIndex, startIndex + pageSize);

        // Flatten
        return pageGroups.flatMap(g => g.items);
    }, [groupedAndSortedRequests, currentPage, pageSize]);

    // --- Smart Counts Logic ---

    // 1. Available requests for Work Filter (Filtered by Category & Status)
    const requestsForWorkCounts = useMemo(() => {
        if (!allRequests) return [];
        return allRequests.filter(req => {
            // Apply Category Filter
            if (categoryFilter !== "all") {
                if (categoryFilter === "site_engineer" && req.creator?.role !== "site_engineer") return false;
                if (categoryFilter === "purchases" && !(req.creator?.role === "purchase_officer" || ["ready_for_cc", "cc_pending", "cc_approved", "cc_rejected", "ready_for_po", "delivery_stage", "delivered", "partially_processed", "sign_pending", "sign_rejected"].includes(req.status))) return false;
            }
            // Apply Status Filter
            if (statusFilter.length > 0 && !statusFilter.includes(req.status)) return false;
            // Apply Search
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase().trim();
                return req.requestNumber.toLowerCase().includes(query) ||
                    req.itemName.toLowerCase().includes(query) ||
                    req.creator?.fullName.toLowerCase().includes(query);
            }
            return true;
        });
    }, [allRequests, categoryFilter, statusFilter, searchQuery]);

    const workCounts = useMemo(() => {
        return {
            work_pending: requestsForWorkCounts.filter(r => {
                // If Site Engineer category is active, Detail Review only implies 'pending'
                if (categoryFilter === "site_engineer") return r.status === "pending";
                return ["pending", "cc_pending", "sign_pending", "sign_rejected"].includes(r.status);
            }).length
        };
    }, [requestsForWorkCounts, categoryFilter]);

    // 2. Available requests for Category Filter (Filtered by Work & Status)
    const requestsForCategoryCounts = useMemo(() => {
        if (!allRequests) return [];
        return allRequests.filter(req => {
            // Apply Work Filter (Base logic, refined in counts)
            if (workFilter === "work_pending") {
                // We allow broader here, and filter strictly in the count step if needed
                if (!["pending", "cc_pending", "sign_pending", "sign_rejected"].includes(req.status)) return false;
            }
            // Apply Status Filter
            if (statusFilter.length > 0 && !statusFilter.includes(req.status)) return false;
            // Apply Search
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase().trim();
                return req.requestNumber.toLowerCase().includes(query) ||
                    req.itemName.toLowerCase().includes(query) ||
                    req.creator?.fullName.toLowerCase().includes(query);
            }
            return true;
        });
    }, [allRequests, workFilter, statusFilter, searchQuery]);

    const categoryCounts = useMemo(() => {
        const siteEngReqs = requestsForCategoryCounts.filter(r => r.creator?.role === "site_engineer");
        // If Detail Review is active, Site Engineer count is strictly 'pending'
        const siteEngCount = workFilter === "work_pending"
            ? siteEngReqs.filter(r => r.status === "pending").length
            : siteEngReqs.length;

        const purchasesReqs = requestsForCategoryCounts.filter(r => r.creator?.role === "purchase_officer" || ["ready_for_cc", "cc_pending", "cc_approved", "cc_rejected", "ready_for_po", "delivery_stage", "delivered", "partially_processed", "sign_pending", "sign_rejected"].includes(r.status));

        return {
            site_engineer: siteEngCount,
            purchases: purchasesReqs.length
        };
    }, [requestsForCategoryCounts, workFilter]);

    // 3. Available requests for Status Filter (Filtered by Work & Category)
    const requestsForStatusCounts = useMemo(() => {
        if (!allRequests) return [];
        return allRequests.filter(req => {
            // Apply Work Filter
            if (workFilter === "work_pending" && !["pending", "cc_pending", "sign_pending", "sign_rejected"].includes(req.status)) return false;
            // Apply Category Filter
            if (categoryFilter !== "all") {
                if (categoryFilter === "site_engineer" && req.creator?.role !== "site_engineer") return false;
                if (categoryFilter === "purchases" && !(req.creator?.role === "purchase_officer" || ["ready_for_cc", "cc_pending", "cc_approved", "cc_rejected", "ready_for_po", "delivery_stage", "delivered", "partially_processed", "sign_pending", "sign_rejected"].includes(req.status))) return false;
            }
            // Apply Search
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase().trim();
                return req.requestNumber.toLowerCase().includes(query) ||
                    req.itemName.toLowerCase().includes(query) ||
                    req.creator?.fullName.toLowerCase().includes(query);
            }
            return true;
        });
    }, [allRequests, workFilter, categoryFilter, searchQuery]);

    // Helper to get count for a specific status from the smart list
    const getSmartStatusCount = (status: string) => {
        return requestsForStatusCounts.filter(r => r.status === status).length;
    };

    // Individual status options for detailed filtering with colors
    // Individual status options for detailed filtering with colors
    const detailedStatusOptions = [
        { value: "draft", label: "Draft", count: getSmartStatusCount("draft"), color: "text-slate-500" },
        { value: "pending", label: "Pending", count: getSmartStatusCount("pending"), color: "text-amber-600" },
        { value: "rejected", label: "Rejected", count: getSmartStatusCount("rejected"), color: "text-red-600" },
        { value: "recheck", label: "Recheck", count: getSmartStatusCount("recheck"), color: "text-indigo-600" },
        { value: "ready_for_cc", label: "Ready for CC", count: getSmartStatusCount("ready_for_cc"), color: "text-blue-600" },
        { value: "cc_pending", label: "CC Pending", count: getSmartStatusCount("cc_pending"), color: "text-purple-600" },
        { value: "cc_rejected", label: "CC Rejected", count: getSmartStatusCount("cc_rejected"), color: "text-red-500" },
        { value: "ready_for_po", label: "Ready for PO", count: getSmartStatusCount("ready_for_po"), color: "text-teal-600" },
        { value: "sign_pending", label: "Sign Pending", count: getSmartStatusCount("sign_pending"), color: "text-amber-600" },
        { value: "sign_rejected", label: "Sign Rejected", count: getSmartStatusCount("sign_rejected"), color: "text-red-600" },
        { value: "pending_po", label: "Pending PO", count: getSmartStatusCount("pending_po"), color: "text-orange-600" },
        { value: "ready_for_delivery", label: "Ready for Delivery", count: getSmartStatusCount("ready_for_delivery"), color: "text-emerald-600" },
        { value: "out_for_delivery", label: "Out for Delivery", count: getSmartStatusCount("out_for_delivery"), color: "text-orange-600" },
        { value: "delivered", label: "Delivered", count: getSmartStatusCount("delivered"), color: "text-sky-600" },
    ];

    return (
        <>
            {!showPendingPODialog && (
                <div className="space-y-6">
                    {/* Search and Filters */}
                    {/* Enhanced Toolbar */}
                    <div className="flex flex-col gap-3 bg-card p-4 rounded-xl border border-border shadow-sm">
                        {/* Row 1: Search and View Mode */}
                        <div className="flex items-center gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by request #, item, site, or creator..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 h-10 bg-muted/30 border-muted-foreground/20 focus-visible:ring-primary/20 transition-all font-medium w-full"
                                />
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={toggleViewMode}
                                className="h-10 w-10 flex-shrink-0 bg-muted/30 border-muted-foreground/20 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all"
                            >
                                {viewMode === "card" ? <TableIcon className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
                            </Button>
                        </div>

                        {/* Row 2: Primary Filters */}
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                            <Select value={workFilter} onValueChange={setWorkFilter}>
                                <SelectTrigger className="h-9 w-[160px] bg-muted/20 border-muted-foreground/10">
                                    <SelectValue placeholder="All Requests" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Total: {allRequests?.length || 0}</SelectItem>
                                    <SelectItem value="work_pending">Pending Work ({workCounts.work_pending || 0})</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="h-9 w-[170px] bg-muted/20 border-muted-foreground/10">
                                    <Filter className="h-3.5 w-3.5 mr-2 opacity-70" />
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    <SelectItem value="site_engineer">Site Eng. ({categoryCounts.site_engineer || 0})</SelectItem>
                                    <SelectItem value="purchases">Purchases ({categoryCounts.purchases || 0})</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={inventoryFilter} onValueChange={setInventoryFilter}>
                                <SelectTrigger className="h-9 w-[160px] bg-muted/20 border-muted-foreground/10">
                                    <Package className="h-3.5 w-3.5 mr-2 opacity-70" />
                                    <SelectValue placeholder="Inventory" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Inventory</SelectItem>
                                    <SelectItem value="new_item">New Item</SelectItem>
                                    <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                                    <SelectItem value="partially_stocked">Partially</SelectItem>
                                    <SelectItem value="in_stock">In Stock</SelectItem>
                                </SelectContent>
                            </Select>

                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="h-9 min-w-[140px] justify-between px-3 text-left font-normal bg-muted/20 border-muted-foreground/10">
                                        <span className="truncate">
                                            {statusFilter.length === 0 ? "All Statuses" : `${statusFilter.length} Selected`}
                                        </span>
                                        <Filter className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Search status..." />
                                        <CommandList className="max-h-[600px]">
                                            <CommandEmpty>No status found.</CommandEmpty>
                                            <CommandGroup className="p-2">
                                                <CommandItem
                                                    onSelect={() => setStatusFilter([])}
                                                    className={cn(
                                                        "cursor-pointer py-2 px-3 mb-1 rounded-lg transition-all flex items-center gap-3 h-auto group",
                                                        statusFilter.length === 0
                                                            ? "bg-primary/10 text-primary"
                                                            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "h-2 w-2 rounded-full",
                                                        statusFilter.length === 0 ? "bg-primary" : "bg-muted-foreground/30"
                                                    )} />
                                                    <span className="font-bold text-sm flex-1">All Statuses</span>
                                                    {statusFilter.length === 0 && <Check className="h-4 w-4 text-primary" strokeWidth={3} />}
                                                </CommandItem>

                                                <Separator className="my-1.5 mx-1 opacity-50" />

                                                {detailedStatusOptions.map((option) => {
                                                    const isSelected = statusFilter.includes(option.value);
                                                    return (
                                                        <CommandItem
                                                            key={option.value}
                                                            onSelect={() => {
                                                                if (isSelected) setStatusFilter(statusFilter.filter(s => s !== option.value));
                                                                else setStatusFilter([...statusFilter, option.value]);
                                                            }}
                                                            className={cn(
                                                                "cursor-pointer py-2 px-3 mb-1 rounded-lg transition-all flex items-center gap-3 h-auto group",
                                                                isSelected
                                                                    ? "bg-primary/5 text-primary"
                                                                    : "hover:bg-muted/30 text-muted-foreground hover:text-foreground"
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                "h-2 w-2 rounded-full shrink-0",
                                                                isSelected ? "bg-primary" : "bg-muted-foreground/20"
                                                            )} />
                                                            <span className={cn("flex-1 font-bold text-sm truncate", option.color)}>{option.label}</span>
                                                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
                                                                {option.count}
                                                            </span>
                                                            {isSelected && <Check className="h-4 w-4 text-primary shrink-0" strokeWidth={3} />}
                                                        </CommandItem>
                                                    );
                                                })}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>

                            <Button
                                variant={showPendingPODialog ? "default" : "outline"}
                                onClick={() => {
                                    setShowPendingPODialog(true);
                                }}
                                className={cn(
                                    "h-9 transition-all",
                                    showPendingPODialog
                                        ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
                                        : "border-amber-500/50 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-900/20"
                                )}
                            >
                                <Clock className="h-3.5 w-3.5 mr-2" />
                                Pending PO ({getSmartStatusCount("pending_po")})
                            </Button>

                            <div className="ml-auto flex items-center gap-2">
                                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                                    <SelectTrigger className="h-9 w-[150px] bg-muted/20 border-muted-foreground/10">
                                        <SelectValue placeholder="Sort" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="newest">Newest First</SelectItem>
                                        <SelectItem value="oldest">Oldest First</SelectItem>
                                        <SelectItem value="items_desc">Most Items</SelectItem>
                                        <SelectItem value="items_asc">Fewest Items</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                        </div>
                    </div>

                    {/* Pagination Controls - Top */}
                    <div className="bg-card p-2 rounded-xl border border-border shadow-sm">
                        <PaginationControls
                            currentPage={currentPage}
                            totalPages={Math.ceil(groupedAndSortedRequests.length / pageSize)}
                            onPageChange={setCurrentPage}
                            pageSize={pageSize}
                            onPageSizeChange={setPageSize}
                            totalItems={groupedAndSortedRequests.length}
                            pageSizeOptions={[10, 25, 50, 100]}
                            itemCount={groupedAndSortedRequests.length > 0 ? Math.min(pageSize, groupedAndSortedRequests.length - (currentPage - 1) * pageSize) : 0}
                            className="py-0 border-none shadow-none"
                        />
                    </div>

                    {/* Main Content */}
                    <RequestsTable
                        requests={paginatedItems as any}
                        onViewDetails={(requestId) => setSelectedRequestId(requestId)}
                        onOpenCC={(requestId, requestIds) => {
                            setCCRequestId(requestId);
                            setCCRequestIds(requestIds);
                        }}
                        showCreator={true}
                        viewMode={viewMode}
                        preciseStatuses={true}
                        hideStatusOnCard={true}
                        hideItemCountOnCard={true}
                        onViewPDF={(poNumber, requestId) => {
                            setPdfPreviewPoNumber(poNumber);
                            setPdfPreviewRequestId(requestId);
                        }}
                    />

                    {/* Pagination Controls - Bottom */}
                    {groupedAndSortedRequests.length > pageSize && (
                        <Card className="bg-card p-2 border-border shadow-sm">
                            <PaginationControls
                                currentPage={currentPage}
                                totalPages={Math.ceil(groupedAndSortedRequests.length / pageSize)}
                                onPageChange={setCurrentPage}
                                pageSize={pageSize}
                                onPageSizeChange={setPageSize}
                                totalItems={groupedAndSortedRequests.length}
                                pageSizeOptions={[10, 25, 50, 100]}
                                itemCount={groupedAndSortedRequests.length > 0 ? Math.min(pageSize, groupedAndSortedRequests.length - (currentPage - 1) * pageSize) : 0}
                                className="py-0 border-none shadow-none"
                            />
                        </Card>
                    )}
                </div>
            )}

            {/* ── Pending PO full-page view (replaces main table) ── */}
            {showPendingPODialog && (
                <div className="space-y-6">
                    <PendingPODialog
                        onBack={() => setShowPendingPODialog(false)}
                        onViewPO={(poNumber, requestId) => {
                            setPdfPreviewPoNumber(poNumber);
                            setPdfPreviewRequestId(requestId);
                        }}

                        requests={allRequests as any}
                    />
                </div>
            )}

            <DirectPODialog
                open={showDirectPODialog}
                onOpenChange={(open) => {
                    setShowDirectPODialog(open);
                    if (!open) setDirectPOInitialData(null);
                }}
                initialData={directPOInitialData}
                mode={directPOMode}
            />

            <RequestDetailsDialog
                open={!!selectedRequestId}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedRequestId(null);
                    }
                }}
                requestId={selectedRequestId}
                onCheck={(requestId) => setCheckRequestId(requestId)}
                onOpenCC={(requestId, requestIds) => {
                    setCCRequestId(requestId);
                    setCCRequestIds(requestIds);
                }}
            />

            <CostComparisonDialog
                open={!!ccRequestId}
                onOpenChange={(open) => {
                    if (!open) {
                        setCCRequestId(null);
                        setCCRequestIds(undefined);
                    }
                }}
                requestId={ccRequestId!}
                requestIds={ccRequestIds}
            />

            {checkRequestId && (
                <CheckDialog
                    open={!!checkRequestId}
                    onOpenChange={(open) => !open && setCheckRequestId(null)}
                    requestId={checkRequestId}
                />
            )}

            <POSelectionDialog
                requestNumber={pdfRequestNumber}
                onOpenChange={(open) => !open && setPdfRequestNumber(null)}
                onSelectPO={(poNumber) => {
                    setPdfRequestNumber(null);
                    setPdfPreviewPoNumber(poNumber);
                }}
            />

            <PDFPreviewDialog
                open={!!pdfPreviewPoNumber}
                onOpenChange={(open) => {
                    if (!open) {
                        setPdfPreviewPoNumber(null);
                        setPdfPreviewRequestId(null);
                    }
                }}
                poNumber={pdfPreviewPoNumber}
                requestId={pdfPreviewRequestId}
            />
        </>
    );
}

