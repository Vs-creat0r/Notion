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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DailyReportDialog } from "./daily-report-dialog";

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

    // ── Section-level date overrides ──
    const [processDate, setProcessDate] = useState<Date | null>(null);
    const [taskDate, setTaskDate] = useState<Date | null>(null);
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
            borderColor: "border-l-purple-500",
            bgTint: "bg-purple-500/5",
            iconColor: "text-purple-500",
            href: "/dashboard/purchase/requests?status=delivery_stage,delivery_processing",
        },
    ];

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
                                                <div
                                                    className={cn(
                                                        "flex items-center gap-1.5 text-xs",
                                                        isOverdue
                                                            ? "text-red-600 dark:text-red-400"
                                                            : "text-muted-foreground"
                                                    )}
                                                >
                                                    <Clock className="h-3 w-3" />
                                                    <span>
                                                        {isOverdue ? "Overdue: " : "Due: "}
                                                        {fmtDate(task.dueDate)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1.5">
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[10px] px-1.5 py-0"
                                                >
                                                    {isFromManager
                                                        ? `From ${task.creator?.fullName || "Manager"}`
                                                        : "Self"}
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
                                    // Open sticky notes panel
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
                        <div className="space-y-1 rounded-lg border border-border overflow-hidden">
                            {activityLogs.map((log, idx) => (
                                <div
                                    key={log._id}
                                    className={cn(
                                        "flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors",
                                        idx !== activityLogs.length - 1 && "border-b border-border/50"
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
