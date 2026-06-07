"use client";

/**
 * GRN Logs — Complete Action Audit Trail
 * 
 * Displays ALL GRN log entries across all requests.
 * Includes filters for role, status, request#, and date.
 */

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { format, isToday, isYesterday, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ExportExcelButton } from "@/components/ui/export-excel-button";
import { exportToExcel, type ExcelColumn } from "@/lib/excel-export";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useEffect } from "react";
import {
    Search,
    User,
    Filter,
    ClipboardList,
    RefreshCw,
    Calendar,
    ArrowDownNarrowWide,
    X
} from "lucide-react";

const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    recheck: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
    ready_for_cc: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    cc_pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    cc_approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    cc_rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    ready_for_po: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
    direct_po: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
    sign_pending: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    sign_rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    pending_po: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    rejected_po: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    ready_for_delivery: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
    out_for_delivery: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
    delivered: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    split_approved: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
    login: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    logout: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const roleColors: Record<string, string> = {
    site_engineer: "text-green-600 dark:text-green-400",
    manager: "text-blue-600 dark:text-blue-400",
    purchase_officer: "text-purple-600 dark:text-purple-400",
};

const roleIcons: Record<string, string> = {
    site_engineer: "🟢",
    manager: "🔵",
    purchase_officer: "🟣",
};

const roleLabels: Record<string, string> = {
    site_engineer: "Site Engineer",
    manager: "Manager",
    purchase_officer: "Purchase Officer",
};

