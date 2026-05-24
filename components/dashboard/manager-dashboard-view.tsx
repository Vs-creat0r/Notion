"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { motion } from "framer-motion";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from "recharts";
import {
    Clock,
    Users,
    Package,
    AlertCircle,
    CheckCircle2,
    Activity,
    TrendingUp,
    PenLine,
    PackageCheck,
    Search,
    X,
    ChevronDown,
    ChevronRight,
    Calendar as CalendarIcon,
    FolderKanban,
    ListChecks,
    MessageSquare,
    Check,
    Eye,
    Table2,
    LayoutGrid
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format, isSameDay, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useChatWidth } from "@/components/chat/chat-width-provider";
import { EditableTalk } from "@/components/purchase/editable-talk";
import { PDFPreviewDialog } from "@/components/purchase/pdf-preview-dialog";

// Animation Variants
const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
};

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
        const target = e.target as HTMLElement;
        if (target.closest('[data-clear-btn]')) return;

        try {
            inputRef.current?.showPicker();
        } catch {
            inputRef.current?.focus();
            inputRef.current?.click();
        }
    };

    return (
        <div
            className="group relative inline-flex items-center gap-1.5 cursor-pointer select-none px-3 py-1.5 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50"
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

/* ── Progress Ring for Pending Analytics ─────────────── */
function ProgressRing({
    percentage,
    label,
    sublabel,
    colorClass,
}: {
    percentage: number;
    label: string;
    sublabel: string;
    colorClass: string;
}) {
    const radius = 36;
    const strokeWidth = 6;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <div className="flex flex-col items-center justify-center p-4 bg-card/60 backdrop-blur-md rounded-xl border border-border/50 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        className="text-muted/10 stroke-current"
                        strokeWidth={strokeWidth}
                        fill="transparent"
                    />
                    <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        className={cn("stroke-current transition-all duration-500 ease-in-out", colorClass)}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        fill="transparent"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-base font-extrabold tracking-tight">{percentage}%</span>
                    <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold">Pending</span>
                </div>
            </div>
            <div className="text-center mt-3.5">
                <h4 className="text-xs font-bold text-foreground truncate max-w-[120px]">{label}</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>
            </div>
        </div>
    );
}

