"use client";

/**
 * Pending PO View — mirrors the main requests page layout exactly.
 * Layout: Back btn → Search → View Toggle → Filter → Create PO → Pagination → Card/Table → Pagination
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { BulkDeliveryDialog } from "@/components/purchase/bulk-delivery-dialog";
import {
    Clock,
    Building2,
    Package,
    Hash,
    CalendarDays,
    Eye,
    Zap,
    Search,
    X,
    RefreshCw,
    MessageSquare,
    ChevronDown,
    CalendarCheck,
    Layers,
    ArrowLeft,
    MapPin,
    ChevronRight,
    Calendar as CalendarIcon,
    LayoutGrid,
    Filter,
    Check,
    Table2,
    IndianRupee,
    CalendarRange,
    Download,
    CheckCircle,
    Phone,
    Mail,
    Send,
    MessageCircle,
    Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useViewMode } from "@/hooks/use-view-mode";
import { EditableTalk } from "@/components/purchase/editable-talk";

/* ─────────────── helpers ─────────────── */
function fmtDate(ts: number | undefined | null): string {
    if (!ts) return "—";
    return format(new Date(ts), "dd MMM yy");
}

function getDaysLeft(ts: number | undefined | null): number | null {
    if (!ts) return null;
    return Math.ceil((ts - Date.now()) / 86400000);
}

function ExpiryPill({ ts }: { ts?: number | null }) {
    const d = getDaysLeft(ts);
    if (d === null) return null;
    if (d < 0) return <span className="block text-[10px] font-medium text-red-500">• {Math.abs(d)}d overdue</span>;
    if (d === 0) return <span className="block text-[10px] font-medium text-orange-500">• Due today</span>;
    if (d <= 7) return <span className="block text-[10px] font-medium text-orange-400">• {d}d left</span>;
    return <span className="block text-[10px] font-medium text-emerald-500">• {d}d left</span>;
}

function EditableDate({
    value,
    onChange,
    placeholder,
    icon: Icon,
}: {
    value: number | undefined | null;
    onChange: (ts: number) => void;
    placeholder: string;
    icon?: React.ElementType;
}) {
    const dateStr = value ? new Date(value).toISOString().split("T")[0] : "";
    const Ic = Icon ?? CalendarIcon;
    return (
        <label className="group relative inline-flex items-center gap-1.5 cursor-pointer select-none">
            <Ic className="h-3 w-3 text-muted-foreground group-hover:text-blue-400 transition-colors shrink-0" />
            <span className={cn("text-xs font-medium transition-colors group-hover:text-blue-400", value ? "text-foreground" : "text-muted-foreground italic")}>
                {value ? fmtDate(value) : placeholder}
            </span>
            <input
                type="date"
                value={dateStr}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    if (e.target.value) onChange(new Date(e.target.value).getTime());
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
        </label>
    );
}

function formatCurrency(amount: number) {
    if (!amount) return "—";
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
}



/* ─────────────── Props ─────────────── */
interface PendingPOViewProps {
    onBack: () => void;
    onViewPO: (poNumber: string, requestId: string) => void;
    onCreateDirectPO?: () => void;
    requests?: any[];
}

