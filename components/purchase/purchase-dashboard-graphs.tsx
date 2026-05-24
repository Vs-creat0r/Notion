"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format, isSameDay, startOfDay, addDays } from "date-fns";
import {
    Loader2,
    AlertCircle,
    CheckCircle2,
    Clock,
    ArrowRight,
    Activity,
    CalendarDays,
    FolderKanban,
    ListChecks,
    FileText,
    History,
    ChevronRight,
    PackageCheck,
    PenLine,
    Send,
    ChevronsUp,
    Equal,
    ChevronsDown,
    Calendar as CalendarIcon,
    X,
    MessageSquare,
    Search,
    ChevronDown,
    Eye,
    BellRing,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DailyReportDialog } from "./daily-report-dialog";
import { EditableTalk } from "./editable-talk";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { PDFPreviewDialog } from "./pdf-preview-dialog";

/* ── helpers ─────────────────────────────────────────── */
function fmtDate(ts: number | undefined | null): string {
    if (!ts) return "—";
    return format(new Date(ts), "dd MMM yy");
}

/* ── Inline Date Picker (simple native input) ────────── */
function InlineDateFilter({
    value,
    onChange,
    label,
}: {
    value: Date | null;
    onChange: (d: Date | null) => void;
    label?: string;
}) {
    const dateStr = value ? format(value, "yyyy-MM-dd") : "";
    const inputRef = useRef<HTMLInputElement>(null);

    const handleClick = (e: React.MouseEvent) => {
        // Don't open picker if clicking the clear button
        const target = e.target as HTMLElement;
        if (target.closest('[data-clear-btn]')) return;

        // Programmatically open the native date picker
        try {
            inputRef.current?.showPicker();
        } catch {
            // Fallback: focus and click the input for older browsers
            inputRef.current?.focus();
            inputRef.current?.click();
        }
    };

    return (
        <div
            className="group relative inline-flex items-center gap-1.5 cursor-pointer select-none px-3 py-1.5 -my-1.5 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50"
            onClick={handleClick}
        >
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            {label && (
                <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                    {label}
                </span>
            )}
            <span
                className={cn(
                    "text-xs font-medium transition-colors group-hover:text-primary",
                    value ? "text-foreground" : "text-muted-foreground italic"
                )}
            >
                {value ? format(value, "dd MMM") : "Pick date"}
            </span>
            <input
                ref={inputRef}
                type="date"
                value={dateStr}
                onChange={(e) => {
                    if (e.target.value) {
                        onChange(new Date(e.target.value + "T00:00:00"));
                    } else {
                        onChange(null);
                    }
                }}
                className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
                tabIndex={-1}
            />
            {value && (
                <button
                    type="button"
                    data-clear-btn
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onChange(null);
                    }}
                    className="text-muted-foreground hover:text-red-500 rounded p-0.5 z-10 relative"
                    title="Clear date"
                >
                    <X className="h-3 w-3" />
                </button>
            )}
        </div>
    );
}



