"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Trash2, History, Package } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/use-user-role";
import { ROLES } from "@/lib/auth/roles";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

interface VendorHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: Id<"vendors"> | null;
}

export function VendorHistoryDialog({ open, onOpenChange, vendorId }: VendorHistoryDialogProps) {
  const userRole = useUserRole();
  const isManager = userRole === ROLES.MANAGER;

  const history = useQuery(api.vendors.getVendorHistory, vendorId ? { vendorId } : "skip");
  const deleteNote = useMutation(api.requests.deleteRequestNote);

  const [deletingLogs, setDeletingLogs] = useState<Set<Id<"request_notes">>>(new Set());

  const handleDeleteLog = async (logId: Id<"request_notes">) => {
    if (!isManager) return;
    setDeletingLogs(prev => new Set(prev).add(logId));
    try {
      await deleteNote({ noteIds: [logId] });
      toast.success("Log deleted");
    } catch (error) {
      toast.error("Failed to delete log");
    } finally {
      setDeletingLogs(prev => {
        const next = new Set(prev);
        next.delete(logId);
        return next;
      });
    }
  };

  if (!vendorId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-muted-foreground" />
            Vendor History
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 p-6">
          {history === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto opacity-20 mb-3" />
              <p>No completed purchase orders found for this vendor.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {history.map((record) => (
                <div key={record.poId} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/30 p-4 border-b">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h4 className="font-semibold text-base mb-1">{record.material}</h4>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>PO: {record.poNumber}</span>
                          {record.site && <span>Site: {record.site}</span>}
                          {record.grnNumbers && <span>GRN: {record.grnNumbers}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-card">
                    {record.logs.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No follow-up logs recorded.</p>
                    ) : (
                      <div className="space-y-3">
                        {record.logs.map((log) => (
                          <div key={log._id} className="flex gap-3 text-sm group">
                            <div className="w-[120px] shrink-0 text-muted-foreground text-xs pt-0.5">
                              {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm")}
                            </div>
                            <div className="flex-1">
                              <p className="whitespace-pre-wrap">{log.content}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">by {log.userName}</p>
                            </div>
                            {isManager && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteLog(log._id as Id<"request_notes">)}
                                disabled={deletingLogs.has(log._id as Id<"request_notes">)}
                              >
                                {deletingLogs.has(log._id as Id<"request_notes">) ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