export function GRNLogsContent() {
    const logs = useQuery(api.notes.getAllGRNLogs);
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [dateFilter, setDateFilter] = useState<Date | undefined>();

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Reset to page 1 on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, roleFilter, statusFilter, dateFilter, pageSize]);

    // Get unique statuses and roles for filter dropdowns
    const { uniqueStatuses, uniqueRoles } = useMemo(() => {
        if (!logs) return { uniqueStatuses: [] as string[], uniqueRoles: [] as string[] };
        const statuses = [...new Set(logs.map(l => l.status).filter((s): s is string => !!s))].sort();
        const roles = [...new Set(logs.map(l => l.role).filter((r): r is string => !!r))].sort();
        return { uniqueStatuses: statuses, uniqueRoles: roles };
    }, [logs]);

    // Filter logs
    const filteredLogs = useMemo(() => {
        if (!logs) return [];
        return logs.filter(log => {
            const matchesSearch = searchQuery === "" ||
                log.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                log.requestNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                log.userName.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRole = roleFilter === "all" || log.role === roleFilter;
            const matchesStatus = statusFilter === "all" || log.status === statusFilter;
            const matchesDate = !dateFilter || startOfDay(new Date(log.createdAt)).getTime() === startOfDay(dateFilter).getTime();
            return matchesSearch && matchesRole && matchesStatus && matchesDate;
        });
    }, [logs, searchQuery, roleFilter, statusFilter, dateFilter]);

    // Paginate logs
    const paginatedLogs = useMemo(() => {
        return filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    }, [filteredLogs, currentPage, pageSize]);

    // Group logs by date
    const groupedLogs = useMemo(() => {
        const groups: Record<string, typeof paginatedLogs> = {};
        paginatedLogs.forEach(log => {
            const date = startOfDay(new Date(log.createdAt));
            const key = date.getTime().toString();
            if (!groups[key]) groups[key] = [];
            groups[key].push(log);
        });
        return Object.entries(groups)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([key, logs]) => ({
                date: new Date(Number(key)),
                logs,
            }));
    }, [paginatedLogs]);

    const hasFilters = searchQuery !== "" || roleFilter !== "all" || statusFilter !== "all" || !!dateFilter;

    const clearFilters = () => {
        setSearchQuery("");
        setRoleFilter("all");
        setStatusFilter("all");
        setDateFilter(undefined);
    };

    const getDateLabel = (date: Date) => {
        if (isToday(date)) return "Today";
        if (isYesterday(date)) return "Yesterday";
        return format(date, "EEEE, do MMMM yyyy");
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2.5">
                        <ClipboardList className="h-7 w-7 text-primary" />
                        Activity Logs
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Complete action audit trail across requests and system access
                        {logs && <span className="ml-1">— {logs.length} total entries</span>}
                    </p>
                </div>
                {filteredLogs.length !== (logs?.length || 0) && (
                    <Badge variant="outline" className="text-sm px-3 py-1">
                        Showing {filteredLogs.length} of {logs?.length || 0}
                    </Badge>
                )}
                <ExportExcelButton
                    size="sm"
                    label="Download XL"
                    onExport={async () => {
                        const allLogs = filteredLogs;
                        if (allLogs.length === 0) throw new Error("No data to export");
                        const columns: ExcelColumn[] = [
                            { header: "S.No", key: "sno", type: "number", width: 6 },
                            { header: "Date", key: "date", type: "date", width: 18 },
                            { header: "Time", key: "time", width: 10 },
                            { header: "User", key: "userName", width: 18 },
                            { header: "Role", key: "role", width: 18 },
                            { header: "Request #", key: "requestNumber", width: 14 },
                            { header: "Action / Content", key: "content", width: 40 },
                            { header: "Status", key: "status", width: 16 },
                        ];
                        const data = allLogs.map((log, idx) => ({
                            sno: idx + 1,
                            date: format(new Date(log.createdAt), "dd MMM yyyy"),
                            time: format(new Date(log.createdAt), "h:mm a"),
                            userName: log.userName || "\u2014",
                            role: roleLabels[log.role] || log.role?.replace(/_/g, " ") || "\u2014",
                            requestNumber: log.requestNumber === "SYSTEM" ? "SYSTEM" : `#${log.requestNumber}`,
                            content: log.content || "\u2014",
                            status: log.status?.replace(/_/g, " ") || "\u2014",
                        }));
                        return exportToExcel({ fileName: "Activity_Logs", sheetName: "Logs", columns, data });
                    }}
                />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-xl border bg-card/50 backdrop-blur-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search logs, request #, user..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <User className="h-4 w-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="All Roles" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        {uniqueRoles.map(role => (
                            <SelectItem key={role} value={role}>
                                {roleIcons[role] || ""} {roleLabels[role] || role}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {uniqueStatuses.map(status => (
                            <SelectItem key={status} value={String(status)}>
                                {String(status).replace(/_/g, " ")}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                
                {/* Calendar Filter */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "w-full sm:w-[220px] justify-start text-left font-normal bg-background/50 backdrop-blur-sm",
                                !dateFilter && "text-muted-foreground"
                            )}
                        >
                            <Calendar className="mr-2 h-4 w-4" />
                            {dateFilter ? format(dateFilter, "PPP") : <span>Filter by date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <CalendarUI
                            mode="single"
                            selected={dateFilter}
                            onSelect={setDateFilter}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>

                {hasFilters && (
                    <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* Stats Row */}
            {logs && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="rounded-xl border p-3 bg-card/80">
                        <div className="text-2xl font-bold">{logs.length}</div>
                        <div className="text-xs text-muted-foreground">Total Logs</div>
                    </div>
                    <div className="rounded-xl border p-3 bg-card/80">
                        <div className="text-2xl font-bold">
                            {new Set(logs.map(l => l.requestNumber).filter(r => r !== "SYSTEM")).size}
                        </div>
                        <div className="text-xs text-muted-foreground">Requests Tracked</div>
                    </div>
                    <div className="rounded-xl border p-3 bg-card/80">
                        <div className="text-2xl font-bold text-green-600">
                            {logs.filter(l => l.status === "delivered").length}
                        </div>
                        <div className="text-xs text-muted-foreground">Deliveries</div>
                    </div>
                    <div className="rounded-xl border p-3 bg-card/80">
                        <div className="text-2xl font-bold text-blue-600">
                            {logs.filter(l => isToday(new Date(l.createdAt))).length}
                        </div>
                        <div className="text-xs text-muted-foreground">Activity Today</div>
                    </div>
                    <div className="rounded-xl border p-3 bg-card/80">
                        <div
                            className="text-2xl font-bold text-emerald-600 truncate cursor-help"
                            title={Array.from(new Set(logs.filter(l => l.status === "login" && isToday(new Date(l.createdAt))).map(l => l.userName))).join(", ") || "No logins today"}
                        >
                            {new Set(logs.filter(l => l.status === "login" && isToday(new Date(l.createdAt))).map(l => l.userName)).size}
                        </div>
                        <div className="text-xs text-muted-foreground">Logins Today</div>
                    </div>
                    <div className="rounded-xl border p-3 bg-card/80">
                        <div
                            className="text-2xl font-bold text-amber-600 truncate cursor-help"
                            title={Array.from(new Set(logs.filter(l => l.status === "logout" && isToday(new Date(l.createdAt))).map(l => l.userName))).join(", ") || "No logouts today"}
                        >
                            {new Set(logs.filter(l => l.status === "logout" && isToday(new Date(l.createdAt))).map(l => l.userName)).size}
                        </div>
                        <div className="text-xs text-muted-foreground">Logouts Today</div>
                    </div>
                </div>
            )}

            {/* Logs Timeline */}
            <div className="space-y-6">
                {!logs ? (
                    <div className="text-center py-20">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">Loading activity logs...</p>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="text-center py-20 space-y-3">
                        <ClipboardList className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                        <p className="text-muted-foreground font-medium">No activity logs found</p>
                        {hasFilters && (
                            <Button variant="outline" size="sm" onClick={clearFilters}>
                                Clear Filters
                            </Button>
                        )}
                    </div>
                ) : (
                    groupedLogs.map(({ date, logs: dayLogs }) => (
                        <div key={date.getTime()}>
                            {/* Date Header */}
                            <div className="flex items-center gap-3 mb-4 sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-semibold text-muted-foreground">
                                    {getDateLabel(date)}
                                </span>
                                <div className="flex-1 h-px bg-border" />
                                <Badge variant="secondary" className="text-xs">
                                    {dayLogs.length} {dayLogs.length === 1 ? "entry" : "entries"}
                                </Badge>
                            </div>

                            {/* Day Logs */}
                            <div className="space-y-2 ml-2">
                                {dayLogs.map((log, idx) => (
                                    <div
                                        key={log._id}
                                        className="flex gap-3 group relative"
                                    >
                                        {/* Timeline connector */}
                                        {idx < dayLogs.length - 1 && (
                                            <div className="absolute left-[19px] top-10 bottom-[-8px] w-0.5 bg-border/50" />
                                        )}

                                        {/* Avatar */}
                                        <Avatar className={cn(
                                            "h-10 w-10 border-2 shadow-sm z-10 shrink-0 transition-all",
                                            "border-background group-hover:border-primary/20"
                                        )}>
                                            <AvatarFallback className={cn(
                                                "text-xs font-bold",
                                                log.role === "site_engineer" && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                                                log.role === "manager" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                                                log.role === "purchase_officer" && "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
                                            )}>
                                                {log.userName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "??"}
                                            </AvatarFallback>
                                        </Avatar>

                                        {/* Content Card */}
                                        <div className="flex-1 min-w-0 group-hover:translate-x-0.5 transition-transform">
                                            <div className="bg-card border rounded-lg p-3 shadow-sm group-hover:shadow-md group-hover:border-primary/20 transition-all">
                                                {/* Header Row */}
                                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-xs">
                                                            {roleIcons[log.role] || "⚪"}
                                                        </span>
                                                        <span className={cn(
                                                            "font-semibold text-sm truncate",
                                                            roleColors[log.role]
                                                        )}>
                                                            {log.userName}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground hidden sm:inline">
                                                            ({roleLabels[log.role] || log.role?.replace(/_/g, " ")})
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <Badge
                                                            variant="outline"
                                                            className={cn("text-[10px] h-5 px-1.5 font-mono shrink-0",
                                                                log.requestNumber === "SYSTEM"
                                                                    ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-dashed border-slate-300 dark:border-slate-700 font-sans tracking-wide"
                                                                    : "")}
                                                        >
                                                            {log.requestNumber === "SYSTEM" ? "SYSTEM" : `#${log.requestNumber}`}
                                                        </Badge>
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <p className="text-sm leading-relaxed break-words">
                                                    {log.content}
                                                </p>

                                                {/* Footer */}
                                                <div className="flex items-center justify-between mt-2 gap-2">
                                                    {log.status && (
                                                        <Badge
                                                            className={cn(
                                                                "text-[10px] h-5 px-1.5 capitalize font-normal border-0",
                                                                statusColors[log.status] || "bg-gray-100 text-gray-700"
                                                            )}
                                                        >
                                                            {log.status.replace(/_/g, " ")}
                                                        </Badge>
                                                    )}
                                                    <span className="text-[10px] text-muted-foreground ml-auto">
                                                        {format(new Date(log.createdAt), "h:mm a")}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination Controls */}
            {filteredLogs.length > 0 && (
                <div className="mt-6 border-t pt-4">
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={Math.ceil(filteredLogs.length / pageSize)}
                        onPageChange={setCurrentPage}
                        pageSize={pageSize}
                        onPageSizeChange={setPageSize}
                        totalItems={filteredLogs.length}
                    />
                </div>
            )}
        </div>
    );
}