/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════ */
export function PurchaseDashboardGraphs() {
    const router = useRouter();

    // ── Global Filters ──
    const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
    const [globalDate, setGlobalDate] = useState<Date | null>(null);

    const [processDate, setProcessDate] = useState<Date | null>(null);
    const [taskDate, setTaskDate] = useState<Date | null>(null);
    const [followupDate, setFollowupDate] = useState<Date | null>(null);
    const [followupProjectId, setFollowupProjectId] = useState<string>("all");
    const [followupPage, setFollowupPage] = useState<number>(1);
    const [followupSearch, setFollowupSearch] = useState("");
    // reminderDayInputs: per-group custom day input { [groupKey]: string }
    const [reminderDayInputs, setReminderDayInputs] = useState<Record<string, string>>({});
    // PO Preview state
    const [pdfPreviewPO, setPdfPreviewPO] = useState<{ poNumber: string; requestId: string } | null>(null);
    // Activity logs pagination
    const [activityPage, setActivityPage] = useState(1);
    const [activityDate, setActivityDate] = useState<Date | null>(null);

    // ── Daily Report ──
    const [reportOpen, setReportOpen] = useState(false);

    // ── Data Queries ──
    const projects = useQuery(api.projects.getAllProjects, {});
    const requestsQuery = useQuery(api.requests.getAllRequests, {});
    const purchaseOrdersQuery = useQuery(api.purchaseOrders.getAllPurchaseOrders, {});
    const stickyNotesQuery = useQuery(api.stickyNotes.list, {});
    const currentUser = useQuery(api.users.getCurrentUser, {});

    // ── Mutations ──

    // Activity date for fetching logs
    const effectiveActivityDate = activityDate || globalDate || new Date();
    const activityDateStr = format(effectiveActivityDate, "yyyy-MM-dd");
    const activityLogs = useQuery(api.dailyReports.getDailyActivity, { date: activityDateStr });

    const isLoading = requestsQuery === undefined || purchaseOrdersQuery === undefined;
    const requests = requestsQuery || [];
    const purchaseOrders = purchaseOrdersQuery || [];

    // ── Project Filter ──
    const filteredByProject = useMemo(() => {
        if (selectedProjectId === "all") return requests;
        if (selectedProjectId === "none") return requests.filter((r) => !r.projectId);
        return requests.filter((r) => r.projectId === selectedProjectId);
    }, [requests, selectedProjectId]);

    const filteredPOsByProject = useMemo(() => {
        if (selectedProjectId === "all") return purchaseOrders;
        if (selectedProjectId === "none") return purchaseOrders.filter((po) => !po.projectId);
        return purchaseOrders.filter((po) => po.projectId === selectedProjectId);
    }, [purchaseOrders, selectedProjectId]);

    // ── Effective dates for each section ──
    const effectiveProcessDate = processDate || globalDate;
    const effectiveTaskDate = taskDate || globalDate;


    // ═══════════════════════════════════════════════════════
    // SECTION 1: Process States
    // ═══════════════════════════════════════════════════════
    const processStates = useMemo(() => {
        // Process states show current pipeline status — no date filter needed
        // as these represent what's currently pending regardless of creation date
        const reqs = filteredByProject;

        const ccPending = reqs.filter(
            (r) => r.status === "ready_for_cc" || r.status === "cc_pending" || r.status === "cc_rejected"
        ).length;

        const poUnsigned = reqs.filter(
            (r) => r.status === "pending_po" || r.status === "sign_pending"
        ).length;

        const poSigned = reqs.filter(
            (r) => r.status === "ready_for_delivery" || r.status === "out_for_delivery"
        ).length;

        // Partially delivered: requests where some qty was delivered but not all
        const partiallyDelivered = reqs.filter(
            (r) => r.status === "delivery_stage" || r.status === "delivery_processing"
        ).length;

        return { ccPending, poUnsigned, poSigned, partiallyDelivered };
    }, [filteredByProject]);

    const processCards = [
        {
            title: "CC Pending",
            value: processStates.ccPending,
            subtitle: "Awaiting cost comparison",
            icon: Clock,
            borderColor: "border-l-amber-500",
            bgTint: "bg-amber-500/5",
            iconColor: "text-amber-500",
            href: "/dashboard/purchase/requests?status=cc_pending,ready_for_cc,cc_rejected",
        },
        {
            title: "PO Unsigned",
            value: processStates.poUnsigned,
            subtitle: "Awaiting manager signature",
            icon: PenLine,
            borderColor: "border-l-blue-500",
            bgTint: "bg-blue-500/5",
            iconColor: "text-blue-500",
            href: "/dashboard/purchase/requests?status=pending_po,sign_pending,sign_rejected",
        },
        {
            title: "PO Signed",
            value: processStates.poSigned,
            subtitle: "Ready for delivery",
            icon: CheckCircle2,
            borderColor: "border-l-emerald-500",
            bgTint: "bg-emerald-500/5",
            iconColor: "text-emerald-500",
            href: "/dashboard/purchase/requests?status=ready_for_delivery,out_for_delivery,delivery_processing,delivery_stage,delivered",
        },
        {
            title: "Partially Delivered",
            value: processStates.partiallyDelivered,
            subtitle: "Awaiting remaining items",
            icon: PackageCheck,
            borderColor: "border-l-indigo-500",
            bgTint: "bg-indigo-500/5",
            iconColor: "text-indigo-500",
            href: "/dashboard/purchase/requests?status=delivery_stage,delivery_processing",
        },
    ];

    // ═══════════════════════════════════════════════════════
    // FOLLOW-UPS COMPUTATION
    // ═══════════════════════════════════════════════════════
    const vendorsQuery = useQuery(api.vendors.getAllVendors, {});
    const updateLastTalkDate = useMutation(api.requests.updateLastTalkDate);
    const updateLastTalkText = useMutation(api.requests.updateLastTalkText);
    const followupGroups = useMemo(() => {
        let baseReqs = requests || [];
        if (followupProjectId !== "all") {
            baseReqs = baseReqs.filter(r => r.projectId === followupProjectId);
        }

        const pendingReqs = baseReqs.filter(r =>
            r.status === "pending_po" || r.status === "sign_pending"
        );
        const map = new Map<string, any[]>();
        pendingReqs.forEach((r) => {
            const key = r.poNumber ?? r.requestNumber;
            const arr = map.get(key) || [];
            arr.push(r);
            map.set(key, arr);
        });

        let groups = Array.from(map.entries()).map(([key, items]) => {
            const firstItem = items[0];
            let totalAmount = 0;
            items.forEach((item: any) => {
                const quote = item.vendorQuotes?.find((q: any) => q.vendorId === item.selectedVendorId);
                if (quote && quote.amount) totalAmount += quote.amount;
                else if (item.quantity && quote?.unitPrice) totalAmount += item.quantity * quote.unitPrice;
            });
            if (totalAmount === 0 && firstItem.poNumber && purchaseOrdersQuery) {
                const pos = purchaseOrdersQuery.filter((p: any) => p.poNumber === firstItem.poNumber);
                totalAmount = pos.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0);
            }
            return { key, items, firstItem, totalAmount, poNumber: firstItem.poNumber, requestNumber: firstItem.requestNumber };
        });

        const todayStart = startOfDay(new Date()).getTime();
        const targetDateStr = followupDate ? format(followupDate, "yyyy-MM-dd") : null;

        groups = groups.filter(g => {
            const requiredBy = g.firstItem.requiredBy;
            const lastTalk = (g.firstItem as any)?.lastTalkDate;

            // If a specific date is selected, exact match on due date
            if (targetDateStr) {
                if (!requiredBy) return false;
                return format(new Date(requiredBy), "yyyy-MM-dd") === targetDateStr;
            }

            // Otherwise, apply default rule:
            // "If the due of PO < 10 days then show it on followups. 
            // If snoozed, hide until days complete."

            // Check snooze first
            if (lastTalk && lastTalk > todayStart + 86400000) {
                return false; // Snoozed to the future (beyond tomorrow technically, or just beyond today)
            }

            // Check due date < 10 days
            if (requiredBy) {
                const daysLeft = Math.ceil((requiredBy - Date.now()) / 86400000);
                if (daysLeft <= 10) return true;
            }

            // Or if they have a snooze that has expired/arrived
            if (lastTalk && lastTalk <= todayStart + 86400000) {
                return true;
            }

            return false;
        });

        return groups.sort((a, b) => {
            const aDate = (a.firstItem as any)?.lastTalkDate ?? a.firstItem.requiredBy ?? a.firstItem.createdAt;
            const bDate = (b.firstItem as any)?.lastTalkDate ?? b.firstItem.requiredBy ?? b.firstItem.createdAt;
            return aDate - bDate;
        });
    }, [requests, followupProjectId, purchaseOrdersQuery, followupDate]);


    // ═══════════════════════════════════════════════════════
    // SECTION 2: Task Assignment
    // ═══════════════════════════════════════════════════════
    const tasks = useMemo(() => {
        if (!stickyNotesQuery || !currentUser) return [];
        let notes = stickyNotesQuery.filter(
            (n: any) =>
                !n.isDeleted &&
                !n.isCompleted &&
                (n.assignedTo === currentUser._id || n.createdBy === currentUser._id)
        );
        if (effectiveTaskDate) {
            notes = notes.filter((n: any) => {
                if (n.dueDate) return isSameDay(new Date(n.dueDate), effectiveTaskDate);
                return isSameDay(new Date(n.createdAt), effectiveTaskDate);
            });
        }
        return notes;
    }, [stickyNotesQuery, currentUser, effectiveTaskDate]);


    // ── Loading state ──
    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ═══════════════════════════════════════════════
                GLOBAL FILTER BAR
            ═══════════════════════════════════════════════ */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-5 py-4">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                            <FolderKanban className="h-4 w-4 text-primary" />
                        </div>
                        <span className="text-sm font-semibold">Dashboard</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
                        {/* Project Filter */}
                        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                            <SelectTrigger className="h-8 w-[180px] text-xs bg-muted/30 border-muted-foreground/20">
                                <FolderKanban className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                                <SelectValue placeholder="All Projects" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Projects</SelectItem>
                                <SelectItem value="none">No Project</SelectItem>
                                {projects?.map((p) => (
                                    <SelectItem key={p._id} value={p._id}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Global Date */}
                        <InlineDateFilter
                            value={globalDate}
                            onChange={setGlobalDate}
                            label="Date:"
                        />
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════
                SECTION 1: PROCESS STATES
            ═══════════════════════════════════════════════ */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10">
                            <Activity className="h-4 w-4 text-amber-500" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold">Process States</h3>
                            <p className="text-xs text-muted-foreground">Current pipeline overview</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border/40">
                    {processCards.map((card) => (
                        <div
                            key={card.title}
                            className={`flex flex-col justify-between p-5 border-l-[3px] ${card.borderColor} ${card.bgTint} bg-card hover:bg-muted/30 transition-colors group cursor-pointer`}
                            onClick={() => router.push(card.href)}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    {card.title}
                                </p>
                                <div
                                    className={`flex items-center justify-center h-8 w-8 rounded-lg bg-background border border-border/50 ${card.iconColor}`}
                                >
                                    <card.icon className="h-4 w-4" />
                                </div>
                            </div>
                            <div className="text-3xl font-bold tracking-tight mb-1">{card.value}</div>
                            <div className="flex items-center justify-between mt-2">
                                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary flex items-center gap-0.5">
                                    View <ArrowRight className="h-3 w-3" />
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════
                SECTION 2: TASK ASSIGNMENT
            ═══════════════════════════════════════════════ */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-blue-500/10">
                            <ListChecks className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold">Task Assignment</h3>
                            <p className="text-xs text-muted-foreground">
                                {tasks.length} active task{tasks.length !== 1 && "s"}
                            </p>
                        </div>
                    </div>
                    <InlineDateFilter value={taskDate} onChange={setTaskDate} />
                </div>

                <div className="p-5">
                    {stickyNotesQuery === undefined ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                            <CheckCircle2 className="h-10 w-10 opacity-20" />
                            <p className="text-sm">No pending tasks</p>
                        </div>
                    ) : (
                        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {tasks.slice(0, 8).map((task: any) => {
                                const isFromManager =
                                    currentUser && task.createdBy !== currentUser._id;
                                const priorityMap: Record<string, { border: string; icon: React.ReactNode; label: string }> = {
                                    high: {
                                        border: "border-l-red-500",
                                        icon: <ChevronsUp className="h-3.5 w-3.5 text-red-500" />,
                                        label: "High",
                                    },
                                    medium: {
                                        border: "border-l-orange-500",
                                        icon: <Equal className="h-3.5 w-3.5 text-orange-500" />,
                                        label: "Medium",
                                    },
                                    low: {
                                        border: "border-l-blue-500",
                                        icon: <ChevronsDown className="h-3.5 w-3.5 text-blue-500" />,
                                        label: "Low",
                                    },
                                };
                                const priorityConfig = priorityMap[task.priority || "medium"] || {
                                    border: "border-l-border",
                                    icon: null,
                                    label: "",
                                };

                                const isOverdue =
                                    task.dueDate && Date.now() > task.dueDate && !task.isCompleted;

                                return (
                                    <div
                                        key={task._id}
                                        className={cn(
                                            "rounded-lg border border-border bg-card p-4 border-l-[3px] hover:shadow-md transition-shadow",
                                            priorityConfig.border,
                                            isOverdue && "shadow-red-500/10 shadow-sm"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <h4 className="text-sm font-semibold line-clamp-2 leading-tight">
                                                {task.title}
                                            </h4>
                                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                                {priorityConfig.icon && (
                                                    <div>{priorityConfig.icon}</div>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 rounded-full hover:bg-muted-foreground/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const url = new URL(window.location.href);
                                                        url.searchParams.set("sticky-notes", "true");
                                                        url.hash = `task-${task._id}`;
                                                        router.push(url.pathname + url.search + url.hash);
                                                    }}
                                                >
                                                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                                </Button>
                                            </div>
                                        </div>
                                        {task.content && (
                                            <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                                                {task.content}
                                            </p>
                                        )}
                                        <div className="space-y-1.5 mt-auto">
                                            {task.dueDate && (
                                                <div className={cn("flex items-center gap-1.5 text-xs", isOverdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                                                    <Clock className="h-3 w-3" />
                                                    <span>{isOverdue ? "Overdue: " : "Due: "}{fmtDate(task.dueDate)}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1.5">
                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                                    {isFromManager ? `From ${task.creator?.fullName || "Manager"}` : "Self"}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {tasks.length > 8 && (
                        <div className="flex justify-center mt-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-primary gap-1"
                                onClick={() => {
                                    const url = new URL(window.location.href);
                                    url.searchParams.set("sticky-notes", "true");
                                    router.push(url.pathname + url.search);
                                }}
                            >
                                View all {tasks.length} tasks
                                <ChevronRight className="h-3 w-3" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════
                SECTION 3: FOLLOW-UPS — Professional Table
            ═══════════════════════════════════════════════ */}
            <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ background: 'hsl(var(--card))' }}>
                {/* ── Header ── */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-3.5 border-b border-border/60 gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-orange-500/15">
                            <MessageSquare className="h-4 w-4 text-orange-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold tracking-tight">Vendor Follow-ups</h3>
                            <p className="text-[11px] text-muted-foreground">
                                {followupGroups.length} pending PO{followupGroups.length !== 1 && "s"}
                            </p>
                        </div>
                    </div>
                    {/* Search bar */}
                    <div className="relative w-full sm:w-56">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                            value={followupSearch}
                            onChange={e => { setFollowupSearch(e.target.value); setFollowupPage(1); }}
                            placeholder="Search PO, item, desc…"
                            className="h-8 pl-8 pr-3 text-xs bg-muted/40 border-border/60 focus-visible:ring-1"
                        />
                        {followupSearch && (
                            <button onClick={() => setFollowupSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Table Container (scrollable on mobile) ── */}
                <div className="overflow-x-auto">
                    <div className="min-w-[860px]">
                        {/* ── Column Headers (with inline filters) ── */}
                            <div className="grid items-center border-b border-border/70 bg-muted/30"
                                style={{ gridTemplateColumns: '120px 1fr 130px 1fr 180px 200px' }}>

                                {/* PO ID header */}
                                <div className="px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    PO ID
                                </div>

                                {/* PROJECT header with filter */}
                                <div className="px-4 py-2.5">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors group">
                                                PROJECT
                                                <ChevronDown className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                                                {followupProjectId !== "all" && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-orange-400" />}
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="w-48">
                                            <DropdownMenuItem onClick={() => { setFollowupProjectId("all"); setFollowupPage(1); }}
                                                className={cn(followupProjectId === "all" && "bg-accent")}>
                                                All Projects
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            {projects?.map(p => (
                                                <DropdownMenuItem key={p._id}
                                                    onClick={() => { setFollowupProjectId(p._id); setFollowupPage(1); }}
                                                    className={cn(followupProjectId === p._id && "bg-accent")}>
                                                    {p.name}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                {/* DATES header with filter */}
                                <div className="px-4 py-2.5">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors group">
                                                DATES
                                                <ChevronDown className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                                                {followupDate && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-orange-400" />}
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="w-56 p-3">
                                            <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Filter by Due Date</p>
                                            <InlineDateFilter
                                                value={followupDate}
                                                onChange={d => { setFollowupDate(d); setFollowupPage(1); }}
                                                label="Pick due date"
                                            />
                                            {followupDate && (
                                                <button onClick={() => { setFollowupDate(null); setFollowupPage(1); }}
                                                    className="mt-2 text-[11px] text-red-400 hover:text-red-500 flex items-center gap-1">
                                                    <X className="h-3 w-3" /> Clear filter
                                                </button>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                {/* ITEM DETAILS header */}
                                <div className="px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">ITEM DETAILS</div>

                                {/* FOLLOW-UP LOG header */}
                                <div className="px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">FOLLOW-UP LOG</div>

                                {/* ACTIONS header */}
                                <div className="px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">ACTIONS</div>
                            </div>

                            {/* ── Rows ── */}
                            <div className="divide-y divide-border/40">
                                {(() => {
                                    // Apply search filter on top of group filter
                                    const searchLower = followupSearch.toLowerCase();
                                    const filtered = searchLower
                                        ? followupGroups.filter(g =>
                                            (g.poNumber || "").toLowerCase().includes(searchLower) ||
                                            (g.requestNumber || "").toLowerCase().includes(searchLower) ||
                                            (g.firstItem.itemName || "").toLowerCase().includes(searchLower) ||
                                            (g.firstItem.description || "").toLowerCase().includes(searchLower)
                                        )
                                        : followupGroups;

                                    const pageItems = filtered.slice((followupPage - 1) * 5, followupPage * 5);
                                    const totalPages = Math.ceil(filtered.length / 5);

                                    return (
                                        <>
                                            {pageItems.length === 0 ? (
                                                <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
                                                    <CheckCircle2 className="h-10 w-10 opacity-20" />
                                                    <p>{followupSearch || followupProjectId !== "all" || followupDate ? "No results match your filters." : "No follow-ups due in the next 10 days"}</p>
                                                </div>
                                            ) : pageItems.map((g) => {
                                                const vendor = vendorsQuery?.find(v => v._id === g.firstItem.selectedVendorId);
                                                const proj = projects?.find(p => p._id === g.firstItem.projectId);
                                                const totalQty = g.items.reduce((acc: number, curr: any) => acc + (curr.quantity || 0), 0);
                                                const unit = g.firstItem.unit || "nos";
                                                const daysLeft = g.firstItem.requiredBy
                                                    ? Math.ceil((g.firstItem.requiredBy - Date.now()) / 86400000)
                                                    : null;
                                                const isUrgent = daysLeft !== null && daysLeft <= 3;
                                                const isWarning = daysLeft !== null && daysLeft > 3 && daysLeft <= 7;
                                                const customDayInput = reminderDayInputs[g.key] ?? "";

                                                return (
                                                    <div
                                                        key={g.key}
                                                        className="grid items-start transition-colors hover:bg-muted/20"
                                                        style={{ gridTemplateColumns: '120px 1fr 130px 1fr 180px 200px' }}
                                                    >
                                                        {/* PO ID */}
                                                        <div className="px-4 py-3.5 flex flex-col gap-1">
                                                            <span className="text-xs font-bold font-mono text-primary/90">
                                                                {g.poNumber || g.requestNumber || "—"}
                                                            </span>
                                                            {isUrgent && (
                                                                <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Urgent</span>
                                                            )}
                                                            {isWarning && !isUrgent && (
                                                                <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">{daysLeft}d left</span>
                                                            )}
                                                        </div>

                                                        {/* PROJECT */}
                                                        <div className="px-4 py-3.5 flex flex-col gap-0.5 min-w-0">
                                                            <span className="text-xs font-semibold truncate">{proj?.name || "No Project"}</span>
                                                            <span className="text-[11px] text-muted-foreground truncate">{vendor?.companyName || "Unknown Vendor"}</span>
                                                        </div>

                                                        {/* DATES */}
                                                        <div className="px-4 py-3.5 flex flex-col gap-2">
                                                            <div>
                                                                <div className="text-[9px] font-semibold text-muted-foreground uppercase leading-none mb-0.5">REQUIRED</div>
                                                                <div className={cn(
                                                                    "text-xs font-bold",
                                                                    daysLeft !== null && daysLeft < 0 ? "text-red-400" :
                                                                    isUrgent ? "text-red-400" :
                                                                    isWarning ? "text-amber-400" : "text-foreground"
                                                                )}>
                                                                    {g.firstItem.requiredBy ? format(g.firstItem.requiredBy, "dd MMM") : "—"}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[9px] font-semibold text-muted-foreground uppercase leading-none mb-0.5">CREATED</div>
                                                                <div className="text-[11px] text-muted-foreground">
                                                                    {format(g.firstItem.createdAt, "dd/MM")}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* ITEM DETAILS — no image, QTY beside item name */}
                                                        <div className="px-4 py-3.5 flex flex-col gap-1 min-w-0">
                                                            {g.items.map((item: any, idx: number) => (
                                                                <div key={idx} className="flex items-baseline gap-2 min-w-0">
                                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">#{idx + 1}</Badge>
                                                                    <span className="text-xs font-semibold truncate">{item.itemName}</span>
                                                                    <span className="text-[11px] font-bold text-primary/80 shrink-0">{item.quantity} {item.unit || "nos"}</span>
                                                                </div>
                                                            ))}
                                                            {g.firstItem.description && (
                                                                <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">{g.firstItem.description}</p>
                                                            )}
                                                        </div>

                                                        {/* FOLLOW-UP LOG */}
                                                        <div className="px-4 py-3.5">
                                                            <EditableTalk
                                                                dateValue={g.firstItem.lastTalkDate}
                                                                textValue={g.firstItem.lastTalkText}
                                                                onDateChange={ts => updateLastTalkDate({ requestId: g.firstItem._id, lastTalkDate: ts })}
                                                                onTextChange={txt => updateLastTalkText({ requestId: g.firstItem._id, lastTalkText: txt })}
                                                            />
                                                        </div>

                                                        {/* ACTIONS */}
                                                        <div className="px-4 py-3.5 flex flex-col items-end gap-2">
                                                            {/* Remind: dropdown + custom days input */}
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="outline" size="sm"
                                                                        className="h-7 text-[11px] px-2.5 gap-1.5 w-full border-border/60 hover:border-orange-400/50 hover:text-orange-400">
                                                                        <BellRing className="h-3 w-3" />
                                                                        Remind
                                                                        <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="w-52 p-2">
                                                                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">Snooze for</div>
                                                                    {[1, 3, 7].map(days => (
                                                                        <DropdownMenuItem key={days}
                                                                            onClick={() => updateLastTalkDate({ requestId: g.firstItem._id, lastTalkDate: addDays(new Date(), days).getTime() }).then(() => toast.success(`Remind in ${days} day${days > 1 ? 's' : ''}`))}
                                                                            className="text-xs">
                                                                            {days === 1 ? "Tomorrow" : days === 3 ? "In 3 days" : "In 1 week"}
                                                                        </DropdownMenuItem>
                                                                    ))}
                                                                    <DropdownMenuSeparator />
                                                                    {/* Custom days */}
                                                                    <div className="px-1 pt-1 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                                                        <Input
                                                                            type="number"
                                                                            min="1"
                                                                            max="365"
                                                                            placeholder="Days"
                                                                            value={customDayInput}
                                                                            onChange={e => setReminderDayInputs(prev => ({ ...prev, [g.key]: e.target.value }))}
                                                                            className="h-7 text-xs w-16 px-2"
                                                                        />
                                                                        <Button size="sm" className="h-7 text-[11px] px-2.5 flex-1"
                                                                            disabled={!customDayInput || isNaN(parseInt(customDayInput)) || parseInt(customDayInput) < 1}
                                                                            onClick={() => {
                                                                                const d = parseInt(customDayInput);
                                                                                if (d > 0) {
                                                                                    updateLastTalkDate({ requestId: g.firstItem._id, lastTalkDate: addDays(new Date(), d).getTime() })
                                                                                        .then(() => {
                                                                                            toast.success(`Remind in ${d} day${d > 1 ? 's' : ''}`);
                                                                                            setReminderDayInputs(prev => ({ ...prev, [g.key]: "" }));
                                                                                        });
                                                                                }
                                                                            }}
                                                                        >
                                                                            Set
                                                                        </Button>
                                                                    </div>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>

                                                            {/* View PO — opens PDF popup */}
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 text-[11px] px-2.5 gap-1.5 w-full border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-400"
                                                                onClick={() => {
                                                                    if (g.poNumber) {
                                                                        setPdfPreviewPO({ poNumber: g.poNumber, requestId: g.firstItem._id });
                                                                    } else {
                                                                        toast.info("No PO number assigned yet");
                                                                    }
                                                                }}
                                                            >
                                                                <Eye className="h-3 w-3" /> View PO
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Pagination */}
                                            {totalPages > 1 && (
                                                <div className="flex items-center justify-between px-5 py-3 border-t border-border/40 bg-muted/10">
                                                    <span className="text-[11px] text-muted-foreground">
                                                        Page {followupPage} of {totalPages} &nbsp;·&nbsp; {filtered.length} POs
                                                    </span>
                                                    <div className="flex gap-1">
                                                        <Button variant="outline" size="sm" className="h-7 text-[11px] px-3"
                                                            disabled={followupPage === 1}
                                                            onClick={() => setFollowupPage(p => Math.max(1, p - 1))}>← Prev</Button>
                                                        <Button variant="outline" size="sm" className="h-7 text-[11px] px-3"
                                                            disabled={followupPage >= totalPages}
                                                            onClick={() => setFollowupPage(p => Math.min(totalPages, p + 1))}>Next →</Button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                </div>
            </div>

            {/* PO PDF Preview Dialog */}
            {pdfPreviewPO && (
                <PDFPreviewDialog
                    open={!!pdfPreviewPO}
                    onOpenChange={open => { if (!open) setPdfPreviewPO(null); }}
                    poNumber={pdfPreviewPO.poNumber}
                    requestId={pdfPreviewPO.requestId}
                    type="po"
                />
            )}

            {/* ═══════════════════════════════════════════════
                SECTION 4: ACTIVITY LOGS
            ═══════════════════════════════════════════════ */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-purple-500/10">
                            <FileText className="h-4 w-4 text-purple-500" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold">Activity Logs</h3>
                            <p className="text-xs text-muted-foreground">
                                {activityLogs?.length ?? 0} actions recorded
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <InlineDateFilter value={activityDate} onChange={setActivityDate} />
                        <Button
                            size="sm"
                            variant="default"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => setReportOpen(true)}
                        >
                            <FileText className="h-3.5 w-3.5" />
                            Daily Report
                        </Button>
                    </div>
                </div>

                <div className="p-5">
                    {activityLogs === undefined ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : activityLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                            <AlertCircle className="h-10 w-10 opacity-20" />
                            <p className="text-sm">No activities recorded for this date</p>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-lg border border-border overflow-hidden">
                                {activityLogs.slice((activityPage - 1) * 5, activityPage * 5).map((log, idx) => (
                                    <div
                                        key={log._id}
                                        className={cn(
                                            "flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors",
                                            idx > 0 && "border-t border-border/50"
                                        )}
                                    >
                                        <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 mt-0.5">
                                            <Clock className="h-3 w-3" />
                                            <span className="text-xs font-mono w-[75px]">{log.time}</span>
                                        </div>
                                        <p className="text-sm leading-relaxed flex-1">{log.action}</p>
                                        {log.requestNumber && (
                                            <Badge variant="secondary" className="text-[10px] shrink-0">
                                                {log.requestNumber}
                                            </Badge>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {activityLogs.length > 5 && (
                                <div className="flex items-center justify-between pt-3">
                                    <span className="text-[11px] text-muted-foreground">
                                        Showing {Math.min((activityPage - 1) * 5 + 1, activityLogs.length)}–{Math.min(activityPage * 5, activityLogs.length)} of {activityLogs.length}
                                    </span>
                                    <div className="flex gap-1">
                                        <Button variant="outline" size="sm" className="h-7 text-[11px] px-3"
                                            disabled={activityPage === 1}
                                            onClick={() => setActivityPage(p => Math.max(1, p - 1))}>← Prev</Button>
                                        <Button variant="outline" size="sm" className="h-7 text-[11px] px-3"
                                            disabled={activityPage * 5 >= activityLogs.length}
                                            onClick={() => setActivityPage(p => p + 1)}>Next →</Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Daily Report Dialog */}
            <DailyReportDialog
                open={reportOpen}
                onOpenChange={setReportOpen}
                selectedDate={effectiveActivityDate}
            />
        </div>
    );
}
