"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import {
    Send,
    Clock,
    FileText,
    History,
    ArrowLeft,
    CalendarDays,
    Loader2,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DailyReportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedDate: Date;
}

export function DailyReportDialog({ open, onOpenChange, selectedDate }: DailyReportDialogProps) {
    const [additionalNotes, setAdditionalNotes] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const dateStr = format(selectedDate, "yyyy-MM-dd");

    // Fetch auto-collected activities
    const activities = useQuery(api.dailyReports.getDailyActivity, { date: dateStr });

    // Fetch report history
    const reportHistory = useQuery(api.dailyReports.getMyReportHistory);

    // Send report mutation
    const saveAndSendReport = useMutation(api.dailyReports.saveAndSendReport);

    const handleSendReport = async () => {
        if (!activities) return;

        setIsSending(true);
        try {
            const result = await saveAndSendReport({
                date: dateStr,
                activities: activities.map((a) => ({
                    time: a.time,
                    action: a.action,
                    entityType: a.requestNumber ? "request" : undefined,
                    entityId: a.requestNumber || undefined,
                })),
                additionalNotes: additionalNotes.trim(),
            });

            toast.success(`Daily report sent to ${result.sentTo} manager(s)!`);
            setAdditionalNotes("");
            onOpenChange(false);
        } catch (err: any) {
            toast.error(err.message || "Failed to send report");
        } finally {
            setIsSending(false);
        }
    };

    // Check if report for today was already sent
    const alreadySent = useMemo(() => {
        if (!reportHistory) return false;
        return reportHistory.some((r) => r.reportDate === dateStr && r.sentAt);
    }, [reportHistory, dateStr]);

    if (showHistory) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon-sm" onClick={() => setShowHistory(false)}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <DialogTitle className="flex items-center gap-2">
                                <History className="h-5 w-5 text-muted-foreground" />
                                Report History
                            </DialogTitle>
                        </div>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                        {reportHistory === undefined ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : reportHistory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                                <FileText className="h-10 w-10 opacity-30" />
                                <p className="text-sm">No reports sent yet</p>
                            </div>
                        ) : (
                            reportHistory.map((report) => (
                                <div key={report._id} className="rounded-lg border border-border bg-card p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm font-semibold">
                                                {new Date(report.reportDate + "T00:00:00").toLocaleDateString("en-IN", {
                                                    day: "numeric",
                                                    month: "short",
                                                    year: "numeric",
                                                })}
                                            </span>
                                        </div>
                                        {report.sentAt && (
                                            <Badge variant="secondary" className="text-xs gap-1">
                                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                                Sent {format(new Date(report.sentAt), "h:mm a")}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {report.activities.length} activities
                                        {report.additionalNotes && " • Has notes"}
                                    </div>
                                    {report.additionalNotes && (
                                        <p className="text-xs bg-muted/50 rounded-md p-2 text-muted-foreground italic">
                                            {report.additionalNotes}
                                        </p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        Daily Report — {format(selectedDate, "dd MMM yyyy")}
                    </DialogTitle>
                </DialogHeader>

                {/* Status Banner */}
                {alreadySent && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            Report already sent for this date. Sending again will update it.
                        </span>
                    </div>
                )}

                {/* Activities List */}
                <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Auto-collected Activities
                        </h4>
                        <span className="text-xs text-muted-foreground">{activities?.length ?? 0} entries</span>
                    </div>

                    {activities === undefined ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : activities.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground border border-dashed border-border rounded-lg">
                            <AlertCircle className="h-8 w-8 opacity-30" />
                            <p className="text-sm">No activities recorded for this date</p>
                        </div>
                    ) : (
                        <div className="space-y-1 max-h-[240px] overflow-y-auto rounded-lg border border-border">
                            {activities.map((activity, idx) => (
                                <div
                                    key={activity._id}
                                    className={cn(
                                        "flex items-start gap-3 px-3 py-2.5 text-sm",
                                        idx !== activities.length - 1 && "border-b border-border/50"
                                    )}
                                >
                                    <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 mt-0.5">
                                        <Clock className="h-3 w-3" />
                                        <span className="text-xs font-mono w-[65px]">{activity.time}</span>
                                    </div>
                                    <p className="text-xs leading-relaxed flex-1">{activity.action}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Additional Notes */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Additional Notes
                    </label>
                    <Textarea
                        value={additionalNotes}
                        onChange={(e) => setAdditionalNotes(e.target.value)}
                        placeholder="Add any extra context, updates, or notes about your day..."
                        className="min-h-[80px] text-sm resize-none"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Button variant="outline" size="sm" onClick={() => setShowHistory(true)} className="gap-1.5">
                        <History className="h-4 w-4" />
                        History
                    </Button>
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSendReport}
                        disabled={isSending || activities === undefined || !additionalNotes.trim()}
                        className="gap-1.5 bg-primary hover:bg-primary/90"
                    >
                        {isSending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                        Send to Manager
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