/* ─────────────── Main Component ─────────────── */
export function PendingPODialog({ onBack, onViewPO, onCreateDirectPO, requests: propRequests }: PendingPOViewProps) {
    const fetchedRequests = useQuery(api.requests.getPurchaseRequestsByStatus, propRequests ? "skip" : {});
    const allRequests = propRequests || fetchedRequests;
    const vendors = useQuery(api.vendors.getAllVendors);
    const allPOs = useQuery(api.purchaseOrders.getAllPurchaseOrders);
    const updateLastTalkDate = useMutation(api.requests.updateLastTalkDate);
    const updateLastTalkText = useMutation(api.requests.updateLastTalkText);
    const updateCommittedDate = useMutation(api.requests.updateCommittedDate);
    const closePurchaseRequest = useMutation(api.requests.closePurchaseRequest);
    const reopenPurchaseRequest = useMutation(api.requests.reopenPurchaseRequest);

    const [closeConfirmGroup, setCloseConfirmGroup] = useState<any | null>(null);
    const [reopenConfirmGroup, setReopenConfirmGroup] = useState<any | null>(null);
    const [closeNotes, setCloseNotes] = useState("");
    const [reopenNotes, setReopenNotes] = useState("");


    // Bulk delivery dialog state
    const [bulkDeliveryData, setBulkDeliveryData] = useState<{
        items: any[];
        vendorName: string;
        poNumber: string;
    } | null>(null);

    const { viewMode, toggleViewMode } = useViewMode();
    const [search, setSearch] = useState("");
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [filterSite, setFilterSite] = useState<string[]>([]);
    const [timeFilter, setTimeFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all"); // all, pending, unsigned, rejected

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        setIsHydrated(true);
        const saved = localStorage.getItem("pendingPOPageSize");
        if (saved) setPageSize(Number(saved));
    }, []);

    useEffect(() => {
        if (isHydrated) localStorage.setItem("pendingPOPageSize", pageSize.toString());
    }, [pageSize, isHydrated]);

    useEffect(() => { setCurrentPage(1); }, [search, filterSite.length]);

    /* PO expiry map: requestId → validTill */
    const poExpiryMap = useMemo(() => {
        const map = new Map<string, number>();
        if (!allPOs) return map;
        for (const po of allPOs) {
            if (po.requestId && po.validTill) {
                const existing = map.get(po.requestId as string);
                if (!existing || po.validTill > existing) map.set(po.requestId as string, po.validTill);
            }
        }
        return map;

    }, [allPOs]);

    /* Pending items */
    const pendingItems = useMemo(
        () => (allRequests ?? []).filter((r) => r.status === "pending_po" || r.status === "sign_pending" || r.status === "sign_rejected" || r.status === "po_rejected"),
        [allRequests]
    );

    /* Unique sites for filter */
    const allSites = useMemo(() => {
        const map = new Map<string, string>();
        pendingItems.forEach((r) => {
            if (r.site?._id && r.site?.name) map.set(r.site._id, r.site.name);
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [pendingItems]);

    /* Group by poNumber / requestNumber */
    const groups = useMemo(() => {
        const map = new Map<string, typeof pendingItems>();
        pendingItems.forEach((r) => {
            const key = r.poNumber ?? r.requestNumber;
            const arr = map.get(key) || [];
            arr.push(r);
            map.set(key, arr);
        });
        return Array.from(map.entries())
            .map(([key, items]) => {
                const poNumber = items[0]?.poNumber ?? null;
                let totalAmount = 0;

                // 1. Calculate from vendor quotes (preferred for pending PO items)
                items.forEach((item) => {
                    const quote = (item as any).vendorQuotes?.find((q: any) => q.vendorId === (item as any).selectedVendorId);
                    if (quote && quote.amount) {
                        totalAmount += quote.amount;
                    } else if (item.quantity && quote?.unitPrice) {
                        totalAmount += item.quantity * quote.unitPrice;
                    }
                });

                // 2. Fallback to extracting from allPOs if a PO number exists but no quotes amount
                if (totalAmount === 0 && poNumber && allPOs) {
                    const poRecords = allPOs.filter((p) => p.poNumber === poNumber);
                    totalAmount = poRecords.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
                }
                return {
                    key,
                    poNumber,
                    requestNumber: items[0]?.requestNumber ?? key,
                    items,
                    firstItem: items[0],
                    site: items[0]?.site,
                    totalAmount,
                };
            })
            .sort((a, b) => {
                const aT = Math.max(...a.items.map((i) => i.updatedAt ?? i.createdAt ?? 0));
                const bT = Math.max(...b.items.map((i) => i.updatedAt ?? i.createdAt ?? 0));
                return bT - aT;
            });
    }, [pendingItems, allPOs]);

    /* Filtered */
    const filtered = useMemo(() => {
        let result = groups;
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(
                (g) =>
                    g.poNumber?.toLowerCase().includes(q) ||
                    g.requestNumber?.toLowerCase().includes(q) ||
                    g.site?.name?.toLowerCase().includes(q) ||
                    g.items.some((i) => i.itemName.toLowerCase().includes(q))
            );
        }
        if (filterSite.length > 0) {
            result = result.filter((g) => filterSite.includes(g.site?._id ?? ""));
        }
        if (timeFilter !== "all") {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const nextDay = new Date(tomorrow);
            nextDay.setDate(nextDay.getDate() + 1);

            const lastWeek = new Date(today);
            lastWeek.setDate(lastWeek.getDate() - 7);

            const lastMonth = new Date(today);
            lastMonth.setMonth(lastMonth.getMonth() - 1);

            result = result.filter((g) => {
                const created = g.firstItem.createdAt;
                const poExpiry = poExpiryMap.get(g.firstItem._id as string);
                const committed = (g.firstItem as any)?.committedDate;
                const lastTalk = (g.firstItem as any)?.lastTalkDate;

                const matchesDate = (ts: number | undefined | null, start: Date, end: Date) => {
                    if (!ts) return false;
                    const d = new Date(ts);
                    return d >= start && d < end;
                };

                const matchesPastDate = (ts: number | undefined | null, start: Date) => {
                    if (!ts) return false;
                    const d = new Date(ts);
                    return d >= start;
                };

                if (timeFilter === "today") {
                    return matchesPastDate(created, today) || matchesDate(committed, today, tomorrow) || matchesDate(poExpiry, today, tomorrow) || matchesDate(lastTalk, today, tomorrow);
                }
                if (timeFilter === "tomorrow") {
                    return matchesDate(committed, tomorrow, nextDay) || matchesDate(poExpiry, tomorrow, nextDay) || matchesDate(lastTalk, tomorrow, nextDay);
                }
                if (timeFilter === "last_week") {
                    return matchesPastDate(created, lastWeek);
                }
                if (timeFilter === "last_month") {
                    return matchesPastDate(created, lastMonth);
                }
                return true;
            });
        }

        if (statusFilter !== "all") {
            result = result.filter((g) => {
                if (statusFilter === "pending") return g.firstItem.status === "pending_po";
                if (statusFilter === "unsigned") return g.firstItem.status === "sign_pending";
                if (statusFilter === "rejected") return g.firstItem.status === "sign_rejected";
                if (statusFilter === "closed") return g.firstItem.status === "po_rejected";
                return true;
            });
        }

        return result;
    }, [groups, search, filterSite, timeFilter, statusFilter, poExpiryMap]);

    /* Pagination */
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const toggleExpand = (key: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const handleSetLastTalk = async (requestId: Id<"requests">, ts: number | null) => {
        try {
            await updateLastTalkDate({ requestId, lastTalkDate: ts });
            toast.success("Last talk date updated");
        } catch {
            toast.error("Failed to update");
        }
    };

    const handleSetLastTalkText = async (requestId: Id<"requests">, text: string) => {
        try {
            await updateLastTalkText({ requestId, lastTalkText: text });
            toast.success("Last talk notes updated");
        } catch {
            toast.error("Failed to update notes");
        }
    };

    const handleSetCommitted = async (requestId: Id<"requests">, ts: number) => {
        try {
            await updateCommittedDate({ requestId, committedDate: ts });
            toast.success("Committed date updated");
        } catch {
            toast.error("Failed to update");
        }
    };

    const getVendorName = (item: any) =>
        vendors?.find((v) => v._id === item?.selectedVendorId)?.companyName ?? null;
    const getVendorContact = (item: any) =>
        vendors?.find((v) => v._id === item?.selectedVendorId)?.contactName ?? null;
    const getVendorFull = (item: any) =>
        vendors?.find((v) => v._id === item?.selectedVendorId) ?? null;

    /* ── Download XL ── */
    const handleDownloadXL = async () => {
        try {
            // Dynamically import xlsx to avoid SSR issues
            const XLSX = await import("xlsx");

            const rows = filtered.map((group) => {
                const vendorName = getVendorName(group.firstItem);
                const vendorContact = getVendorContact(group.firstItem);
                const poExpiry = poExpiryMap.get(group.firstItem._id as string);
                const lastTalkDate = (group.firstItem as any)?.lastTalkDate;
                const lastTalkText = (group.firstItem as any)?.lastTalkText;
                const committedDate = (group.firstItem as any)?.committedDate;

                return {
                    "PO Number": group.poNumber ? `#${group.poNumber}` : "—",
                    "Request Number": group.requestNumber,
                    "Vendor": vendorName || "—",
                    "Vendor Contact": vendorContact || "—",
                    "Site": group.site?.name || "—",
                    "Order Date": fmtDate(group.firstItem.createdAt),
                    "Items Count": group.items.length,
                    "Items": group.items.map(i => i.itemName).join(", "),
                    "Total Amount (INR)": group.totalAmount || 0,
                    "Last Talk Date": fmtDate(lastTalkDate),
                    "Last Talk Notes": lastTalkText || "",
                    "Committed Date": fmtDate(committedDate),
                    "PO Expiry": fmtDate(poExpiry),
                };
            });

            const ws = XLSX.utils.json_to_sheet(rows);

            // Auto-size columns
            const colWidths = Object.keys(rows[0] || {}).map(key => ({
                wch: Math.max(key.length, ...rows.map(r => String((r as any)[key] || "").length)) + 2
            }));
            ws["!cols"] = colWidths;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Pending POs");

            const today = new Date();
            const dateStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
            XLSX.writeFile(wb, `Pending_POs_${dateStr}.xlsx`);
            toast.success(`Downloaded ${rows.length} PO group(s) as Excel`);
        } catch (err) {
            console.error("XL download failed:", err);
            toast.error("Failed to download Excel");
        }
    };

    /* ── Open Available (Bulk Delivery) Dialog ── */
    const handleOpenAvailable = (group: any) => {
        const vName = getVendorName(group.firstItem) || group.firstItem?.site?.name || "Unknown Vendor";
        const bulkItems = group.items.map((item: any) => ({
            requestId: item._id,
            itemName: item.itemName,
            requestedQuantity: item.quantity,
            unit: item.unit,
            poQuantity: item.quantity,
            itemOrder: item.itemOrder,
            alreadyDelivered: 0,
            originalRequested: item.quantity,
        }));
        setBulkDeliveryData({
            items: bulkItems,
            vendorName: vName,
            poNumber: group.poNumber || group.requestNumber,
        });
    };

    /* ── Send Actions ── */
    const handleShareWhatsApp = (group: any) => {
        const vendorPhone = getVendorFull(group.firstItem)?.phone || "";
        const vendorName = getVendorName(group.firstItem) || "";
        const date = fmtDate(group.firstItem.createdAt);
        const total = group.totalAmount || 0;
        const itemsCount = group.items.length;
        const firstItemName = group.firstItem?.itemName || "Items";
        const itemsSummary = itemsCount > 1 ? `${firstItemName} + ${itemsCount - 1} more` : firstItemName;

        const message = `*Purchase Order*\n\nPO No: *${group.poNumber}*\nDate: ${date}\n${vendorName ? `Vendor: ${vendorName}\n` : ''}Items: ${itemsSummary}\nAmount: *Rs. ${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}*\n\nKindly confirm receipt and expected delivery date.\n\nRegards,\nNotion Electronica Pvt. Ltd.`;

        const whatsappUrl = vendorPhone
            ? `https://wa.me/${vendorPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`
            : `https://wa.me/?text=${encodeURIComponent(message)}`;

        window.open(whatsappUrl, '_blank');
        toast.success("Opening WhatsApp...");
    };

    const handleShareEmail = (group: any) => {
        const vendorEmail = getVendorFull(group.firstItem)?.email || "";
        if (!vendorEmail) {
            toast.error("Vendor email not found");
            return;
        }
        toast.success("Opening Mail Client...");
        const subject = encodeURIComponent(`Purchase Order #${group.poNumber}`);
        const body = encodeURIComponent(`Please find the details for PO #${group.poNumber} attached.\n\nRegards,\nNotion Electronica Pvt. Ltd.`);
        window.open(`mailto:${vendorEmail}?subject=${subject}&body=${body}`);
    };

    /* ── Close PO ── */
    const handleConfirmClose = async () => {
        if (!closeConfirmGroup) return;
        const toastId = toast.loading("Closing PO...");
        try {
            const requestIds = closeConfirmGroup.items.map((i: any) => i._id);
            await Promise.all(requestIds.map((id: Id<"requests">) => closePurchaseRequest({ requestId: id, notes: closeNotes.trim() || undefined })));
            toast.success("PO closed successfully", { id: toastId });
            setCloseConfirmGroup(null);
            setCloseNotes("");
        } catch (err: any) {
            console.error("Failed to close PO:", err);
            toast.error(err.message || "Failed to close PO", { id: toastId });
        }
    };

    /* ── Reopen PO ── */
    const handleConfirmReopen = async () => {
        if (!reopenConfirmGroup) return;
        const toastId = toast.loading("Reopening PO...");
        try {
            const requestIds = reopenConfirmGroup.items.map((i: any) => i._id);
            await Promise.all(requestIds.map((id: Id<"requests">) => reopenPurchaseRequest({ requestId: id, notes: reopenNotes.trim() || undefined })));
            toast.success("PO reopened successfully", { id: toastId });
            setReopenConfirmGroup(null);
            setReopenNotes("");
        } catch (err: any) {
            console.error("Failed to reopen PO:", err);
            toast.error(err.message || "Failed to reopen PO", { id: toastId });
        }
    };

    /* ── Render ── */
    return (
        <div className="space-y-4">

            {/* ── Row 1: Search + View Toggle ── */}
            <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by PO number, item, or site..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={`pl-9 pr-9 h-9 sm:h-10 text-base w-full ${search.trim() ? "ring-2 ring-blue-500/50 border-blue-500" : ""}`}
                    />
                    {search && (
                        <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted">
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>

                <Button variant="outline" size="icon" onClick={toggleViewMode} className="h-9 sm:h-10 w-9 sm:w-10 flex-shrink-0" title={`Switch to ${viewMode === "card" ? "table" : "card"} view`}>
                    {viewMode === "card" ? <Table2 className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                </Button>
            </div>

            {/* ── Row 2: Filter + Create PO ── */}
            <div className="flex gap-2 items-center">
                {/* Time filter */}
                <div className="flex-1 sm:flex-none sm:w-[150px]">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-between h-9 sm:h-10">
                                {timeFilter === "all" ? "All Time" : timeFilter === "today" ? "Today" : timeFilter === "tomorrow" ? "Tomorrow" : timeFilter === "last_week" ? "Last 7 Days" : "Last 30 Days"}
                                <CalendarRange className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[180px] p-0" align="start">
                            <Command>
                                <CommandList>
                                    <CommandGroup>
                                        <CommandItem onSelect={() => setTimeFilter("all")} className="font-medium">
                                            <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border", timeFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "opacity-50 [&_svg]:invisible")}>
                                                <Check className="h-4 w-4" />
                                            </div>
                                            All Time
                                        </CommandItem>
                                        <CommandItem onSelect={() => setTimeFilter("today")}>
                                            <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border", timeFilter === "today" ? "bg-primary text-primary-foreground border-primary" : "opacity-50 [&_svg]:invisible")}>
                                                <Check className="h-4 w-4" />
                                            </div>
                                            Today
                                        </CommandItem>
                                        <CommandItem onSelect={() => setTimeFilter("tomorrow")}>
                                            <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border", timeFilter === "tomorrow" ? "bg-primary text-primary-foreground border-primary" : "opacity-50 [&_svg]:invisible")}>
                                                <Check className="h-4 w-4" />
                                            </div>
                                            Tomorrow
                                        </CommandItem>
                                        <CommandItem onSelect={() => setTimeFilter("last_week")}>
                                            <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border", timeFilter === "last_week" ? "bg-primary text-primary-foreground border-primary" : "opacity-50 [&_svg]:invisible")}>
                                                <Check className="h-4 w-4" />
                                            </div>
                                            Last 7 Days
                                        </CommandItem>
                                        <CommandItem onSelect={() => setTimeFilter("last_month")}>
                                            <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border", timeFilter === "last_month" ? "bg-primary text-primary-foreground border-primary" : "opacity-50 [&_svg]:invisible")}>
                                                <Check className="h-4 w-4" />
                                            </div>
                                            Last 30 Days
                                        </CommandItem>
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Status Filter */}
                <div className="flex-1 sm:flex-none sm:w-[150px]">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-between h-9 sm:h-10">
                                {statusFilter === "all" ? "All Status" : statusFilter === "unsigned" ? "Unsigned" : statusFilter === "rejected" ? "Rejected Sign" : "Signed PO"}
                                <Filter className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[180px] p-0" align="start">
                            <Command>
                                <CommandList>
                                    <CommandGroup>
                                        <CommandItem onSelect={() => setStatusFilter("all")} className="font-medium">
                                            <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border", statusFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "opacity-50 [&_svg]:invisible")}>
                                                <Check className="h-4 w-4" />
                                            </div>
                                            All Status
                                        </CommandItem>
                                        <CommandItem onSelect={() => setStatusFilter("unsigned")}>
                                            <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border", statusFilter === "unsigned" ? "bg-primary text-primary-foreground border-primary" : "opacity-50 [&_svg]:invisible")}>
                                                <Check className="h-4 w-4" />
                                            </div>
                                            Unsigned
                                        </CommandItem>
                                        <CommandItem onSelect={() => setStatusFilter("rejected")}>
                                            <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border", statusFilter === "rejected" ? "bg-primary text-primary-foreground border-primary" : "opacity-50 [&_svg]:invisible")}>
                                                <Check className="h-4 w-4" />
                                            </div>
                                            Rejected Sign
                                        </CommandItem>
                                        <CommandItem onSelect={() => setStatusFilter("pending")}>
                                            <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border", statusFilter === "pending" ? "bg-primary text-primary-foreground border-primary" : "opacity-50 [&_svg]:invisible")}>
                                                <Check className="h-4 w-4" />
                                            </div>
                                            Signed PO
                                        </CommandItem>
                                        <CommandItem onSelect={() => setStatusFilter("closed")}>
                                            <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border", statusFilter === "closed" ? "bg-primary text-primary-foreground border-primary" : "opacity-50 [&_svg]:invisible")}>
                                                <Check className="h-4 w-4" />
                                            </div>
                                            Closed
                                        </CommandItem>
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={onBack}
                    className="h-9 sm:h-10 gap-1.5 border-muted-foreground/30 text-muted-foreground hover:text-foreground shrink-0"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Requests
                </Button>

                {/* Right side: Create PO + Download XL */}
                <div className="flex items-center gap-2 ml-auto">
                    <Button
                        variant="outline"
                        onClick={handleDownloadXL}
                        className="h-9 sm:h-10 gap-1.5 border-emerald-500/50 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-500 dark:text-emerald-400 dark:border-emerald-500/40 dark:hover:bg-emerald-900/20"
                        title="Download all pending PO data as Excel"
                    >
                        <Download className="h-4 w-4" />
                        Download XL
                    </Button>
                    {onCreateDirectPO && (
                        <Button
                            onClick={onCreateDirectPO}
                            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 h-9 sm:h-10"
                        >
                            <Zap className="h-4 w-4 mr-2" />
                            Create Direct PO
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Loading ── */}
            {allRequests === undefined ? (
                <div className="flex items-center justify-center py-24">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                    <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center">
                        <Clock className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <div className="text-center">
                        <p className="font-semibold text-base">No pending POs</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {search || filterSite.length > 0 ? "Try adjusting your search or filter" : "All purchase orders have been placed"}
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    {/* ── Pagination Top ── */}
                    <div className="mb-3">
                        <PaginationControls
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                            pageSize={pageSize}
                            onPageSizeChange={setPageSize}
                            totalItems={totalItems}
                            pageSizeOptions={[10, 25, 50, 100]}
                            itemCount={paginated.length}
                        />
                    </div>

                    {/* ── Card View ── */}
                    {viewMode === "card" ? (
                        <div className="space-y-4">
                            {paginated.map((group) => {
                                const { key, poNumber, requestNumber, items, firstItem, site } = group;
                                const hasMultiple = items.length > 1;
                                const expanded = expandedGroups.has(key);
                                const totalQty = items.reduce((s, i) => s + i.quantity, 0);
                                const vendorName = getVendorName(firstItem);
                                const vendorContact = getVendorContact(firstItem);
                                const poExpiry = poExpiryMap.get(firstItem._id as string) ?? null;
                                const lastTalkDate = (firstItem as any)?.lastTalkDate ?? null;
                                const committedDate = (firstItem as any)?.committedDate ?? null;

                                const isClosed = firstItem.status === "po_rejected";

                                return (
                                    <div key={key} className={cn("rounded-xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden", isClosed ? "bg-red-50/30 border-red-100 dark:bg-red-950/10 dark:border-red-900/30 opacity-75" : "bg-card")}>
                                        {/* Card Header */}
                                        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/20">
                                            <div className="flex items-center gap-3">
                                                <div>
                                                    {poNumber ? (
                                                        <span className="font-bold text-base">#{poNumber}</span>
                                                    ) : (
                                                        <span className="text-sm text-muted-foreground italic">No PO #</span>
                                                    )}
                                                    <span className="text-xs text-muted-foreground ml-2">Req #{requestNumber}</span>
                                                </div>
                                                {firstItem.status === "sign_pending" && (
                                                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] px-2">Unsigned</Badge>
                                                )}
                                                {firstItem.status === "sign_rejected" && (
                                                    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-[10px] px-2">Rejected Sign</Badge>
                                                )}
                                                {firstItem.status === "pending_po" && (
                                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] px-2">Signed PO</Badge>
                                                )}
                                                {hasMultiple && (
                                                    <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px] px-2 gap-1">
                                                        <Layers className="h-3 w-3" />{items.length} items
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {/* View PO — show for all non-closed when PO exists */}
                                                {poNumber && !isClosed && (
                                                    <Button size="sm" variant="outline" onClick={() => onViewPO(poNumber, firstItem._id)} className="h-7 text-xs px-2.5 gap-1 border-blue-500/30 text-blue-500 hover:bg-blue-500/10 hover:border-blue-500">
                                                        <Eye className="h-3 w-3" /> View PO
                                                    </Button>
                                                )}
                                                {/* Available + Send — only for Signed PO */}
                                                {poNumber && firstItem.status === "pending_po" && (
                                                    <>
                                                        <Button size="sm" variant="outline" onClick={() => handleOpenAvailable(group)} className="h-7 text-xs px-2.5 gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:border-emerald-500">
                                                            <CheckCircle className="h-3 w-3" /> Available
                                                        </Button>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1 border-slate-500/30 text-slate-600 hover:bg-slate-500/10 hover:border-slate-500 dark:text-slate-400">
                                                                    <Send className="h-3 w-3" /> Send
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-40">
                                                                <DropdownMenuItem onClick={() => handleShareWhatsApp(group)} className="gap-2 cursor-pointer text-sm">
                                                                    <MessageCircle className="h-4 w-4 text-green-500" /> WhatsApp
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleShareEmail(group)} className="gap-2 cursor-pointer text-sm">
                                                                    <Mail className="h-4 w-4 text-blue-500" /> Email
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </>
                                                )}
                                                {/* Close / Unclose */}
                                                {!isClosed ? (
                                                    <Button size="sm" variant="outline" onClick={() => setCloseConfirmGroup(group)} className="h-7 text-xs px-2.5 gap-1 border-red-500/30 text-red-600 hover:bg-red-500/10 hover:border-red-500 dark:text-red-400">
                                                        <Ban className="h-3 w-3" /> Close
                                                    </Button>
                                                ) : (
                                                    <Button size="sm" variant="outline" onClick={() => setReopenConfirmGroup(group)} className="h-7 text-xs px-2.5 gap-1 border-orange-500/30 text-orange-600 hover:bg-orange-500/10 hover:border-orange-500 dark:text-orange-400">
                                                        <RefreshCw className="h-3 w-3" /> Unclose
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Closed banner */}
                                        {isClosed && (
                                            <div className="mx-4 mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800/40 px-3 py-1.5">
                                                <Ban className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                                <span className="text-xs font-medium text-red-600 dark:text-red-400">This PO has been closed. No further actions available.</span>
                                            </div>
                                        )}

                                        {/* Card Body — CRM style */}
                                        <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                                            {/* Vendor (Customer) */}
                                            <div className="col-span-2 sm:col-span-1">
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1"><Building2 className="h-3 w-3" />Vendor</p>
                                                {vendorName ? (
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <div className="cursor-pointer hover:bg-muted/30 p-1 -ml-1 rounded transition-colors group">
                                                                <p className="text-sm font-semibold group-hover:text-blue-500 transition-colors">{vendorName}</p>
                                                                {vendorContact && <p className="text-[10px] text-muted-foreground group-hover:text-blue-500/80 transition-colors">{vendorContact}</p>}
                                                            </div>
                                                        </PopoverTrigger>
                                                        <PopoverContent side="right" className="w-80 p-0 shadow-lg border-slate-200 dark:border-slate-800">
                                                            <div className="p-4 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
                                                                <div className="flex items-start gap-3">
                                                                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                                                        <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="font-semibold text-base leading-none mb-1">{vendorName}</h4>
                                                                        {getVendorFull(firstItem)?.contactName && (
                                                                            <p className="text-sm text-muted-foreground">{getVendorFull(firstItem)?.contactName}</p>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div className="mt-4 space-y-2.5 text-sm">
                                                                    {getVendorFull(firstItem)?.phone && (
                                                                        <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                                                                            <Phone className="h-4 w-4 text-slate-400" />
                                                                            <span>{getVendorFull(firstItem)?.phone}</span>
                                                                        </div>
                                                                    )}
                                                                    {getVendorFull(firstItem)?.email && (
                                                                        <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                                                                            <Mail className="h-4 w-4 text-slate-400" />
                                                                            <span className="break-all">{getVendorFull(firstItem)?.email}</span>
                                                                        </div>
                                                                    )}
                                                                    {getVendorFull(firstItem)?.address && (
                                                                        <div className="flex items-start gap-2.5 text-slate-600 dark:text-slate-300">
                                                                            <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                                                            <span className="leading-relaxed">{getVendorFull(firstItem)?.address}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </PopoverContent>
                                                    </Popover>
                                                ) : <p className="text-xs text-muted-foreground italic">No vendor</p>}
                                            </div>

                                            {/* Source — PO # */}
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1"><Hash className="h-3 w-3" />Order No</p>
                                                <p className="text-sm font-mono font-medium">{poNumber ? `#${poNumber}` : "—"}</p>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">Req #{requestNumber}</p>
                                            </div>

                                            {/* Since — created date */}
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1"><Clock className="h-3 w-3" />Order Date</p>
                                                <p className="text-sm font-medium">{fmtDate(firstItem.createdAt)}</p>
                                            </div>

                                            {/* Last Talk */}
                                            <div className="col-span-1 sm:col-span-1 lg:col-span-1">
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1"><MessageSquare className="h-3 w-3" />Last Talk</p>
                                                <EditableTalk dateValue={lastTalkDate} textValue={(firstItem as any)?.lastTalkText} onDateChange={(ts) => handleSetLastTalk(firstItem._id as Id<"requests">, ts)} onTextChange={(txt) => handleSetLastTalkText(firstItem._id as Id<"requests">, txt)} />
                                            </div>

                                            {/* Total Amount */}
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1"><IndianRupee className="h-3 w-3" />Total Amount</p>
                                                <p className="text-sm font-semibold">{formatCurrency(group.totalAmount)}</p>
                                            </div>
                                        </div>

                                        {/* PO Expiry footer */}
                                        {poExpiry && (
                                            <div className="px-5 py-2 border-t bg-muted/10 flex items-center gap-2">
                                                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                                                <span className="text-xs text-muted-foreground">PO Expires:</span>
                                                <span className="text-xs font-medium">{fmtDate(poExpiry)}</span>
                                                <ExpiryPill ts={poExpiry} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        /* ── Table View (CRM-style) ── */
                        <div className="rounded-lg border overflow-hidden bg-card">
                            {/* thead */}
                            <div className="grid grid-cols-[1fr_120px_120px_250px_130px_130px] bg-muted/40 border-b">
                                {[
                                    { label: "Vendor", icon: Building2 },
                                    { label: "Order No", icon: Hash },
                                    { label: "Order Date", icon: Clock },
                                    { label: "Last Talk", icon: MessageSquare },
                                    { label: "Total Amount", icon: IndianRupee },
                                    { label: "Actions", icon: null },
                                ].map(({ label, icon: Icon }, i) => (
                                    <div key={i} className="px-3 py-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-r last:border-r-0">
                                        {Icon && <Icon className="h-3 w-3 shrink-0" />}
                                        {label}
                                    </div>
                                ))}
                            </div>

                            {/* tbody */}
                            <div className="divide-y">
                                {paginated.map((group) => {
                                    const { key, poNumber, requestNumber, items, firstItem } = group;
                                    const vendorName = getVendorName(firstItem);
                                    const vendorContact = getVendorContact(firstItem);
                                    const poExpiry = poExpiryMap.get(firstItem._id as string) ?? null;
                                    const lastTalkDate = (firstItem as any)?.lastTalkDate ?? null;
                                    const committedDate = (firstItem as any)?.committedDate ?? null;
                                    const poc = (firstItem as any)?.creator?.fullName ?? "—";
                                    const isClosed = firstItem.status === "po_rejected";

                                    return (
                                        <div key={key} className={cn("group hover:bg-muted/20 transition-colors border-b last:border-0 border-border", isClosed ? "bg-red-50/50 dark:bg-red-950/20 opacity-75" : "")}>
                                            <div className="grid grid-cols-[1fr_120px_120px_250px_130px_130px] items-center min-h-[64px]">

                                                {/* Vendor */}
                                                <div className="px-3 py-2.5 border-r h-full flex flex-col justify-center min-w-0">
                                                    {vendorName ? (
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <div className="cursor-pointer hover:bg-muted/30 p-1 -ml-1 rounded transition-colors group">
                                                                    <p className="text-sm font-semibold truncate group-hover:text-blue-500 transition-colors">{vendorName}</p>
                                                                    {vendorContact && <p className="text-[10px] text-muted-foreground truncate group-hover:text-blue-500/80 transition-colors">{vendorContact}</p>}
                                                                </div>
                                                            </PopoverTrigger>
                                                            <PopoverContent side="right" className="w-80 p-0 shadow-lg border-slate-200 dark:border-slate-800">
                                                                <div className="p-4 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
                                                                    <div className="flex items-start gap-3">
                                                                        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                                                            <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                                                        </div>
                                                                        <div>
                                                                            <h4 className="font-semibold text-base leading-none mb-1">{vendorName}</h4>
                                                                            {getVendorFull(firstItem)?.contactName && (
                                                                                <p className="text-sm text-muted-foreground">{getVendorFull(firstItem)?.contactName}</p>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    <div className="mt-4 space-y-2.5 text-sm">
                                                                        {getVendorFull(firstItem)?.phone && (
                                                                            <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                                                                                <Phone className="h-4 w-4 text-slate-400" />
                                                                                <span>{getVendorFull(firstItem)?.phone}</span>
                                                                            </div>
                                                                        )}
                                                                        {getVendorFull(firstItem)?.email && (
                                                                            <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                                                                                <Mail className="h-4 w-4 text-slate-400" />
                                                                                <span className="break-all">{getVendorFull(firstItem)?.email}</span>
                                                                            </div>
                                                                        )}
                                                                        {getVendorFull(firstItem)?.address && (
                                                                            <div className="flex items-start gap-2.5 text-slate-600 dark:text-slate-300">
                                                                                <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                                                                <span className="leading-relaxed">{getVendorFull(firstItem)?.address}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                    ) : <p className="text-[13px] text-muted-foreground italic">No vendor</p>}
                                                    {items.length > 1 && (
                                                        <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[9px] px-1.5 py-0 mt-1 gap-0.5 w-fit">
                                                            <Layers className="h-2.5 w-2.5" />{items.length} items
                                                        </Badge>
                                                    )}
                                                </div>

                                                {/* Source — PO # */}
                                                <div className="px-3 py-2.5 border-r h-full flex flex-col justify-center">
                                                    <p className="text-[13px] font-mono font-medium">{poNumber ? `#${poNumber}` : "—"}</p>
                                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                        <span className="text-[10px] text-muted-foreground mr-1">Req #{requestNumber}</span>
                                                        {firstItem.status === "sign_pending" && (
                                                            <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[9px] px-1.5 py-0 h-4">Unsigned</Badge>
                                                        )}
                                                        {firstItem.status === "sign_rejected" && (
                                                            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-[9px] px-1.5 py-0 h-4">Rejected Sign</Badge>
                                                        )}
                                                        {firstItem.status === "pending_po" && (
                                                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[9px] px-1.5 py-0 h-4">Signed PO</Badge>
                                                        )}
                                                        {firstItem.status === "po_rejected" && (
                                                            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-[9px] px-1.5 py-0 h-4">Closed</Badge>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Since — created date */}
                                                <div className="px-3 py-2.5 border-r h-full flex flex-col justify-center">
                                                    <span className="text-[13px] font-medium">{fmtDate(firstItem?.createdAt)}</span>
                                                </div>

                                                {/* Last Talk */}
                                                <div className="px-3 py-2.5 border-r h-full flex items-start">
                                                    <EditableTalk dateValue={lastTalkDate} textValue={(firstItem as any)?.lastTalkText} onDateChange={(ts) => handleSetLastTalk(firstItem._id as Id<"requests">, ts)} onTextChange={(txt) => handleSetLastTalkText(firstItem._id as Id<"requests">, txt)} />
                                                </div>

                                                {/* Total Amount */}
                                                <div className="px-3 py-2.5 border-r h-full flex flex-col justify-center">
                                                    <span className="text-sm font-semibold">{formatCurrency(group.totalAmount)}</span>
                                                </div>

                                                {/* Actions */}
                                                <div className="px-3 py-2.5 h-full flex flex-col justify-center gap-1.5">
                                                    {/* View PO — all non-closed when PO exists */}
                                                    {poNumber && !isClosed && (
                                                        <Button size="sm" variant="outline" onClick={() => onViewPO(poNumber, firstItem._id)} className="h-7 text-xs px-2.5 gap-1 border-blue-500/30 text-blue-500 hover:bg-blue-500/10 hover:border-blue-500 w-full">
                                                            <Eye className="h-3 w-3" /> View PO
                                                        </Button>
                                                    )}
                                                    {/* Available + Send — only for Signed PO */}
                                                    {poNumber && firstItem.status === "pending_po" && (
                                                        <>
                                                            <Button size="sm" variant="outline" onClick={() => handleOpenAvailable(group)} className="h-7 text-xs px-2.5 gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:border-emerald-500 w-full">
                                                                <CheckCircle className="h-3 w-3" /> Available
                                                            </Button>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1 border-slate-500/30 text-slate-600 hover:bg-slate-500/10 hover:border-slate-500 w-full dark:text-slate-400">
                                                                        <Send className="h-3 w-3" /> Send
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="w-40">
                                                                    <DropdownMenuItem onClick={() => handleShareWhatsApp(group)} className="gap-2 cursor-pointer text-sm">
                                                                        <MessageCircle className="h-4 w-4 text-green-500" /> WhatsApp
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleShareEmail(group)} className="gap-2 cursor-pointer text-sm">
                                                                        <Mail className="h-4 w-4 text-blue-500" /> Email
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </>
                                                    )}
                                                    {/* Close / Unclose */}
                                                    {!isClosed ? (
                                                        <Button size="sm" variant="outline" onClick={() => setCloseConfirmGroup(group)} className="h-7 text-xs px-2.5 gap-1 border-red-500/30 text-red-600 hover:bg-red-500/10 hover:border-red-500 w-full dark:text-red-400">
                                                            <Ban className="h-3 w-3" /> Close
                                                        </Button>
                                                    ) : (
                                                        <Button size="sm" variant="outline" onClick={() => setReopenConfirmGroup(group)} className="h-7 text-xs px-2.5 gap-1 border-orange-500/30 text-orange-600 hover:bg-orange-500/10 hover:border-orange-500 w-full dark:text-orange-400">
                                                            <RefreshCw className="h-3 w-3" /> Unclose
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* tfoot */}
                            <div className="px-4 py-2.5 border-t bg-muted/20 flex items-center">
                                <p className="text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">{filtered.length}</span> PO group{filtered.length !== 1 ? "s" : ""}
                                    {" · "}
                                    <span className="font-semibold text-foreground">{pendingItems.length}</span> total item{pendingItems.length !== 1 ? "s" : ""}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Pagination Bottom ── */}
                    <div className="mt-4 border-t pt-4">
                        <PaginationControls
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                            pageSize={pageSize}
                            onPageSizeChange={setPageSize}
                            totalItems={totalItems}
                            pageSizeOptions={[10, 25, 50, 100]}
                            itemCount={paginated.length}
                        />
                    </div>
                </>
            )}

            {/* Bulk Delivery Dialog — Confirms delivery and auto-creates GRNs */}
            {bulkDeliveryData && (
                <BulkDeliveryDialog
                    open={!!bulkDeliveryData}
                    onOpenChange={(open) => !open && setBulkDeliveryData(null)}
                    items={bulkDeliveryData.items}
                    vendorName={bulkDeliveryData.vendorName}
                    poNumber={bulkDeliveryData.poNumber}
                />
            )}
            {/* Close PO Confirm Dialog */}
            <Dialog open={!!closeConfirmGroup} onOpenChange={(open) => !open && setCloseConfirmGroup(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Close PO</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to close this PO? It will remain visible but marked as Closed. You can unclose it later if needed.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <textarea
                            value={closeNotes}
                            onChange={(e) => setCloseNotes(e.target.value)}
                            placeholder="Reason for closing (optional)..."
                            className="w-full min-h-[90px] p-2 rounded-md border bg-background text-sm resize-y"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setCloseConfirmGroup(null); setCloseNotes(""); }}>Cancel</Button>
                        <Button variant="destructive" onClick={handleConfirmClose}>Confirm Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reopen PO Confirm Dialog */}
            <Dialog open={!!reopenConfirmGroup} onOpenChange={(open) => !open && setReopenConfirmGroup(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reopen PO</DialogTitle>
                        <DialogDescription>
                            This will reopen the closed PO and set it back to "Rejected Sign" status so it can be processed again.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <textarea
                            value={reopenNotes}
                            onChange={(e) => setReopenNotes(e.target.value)}
                            placeholder="Reason for reopening (optional)..."
                            className="w-full min-h-[90px] p-2 rounded-md border bg-background text-sm resize-y"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setReopenConfirmGroup(null); setReopenNotes(""); }}>Cancel</Button>
                        <Button onClick={handleConfirmReopen}>Confirm Reopen</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