export function ManagerDashboardView() {
    const router = useRouter();

    // Global Sidebar/Tasks State
    const { isStickyNotesOpen, setIsStickyNotesOpen } = useChatWidth();

    // ── Global Filters ──
    const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
    const [globalDate, setGlobalDate] = useState<Date | null>(null);

    // ── Section 2: User Activity Filters ──
    const [selectedUserId, setSelectedUserId] = useState<string>("all");
    const [userActivityDate, setUserActivityDate] = useState<Date | null>(null);

    // ── Section 3: Followups Filters ──
    const [followupSearch, setFollowupSearch] = useState("");
    const [followupFilterStatus, setFollowupFilterStatus] = useState<"all" | "taken" | "pending">("all");
    const [followupPage, setFollowupPage] = useState(1);
    const [followupViewMode, setFollowupViewMode] = useState<"table" | "card">("table");
 
    // ── PDF Preview States ──
    const [pdfPreviewPoNumber, setPdfPreviewPoNumber] = useState<string | null>(null);
    const [pdfPreviewRequestId, setPdfPreviewRequestId] = useState<string | null>(null);
 
    // ── Data Queries ──
    const projects = useQuery(api.projects.getAllProjects, {});
    const requestsQuery = useQuery(api.requests.getAllRequests, {});
    const purchaseOrdersQuery = useQuery(api.purchaseOrders.getAllPurchaseOrders, {});
    const deliveriesQuery = useQuery(api.deliveries.getAllDeliveries, {});
    const vendorsQuery = useQuery(api.vendors.getAllVendors, {});
    const allUsers = useQuery(api.users.getAllUsers, {}) || [];
    const stickyNotesQuery = useQuery(api.stickyNotes.list, { includeCompleted: true });

    // ── Mutations ──
    const updateLastTalkDate = useMutation(api.requests.updateLastTalkDate);
    const updateLastTalkText = useMutation(api.requests.updateLastTalkText);
    const completeTask = useMutation(api.stickyNotes.complete);

    // Data Load State
    const isLoading = requestsQuery === undefined || purchaseOrdersQuery === undefined || deliveriesQuery === undefined;
    const requests = requestsQuery || [];
    const purchaseOrders = purchaseOrdersQuery || [];
    const deliveries = deliveriesQuery || [];

    // Filter workers (SEs and POs) for select dropdown
    const workers = useMemo(() => {
        return allUsers.filter(u => u.role !== "manager" && u.isActive);
    }, [allUsers]);

    // Effective Date for User Section
    const effectiveUserDate = userActivityDate || globalDate;

    // Selected worker details
    const selectedUser = useMemo(() => {
        return workers.find(w => w._id === selectedUserId);
    }, [workers, selectedUserId]);

    // ============================================================================
    // SECTION 1: Process States Computation
    // ============================================================================
    const processStates = useMemo(() => {
        let reqs = requests;
        let pos = purchaseOrders;
        let dcs = deliveries;

        // Filter by Project
        if (selectedProjectId !== "all") {
            reqs = reqs.filter(r => r.projectId === selectedProjectId);
            pos = pos.filter(p => p.projectId === selectedProjectId);
            dcs = dcs.filter(d => {
                if (d.poId) {
                    const po = purchaseOrders.find(p => p._id === d.poId);
                    return po?.projectId === selectedProjectId;
                }
                return true;
            });
        }

        // Filter by Date
        if (globalDate) {
            reqs = reqs.filter(r => isSameDay(new Date(r.createdAt), globalDate));
            pos = pos.filter(p => isSameDay(new Date(p.createdAt), globalDate));
            dcs = dcs.filter(d => isSameDay(new Date(d.createdAt), globalDate));
        }

        const ccPending = reqs.filter(r => r.status === "cc_pending").length;
        const poSignPending = reqs.filter(r => r.status === "sign_pending").length;
        const activeDCs = dcs.filter(d => d.status === "pending").length;

        return { ccPending, poSignPending, activeDCs };
    }, [requests, purchaseOrders, deliveries, selectedProjectId, globalDate]);

    const processCards = [
        {
            title: "CC Pending Approval",
            value: processStates.ccPending,
            subtitle: "Cost Comparisons awaiting manager review",
            icon: Clock,
            borderColor: "border-l-amber-500",
            bgTint: "bg-amber-500/5",
            iconColor: "text-amber-500",
            href: "/dashboard/manager/requests?status=cc_pending&work_filter=all",
        },
        {
            title: "PO Sign Pending",
            value: processStates.poSignPending,
            subtitle: "Purchase Orders waiting manager signature",
            icon: PenLine,
            borderColor: "border-l-blue-500",
            bgTint: "bg-blue-500/5",
            iconColor: "text-blue-500",
            href: "/dashboard/manager/requests?status=sign_pending&work_filter=all",
        },
        {
            title: "Active Challans",
            value: processStates.activeDCs,
            subtitle: "Delivery Challans currently in dispatch",
            icon: PackageCheck,
            borderColor: "border-l-indigo-500",
            bgTint: "bg-indigo-500/5",
            iconColor: "text-indigo-500",
            href: "/dashboard/manager/requests?status=out_for_delivery,ready_for_delivery,delivery_processing,delivery_stage&work_filter=all",
        },
    ];

    // ============================================================================
    // SECTION 2: User Activity & Analytics Section
    // ============================================================================
    const userAnalytics = useMemo(() => {
        const isPO = selectedUser ? selectedUser.role === "purchase_officer" : false;

        // CCs list:
        const ccs = requests.filter(r => {
            const matchesUser = selectedUserId === "all" ? true : (isPO ? true : r.createdBy === selectedUserId);
            const matchesDate = !effectiveUserDate || isSameDay(new Date(r.createdAt), effectiveUserDate);
            const matchesProject = selectedProjectId === "all" || r.projectId === selectedProjectId;
            return matchesUser && matchesDate && matchesProject && ["ready_for_cc", "cc_pending", "cc_approved", "cc_rejected", "ready_for_po"].includes(r.status);
        });

        // POs list:
        const pos = purchaseOrders.filter(po => {
            const matchesUser = selectedUserId === "all"
                ? true
                : (isPO 
                    ? po.createdBy === selectedUserId 
                    : requests.some(r => r._id === po.requestId && r.createdBy === selectedUserId));
            const matchesDate = !effectiveUserDate || isSameDay(new Date(po.createdAt), effectiveUserDate);
            const matchesProject = selectedProjectId === "all" || po.projectId === selectedProjectId;
            return matchesUser && matchesDate && matchesProject;
        });

        // DCs list:
        const dcs = deliveries.filter(dc => {
            const matchesUser = selectedUserId === "all"
                ? true
                : (isPO ? dc.createdBy === selectedUserId : false);
            const matchesDate = !effectiveUserDate || isSameDay(new Date(dc.createdAt), effectiveUserDate);
            let matchesProject = true;
            if (selectedProjectId !== "all") {
                matchesProject = false;
                if (dc.poId) {
                    const po = purchaseOrders.find(p => p._id === dc.poId);
                    if (po?.projectId === selectedProjectId) matchesProject = true;
                }
            }
            return matchesUser && matchesDate && matchesProject;
        });

        const pendingCC = ccs.filter(r => ["ready_for_cc", "cc_pending"].includes(r.status)).length;
        const pendingPO = pos.filter(po => ["pending_approval", "sign_pending"].includes(po.status)).length;
        const pendingDC = dcs.filter(dc => dc.status === "pending").length;

        const ccPct = ccs.length > 0 ? Math.round((pendingCC / ccs.length) * 100) : 0;
        const poPct = pos.length > 0 ? Math.round((pendingPO / pos.length) * 100) : 0;
        const dcPct = dcs.length > 0 ? Math.round((pendingDC / dcs.length) * 100) : 0;

        return {
            ccPct,
            poPct,
            dcPct,
            totalCC: ccs.length,
            totalPO: pos.length,
            totalDC: dcs.length
        };
    }, [requests, purchaseOrders, deliveries, selectedUserId, selectedUser, effectiveUserDate, selectedProjectId]);

    // Tasks checklist breakdown for selected user
    const userTasks = useMemo(() => {
        if (!stickyNotesQuery || !selectedUserId) return [];
        return stickyNotesQuery.filter(task => 
            !task.isDeleted &&
            (selectedUserId === "all" ? true : task.assignedTo === selectedUserId) &&
            (!effectiveUserDate || isSameDay(new Date(task.dueDate || task.createdAt), effectiveUserDate))
        );
    }, [stickyNotesQuery, selectedUserId, effectiveUserDate]);

    // Handle task completion toggle
    const handleToggleTask = async (taskId: Id<"stickyNotes">, currentStatus: boolean) => {
        try {
            await completeTask({ noteId: taskId, isCompleted: !currentStatus });
            toast.success(`Task marked as ${!currentStatus ? 'completed' : 'incomplete'}`);
        } catch {
            toast.error("Failed to update task status");
        }
    };

    // ============================================================================
    // SECTION 3: Vendor Follow-ups
    // ============================================================================
    const followupGroups = useMemo(() => {
        let baseReqs = requests || [];
        if (selectedProjectId !== "all") {
            baseReqs = baseReqs.filter(r => r.projectId === selectedProjectId);
        }

        // Only show requests in pending_po or sign_pending
        let pendingReqs = baseReqs.filter(r => r.status === "pending_po" || r.status === "sign_pending");

        // Group by PO number / request number
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
            if (totalAmount === 0 && firstItem.poNumber) {
                const pos = purchaseOrders.filter((p: any) => p.poNumber === firstItem.poNumber);
                totalAmount = pos.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0);
            }
            return { key, items, firstItem, totalAmount, poNumber: firstItem.poNumber, requestNumber: firstItem.requestNumber };
        });

        // Filter by selected user: PO created by PO, or requests created by SE
        if (selectedUserId !== "all" && selectedUser) {
            const isPO = selectedUser.role === "purchase_officer";
            groups = groups.filter(g => {
                if (isPO) {
                    const po = purchaseOrders.find(p => p.poNumber === g.poNumber);
                    return po?.createdBy === selectedUserId;
                } else {
                    return g.firstItem.createdBy === selectedUserId;
                }
            });
        }

        // Apply Followup Status Segment filter
        if (followupFilterStatus === "taken") {
            groups = groups.filter(g => (g.firstItem as any).lastTalkDate);
        } else if (followupFilterStatus === "pending") {
            groups = groups.filter(g => !(g.firstItem as any).lastTalkDate);
        }

        // Apply search query
        if (followupSearch.trim()) {
            const query = followupSearch.toLowerCase().trim();
            groups = groups.filter(g =>
                (g.poNumber || "").toLowerCase().includes(query) ||
                (g.requestNumber || "").toLowerCase().includes(query) ||
                (g.firstItem.itemName || "").toLowerCase().includes(query)
            );
        }

        return groups.sort((a, b) => {
            const aDate = (a.firstItem as any).lastTalkDate ?? a.firstItem.requiredBy ?? a.firstItem.createdAt;
            const bDate = (b.firstItem as any).lastTalkDate ?? b.firstItem.requiredBy ?? b.firstItem.createdAt;
            return aDate - bDate;
        });
    }, [requests, purchaseOrders, selectedUserId, selectedUser, followupFilterStatus, followupSearch, selectedProjectId]);

    // ============================================================================
    // SECTION 4: Purchase Trend Analytics Computation
    // ============================================================================
    const chartData = useMemo(() => {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthlyVolume: Record<string, number> = {};

        const currentMonth = new Date().getMonth();
        for (let i = 0; i <= currentMonth; i++) {
            monthlyVolume[months[i]] = 0;
        }

        // Aggregate real POs
        purchaseOrders.forEach(po => {
            if (selectedProjectId !== "all" && po.projectId !== selectedProjectId) return;
            const date = new Date(po.createdAt);
            if (date.getFullYear() === new Date().getFullYear()) {
                const m = months[date.getMonth()];
                if (monthlyVolume[m] !== undefined) {
                    monthlyVolume[m] += po.totalAmount || 0;
                }
            }
        });

        const data = Object.entries(monthlyVolume).map(([name, value]) => ({
            name,
            value: Math.round(value),
        }));

        // Fallback demo data if no volume
        const allZero = data.every(d => d.value === 0);
        if (allZero) {
            return [
                { name: 'Jan', value: 45000 },
                { name: 'Feb', value: 72000 },
                { name: 'Mar', value: 98000 },
                { name: 'Apr', value: 54000 },
                { name: 'May', value: 81000 },
                { name: 'Jun', value: 123000 },
                { name: 'Jul', value: 149000 },
                { name: 'Aug', value: 110000 },
                { name: 'Sep', value: 95000 },
                { name: 'Oct', value: 135000 },
                { name: 'Nov', value: 160000 },
                { name: 'Dec', value: 210000 },
            ].slice(0, currentMonth + 1);
        }

        return data;
    }, [purchaseOrders, selectedProjectId]);

    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                    <p className="text-muted-foreground animate-pulse">Loading System Data...</p>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-6 pt-2 pb-10 relative"
        >
            {/* Header section with Global Filters */}
            <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl shadow-sm overflow-hidden p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/75">
                            Executive Overview
                        </h1>
                        <p className="text-muted-foreground mt-1 text-sm font-medium flex items-center gap-2">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Manager Dashboard Operational Context
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Project selector */}
                        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                            <SelectTrigger className="h-9 w-[180px] text-xs bg-card border-border/60">
                                <FolderKanban className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                                <SelectValue placeholder="All Projects" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Projects</SelectItem>
                                {projects?.map((p) => (
                                    <SelectItem key={p._id} value={p._id}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Global Date selector */}
                        <InlineDateFilter
                            value={globalDate}
                            onChange={setGlobalDate}
                            label="Global Date:"
                        />
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════
                SECTION 1: PROCESS STATES
            ═══════════════════════════════════════════════ */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/10">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                            <Activity className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold">Process States</h3>
                            <p className="text-xs text-muted-foreground">Actionable managerial checkpoints</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border/40">
                    {processCards.map((card) => (
                        <div
                            key={card.title}
                            className={cn(
                                "flex flex-col justify-between p-5 border-l-[3px] bg-card hover:bg-muted/15 transition-all group cursor-pointer",
                                card.borderColor,
                                card.bgTint
                            )}
                            onClick={() => router.push(card.href)}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    {card.title}
                                </p>
                                <div
                                    className={cn(
                                        "flex items-center justify-center h-8 w-8 rounded-lg bg-background border border-border/40",
                                        card.iconColor
                                    )}
                                >
                                    <card.icon className="h-4 w-4" />
                                </div>
                            </div>
                            <div className="text-3xl font-extrabold tracking-tight mb-1">{card.value}</div>
                            <div className="flex items-center justify-between mt-2">
                                <p className="text-xs text-muted-foreground line-clamp-1">{card.subtitle}</p>
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary flex items-center gap-0.5 shrink-0">
                                    View <ChevronRight className="h-3 w-3" />
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════
                SECTION 2: USER ACTIVITY & ANALYTICS
            ═══════════════════════════════════════════════ */}
            <div className="grid gap-6 lg:grid-cols-12">
                {/* Donut percentage rings */}
                <div className="lg:col-span-5 rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col justify-between">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/10 gap-3">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-semibold">User Activity & Analytics</h3>
                        </div>
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                            <SelectTrigger className="h-8 w-[160px] text-xs bg-background border-border/60">
                                <SelectValue placeholder="Select User" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Users</SelectItem>
                                {workers.map(w => (
                                    <SelectItem key={w._id} value={w._id}>
                                        {w.fullName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
 
                    <div className="p-5 flex-1 flex flex-col justify-center">
                        <div className="grid grid-cols-3 gap-3">
                            <ProgressRing
                                percentage={userAnalytics.ccPct}
                                label="CC Pipeline"
                                sublabel={`${userAnalytics.totalCC} total items`}
                                colorClass="text-amber-500"
                            />
                            <ProgressRing
                                percentage={userAnalytics.poPct}
                                label="PO Pipeline"
                                sublabel={`${userAnalytics.totalPO} total orders`}
                                colorClass="text-blue-500"
                            />
                            <ProgressRing
                                percentage={userAnalytics.dcPct}
                                label="DC Pipeline"
                                sublabel={`${userAnalytics.totalDC} total dispatches`}
                                colorClass="text-indigo-500"
                            />
                        </div>
                    </div>
                </div>
 
                {/* User Task Breakdown Checklist */}
                <div className="lg:col-span-7 rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col justify-between">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/10">
                        <div className="flex items-center gap-2">
                            <ListChecks className="h-4 w-4 text-primary" />
                            <div>
                                <h3 className="text-sm font-semibold">User Task Breakdown</h3>
                                <p className="text-xs text-muted-foreground">Sticky Notes checklist for the chosen date</p>
                            </div>
                        </div>
                        <InlineDateFilter
                            value={userActivityDate}
                            onChange={setUserActivityDate}
                            label="Filter Date:"
                        />
                    </div>
 
                    <div className="p-5 flex-1 overflow-y-auto max-h-[220px]">
                        {userTasks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                                <CheckCircle2 className="h-8 w-8 opacity-25" />
                                <p className="text-xs">No tasks recorded for this date.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {userTasks.map((task) => {
                                    const assignee = allUsers.find(u => u._id === task.assignedTo);
                                    return (
                                        <div
                                            key={task._id}
                                            className={cn(
                                                "flex items-start justify-between p-3 rounded-lg border bg-background/50 hover:bg-background/80 transition-all",
                                                task.isCompleted && "border-emerald-500/20 bg-emerald-500/[0.01]"
                                            )}
                                        >
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                <button
                                                    onClick={() => handleToggleTask(task._id, task.isCompleted)}
                                                    className={cn(
                                                        "mt-0.5 flex h-4.5 w-4.5 items-center justify-center rounded border border-muted-foreground/30 hover:border-primary transition-all",
                                                        task.isCompleted && "bg-emerald-500 border-emerald-500 text-white"
                                                    )}
                                                >
                                                    {task.isCompleted && <Check className="h-3 w-3" strokeWidth={3} />}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <p className={cn(
                                                        "text-xs font-semibold leading-none truncate",
                                                        task.isCompleted && "line-through text-muted-foreground"
                                                    )}>
                                                        {task.title}
                                                    </p>
                                                    {task.content && (
                                                        <p className={cn(
                                                            "text-[10px] text-muted-foreground mt-1 line-clamp-1",
                                                            task.isCompleted && "text-muted-foreground/60"
                                                        )}>
                                                            {task.content}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 ml-3">
                                                {selectedUserId === "all" && assignee && (
                                                    <Badge variant="outline" className="text-[9px] font-medium text-slate-400 border-slate-500/20 bg-slate-500/5 py-0 px-1.5 shrink-0">
                                                        {assignee.fullName}
                                                    </Badge>
                                                )}
                                                {task.priority && (
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "text-[9px] uppercase tracking-wider font-semibold py-0 px-1.5 shrink-0",
                                                            task.priority === "high" && "text-red-500 border-red-500/20 bg-red-500/5",
                                                            task.priority === "medium" && "text-amber-500 border-amber-500/20 bg-amber-500/5",
                                                            task.priority === "low" && "text-blue-500 border-blue-500/20 bg-blue-500/5"
                                                        )}
                                                    >
                                                        {task.priority}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════
                SECTION 3: VENDOR FOLLOW-UPS
            ═══════════════════════════════════════════════ */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/10 gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-orange-500/10">
                            <MessageSquare className="h-4 w-4 text-orange-500" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold">Vendor Follow-ups</h3>
                            <p className="text-xs text-muted-foreground">PO communication updates for selected user</p>
                        </div>
                    </div>
 
                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                        {/* Dropdown status filter */}
                        <Select 
                            value={followupFilterStatus} 
                            onValueChange={(val: any) => { setFollowupFilterStatus(val); setFollowupPage(1); }}
                        >
                            <SelectTrigger className="h-8 w-[140px] text-xs bg-background border-border/60">
                                <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Follow-ups</SelectItem>
                                <SelectItem value="taken">Taken</SelectItem>
                                <SelectItem value="pending">Not Taken</SelectItem>
                            </SelectContent>
                        </Select>
 
                        {/* Search followups */}
                        <div className="relative w-full sm:w-48">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                value={followupSearch}
                                onChange={e => { setFollowupSearch(e.target.value); setFollowupPage(1); }}
                                placeholder="Search POs..."
                                className="h-8 pl-8 text-xs bg-background border-border/60"
                            />
                        </div>

                        <Button variant="outline" size="icon" onClick={() => setFollowupViewMode(v => v === "card" ? "table" : "card")} className="h-8 w-8 flex-shrink-0 bg-background border-border/60" title={`Switch to ${followupViewMode === "card" ? "table" : "card"} view`}>
                            {followupViewMode === "card" ? <Table2 className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
                        </Button>
                    </div>
                </div>
 
                {followupViewMode === "card" ? (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-muted/5">
                        {followupGroups.length === 0 ? (
                            <div className="col-span-full py-8 text-center text-xs text-muted-foreground">
                                No pending follow-ups match filters.
                            </div>
                        ) : (
                            followupGroups.slice((followupPage - 1) * 5, followupPage * 5).map((g) => {
                                const proj = projects?.find(p => p._id === g.firstItem.projectId);
                                const vendor = vendorsQuery?.find(v => v._id === g.firstItem.selectedVendorId);
                                const requiredDate = g.firstItem.requiredBy ? fmtDate(g.firstItem.requiredBy) : "—";
                                const daysLeft = g.firstItem.requiredBy
                                    ? Math.ceil((g.firstItem.requiredBy - Date.now()) / 86400000)
                                    : null;
                                const isUrgent = daysLeft !== null && daysLeft <= 3;
                                const isWarning = daysLeft !== null && daysLeft > 3 && daysLeft <= 7;
                                return (
                                    <div key={g.key} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-all relative">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="font-bold font-mono text-primary/90 text-sm">
                                                    {g.poNumber || g.requestNumber || "—"}
                                                </span>
                                                <p className="font-semibold text-foreground text-xs mt-1">{proj?.name || "No Project"}</p>
                                                <p className="text-[10px] text-muted-foreground">{vendor?.companyName || "Unknown Vendor"}</p>
                                            </div>
                                            <div className="text-right flex flex-col items-end">
                                                <span className="text-xs font-medium">{requiredDate}</span>
                                                {isUrgent && <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider mt-0.5">Urgent</span>}
                                                {isWarning && !isUrgent && <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider mt-0.5">{daysLeft}d left</span>}
                                            </div>
                                        </div>
                                        
                                        <div className="bg-muted/30 p-2 rounded-md flex flex-col gap-1 max-h-24 overflow-y-auto">
                                            {g.items.map((item: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between text-[11px]">
                                                    <span className="font-semibold text-foreground truncate mr-2">{item.itemName}</span>
                                                    <span className="text-muted-foreground font-mono shrink-0">({item.quantity} {item.unit || "nos"})</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="pt-1">
                                            <EditableTalk
                                                dateValue={(g.firstItem as any).lastTalkDate}
                                                textValue={(g.firstItem as any).lastTalkText}
                                                onDateChange={async (ts) => {
                                                    try {
                                                        await Promise.all(g.items.map(item => 
                                                            updateLastTalkDate({ requestId: item._id, lastTalkDate: ts })
                                                        ));
                                                        toast.success("Follow-up date updated");
                                                    } catch {
                                                        toast.error("Failed to update follow-up date");
                                                    }
                                                }}
                                                onTextChange={async (txt) => {
                                                    try {
                                                        await Promise.all(g.items.map(item => 
                                                            updateLastTalkText({ requestId: item._id, lastTalkText: txt })
                                                        ));
                                                        toast.success("Follow-up notes updated");
                                                    } catch {
                                                        toast.error("Failed to update follow-up notes");
                                                    }
                                                }}
                                            />
                                        </div>

                                        <div className="mt-auto pt-3 border-t border-border/40 flex justify-end">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-[11px] px-2.5 gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-400 w-full"
                                                onClick={() => {
                                                    if (g.poNumber) {
                                                        setPdfPreviewPoNumber(g.poNumber);
                                                        setPdfPreviewRequestId(g.firstItem._id);
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
                            })
                        )}
                    </div>
                ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                <th className="px-5 py-3">PO / Request ID</th>
                                <th className="px-5 py-3">Project / Vendor</th>
                                <th className="px-5 py-3">Required Date</th>
                                <th className="px-5 py-3">Item Details</th>
                                <th className="px-5 py-3 w-[260px]">Follow-up Notes / Talk Date</th>
                                <th className="px-5 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {followupGroups.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                                        No pending follow-ups match filters.
                                    </td>
                                </tr>
                            ) : (
                                followupGroups.slice((followupPage - 1) * 5, followupPage * 5).map((g) => {
                                    const proj = projects?.find(p => p._id === g.firstItem.projectId);
                                    const vendor = vendorsQuery?.find(v => v._id === g.firstItem.selectedVendorId);
                                    const requiredDate = g.firstItem.requiredBy ? fmtDate(g.firstItem.requiredBy) : "—";
                                    const daysLeft = g.firstItem.requiredBy
                                        ? Math.ceil((g.firstItem.requiredBy - Date.now()) / 86400000)
                                        : null;
                                    const isUrgent = daysLeft !== null && daysLeft <= 3;
                                    const isWarning = daysLeft !== null && daysLeft > 3 && daysLeft <= 7;
                                    return (
                                        <tr key={g.key} className="hover:bg-muted/10 transition-colors text-xs">
                                            <td className="px-5 py-4 font-bold font-mono text-primary/90 text-base">
                                                {g.poNumber || g.requestNumber || "—"}
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="font-semibold text-foreground">{proj?.name || "No Project"}</p>
                                                <p className="text-[10px] text-muted-foreground">{vendor?.companyName || "Unknown Vendor"}</p>
                                            </td>
                                            <td className="px-5 py-4 font-medium">
                                                <div>{requiredDate}</div>
                                                {isUrgent && (
                                                    <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider block mt-0.5">Urgent</span>
                                                )}
                                                {isWarning && !isUrgent && (
                                                    <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider block mt-0.5">{daysLeft}d left</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-col gap-1 max-w-[220px]">
                                                    {g.items.map((item: any, idx: number) => (
                                                        <div key={idx} className="flex items-center gap-1.5 text-[11px] truncate">
                                                            <span className="font-semibold text-foreground">{item.itemName}</span>
                                                            <span className="text-muted-foreground font-mono">({item.quantity} {item.unit || "nos"})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <EditableTalk
                                                    dateValue={(g.firstItem as any).lastTalkDate}
                                                    textValue={(g.firstItem as any).lastTalkText}
                                                    onDateChange={async (ts) => {
                                                        try {
                                                            // update last talk date for all requests in group
                                                            await Promise.all(g.items.map(item => 
                                                                updateLastTalkDate({ requestId: item._id, lastTalkDate: ts })
                                                            ));
                                                            toast.success("Follow-up date updated");
                                                        } catch {
                                                            toast.error("Failed to update follow-up date");
                                                        }
                                                    }}
                                                    onTextChange={async (txt) => {
                                                        try {
                                                            // update last talk text for all requests in group
                                                            await Promise.all(g.items.map(item => 
                                                                updateLastTalkText({ requestId: item._id, lastTalkText: txt })
                                                            ));
                                                            toast.success("Follow-up notes updated");
                                                        } catch {
                                                            toast.error("Failed to update follow-up notes");
                                                        }
                                                    }}
                                                />
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-[11px] px-2.5 gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-400"
                                                    onClick={() => {
                                                        if (g.poNumber) {
                                                            setPdfPreviewPoNumber(g.poNumber);
                                                            setPdfPreviewRequestId(g.firstItem._id);
                                                        } else {
                                                            toast.info("No PO number assigned yet");
                                                        }
                                                    }}
                                                >
                                                    <Eye className="h-3 w-3" /> View PO
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                )}
                {followupGroups.length > 5 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-border/60 bg-muted/5">
                        <div className="text-xs text-muted-foreground">
                            Showing {Math.min((followupPage - 1) * 5 + 1, followupGroups.length)} to {Math.min(followupPage * 5, followupGroups.length)} of {followupGroups.length} follow-ups
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs bg-background"
                                disabled={followupPage === 1}
                                onClick={(e) => { e.stopPropagation(); setFollowupPage(p => Math.max(1, p - 1)); }}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs bg-background"
                                disabled={followupPage >= Math.ceil(followupGroups.length / 5)}
                                onClick={(e) => { e.stopPropagation(); setFollowupPage(p => p + 1); }}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════
                SECTION 4: PURCHASE TREND AREA CHART
            ═══════════════════════════════════════════════ */}
            <div 
                className="rounded-xl border border-border bg-card shadow-sm overflow-hidden cursor-pointer hover:border-primary/30 hover:shadow-md transition-all group"
                onClick={() => router.push("/dashboard/manager/requests?show_pending_po=true")}
            >
                <CardHeader className="pb-4 pt-6 border-b border-border/50 bg-muted/5 flex flex-col items-center justify-center space-y-2 relative">
                    <div className="text-center">
                        <CardTitle className="text-2xl font-bold tracking-tight group-hover:text-primary transition-colors">Purchase Trend Analytics</CardTitle>
                        <CardDescription className="text-sm mt-1">Volume of purchase orders approved by month</CardDescription>
                    </div>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">Click to view pending POs</span>
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-xs font-semibold px-3 py-1">
                            Current Year
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="pl-0 pr-4 pb-4 pt-6">
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 15, right: 15, left: 10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.2} />
                                <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tick={{ dy: 10 }} />
                                <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} tick={{ dx: -10 }} />
                                <Tooltip
                                    formatter={(value: any) => [`₹${value.toLocaleString("en-IN")}`, 'Purchase Volume']}
                                    contentStyle={{ 
                                        borderRadius: '12px', 
                                        border: '1px solid hsl(var(--border)/0.5)', 
                                        backgroundColor: 'hsl(var(--popover))', 
                                        color: 'hsl(var(--popover-foreground))',
                                        backdropFilter: 'blur(8px)', 
                                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)' 
                                    }}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="value" 
                                    stroke="hsl(var(--primary))" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorVolume)" 
                                    dot={{ r: 4, strokeWidth: 1, stroke: "hsl(var(--primary))", fill: "hsl(var(--background))" }}
                                    activeDot={{ r: 6, strokeWidth: 0, fill: "hsl(var(--primary))" }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </div>
 
            {/* PO PDF Preview Dialog */}
            <PDFPreviewDialog
                open={!!pdfPreviewPoNumber}
                onOpenChange={(open) => {
                    if (!open) {
                        setPdfPreviewPoNumber(null);
                        setPdfPreviewRequestId(null);
                    }
                }}
                poNumber={pdfPreviewPoNumber!}
                requestId={pdfPreviewRequestId!}
                type="po"
            />
        </motion.div>
    );
}
