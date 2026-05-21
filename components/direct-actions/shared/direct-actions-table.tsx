"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Edit, Loader2, Check, X, Plus, Eye, FileBarChart2, Truck, ShoppingCart, Search, Package } from "lucide-react";
import type { DirectActionItem } from "./types";
import { getStatusColor, getStatusLabel, formatDate, getEntityLabel, getActionButtonType } from "./utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

interface DirectActionsTableProps {
  items: DirectActionItem[];
  isLoading?: boolean;
  onEdit?: (item: DirectActionItem, resetEditingState: () => void) => void;
  onView?: (item: DirectActionItem) => void;
  onUpdateTitle?: (itemId: string, title: string) => void;
  emptyMessage?: string;
}

const typeConfig: Record<string, { icon: React.ElementType; label: string; color: string; bg: string; ring: string }> = {
  cc: { icon: FileBarChart2, label: "Cost Comparison", color: "text-violet-500", bg: "bg-violet-500/10", ring: "ring-violet-500/20" },
  po: { icon: ShoppingCart, label: "Purchase Order", color: "text-blue-500", bg: "bg-blue-500/10", ring: "ring-blue-500/20" },
  dc: { icon: Truck, label: "Delivery Challan", color: "text-emerald-500", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20" },
};

const statusStyle: Record<string, string> = {
  // CC
  draft: "bg-slate-500/10  text-slate-500  border-slate-500/20",
  cc_pending: "bg-amber-500/10  text-amber-600  border-amber-500/20",
  cc_approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cc_rejected: "bg-red-500/10    text-red-600    border-red-500/20",
  // DC
  pending: "bg-blue-500/10   text-blue-600   border-blue-500/20",
  delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cancelled: "bg-red-500/10    text-red-600    border-red-500/20",
  // PO
  pending_approval: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  sign_pending: "bg-blue-500/10   text-blue-600   border-blue-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  ordered: "bg-violet-500/10 text-violet-600  border-violet-500/20",
  rejected: "bg-red-500/10    text-red-600    border-red-500/20",
  closed: "bg-red-500/10    text-red-600    border-red-500/20",
};

export function DirectActionsTable({
  items,
  isLoading = false,
  onEdit,
  onView,
  onUpdateTitle,
  emptyMessage = "No records found",
}: DirectActionsTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");

  const resetEditingState = () => setEditingId(null);

  const handleAction = (item: DirectActionItem) => {
    const actionType = getActionButtonType(item);
    setEditingId(item.id);
    if (actionType === "edit") {
      onEdit?.(item, resetEditingState);
    } else {
      onView?.(item);
      resetEditingState();
    }
  };

  const handleStartTitleEdit = (item: DirectActionItem) => {
    setEditingTitle(item.id);
    setTitleInput(item.customTitle || "");
  };

  const handleSaveTitleEdit = (item: DirectActionItem) => {
    const newTitle = titleInput.trim();
    onUpdateTitle?.(item.id, newTitle);
    setEditingTitle(null);
    setTitleInput("");
    toast.success(newTitle ? "Title updated" : "Title removed");
  };

  const handleCancelTitleEdit = () => {
    setEditingTitle(null);
    setTitleInput("");
  };

  /* ─── Loading ─── */
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Loading records…</p>
      </div>
    );
  }

  /* ─── Empty ─── */
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-2xl border border-dashed bg-muted/20">
        <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
          <Package className="h-6 w-6 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  /* ─── Table ─── */
  return (
    <div className="rounded-2xl border overflow-hidden ring-1 ring-border/50">
      {/* Header - Hidden on mobile */}
      <div className="hidden md:grid grid-cols-[2fr_3fr_1.5fr_1.2fr_auto] bg-muted/40 border-b px-4 py-3 gap-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ID</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Title</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right min-w-[60px]">Action</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/60 bg-card">
        {items.map((item) => {
          const cfg = typeConfig[item.type] ?? typeConfig.cc;
          const Icon = cfg.icon;
          const actionType = getActionButtonType(item);
          const isEditing = editingId === item.id;
          const badge = statusStyle[item.status] ?? "bg-slate-500/10 text-slate-500 border-slate-500/20";

          return (
            <div
              key={item.id}
              className="flex flex-col md:grid md:grid-cols-[2fr_3fr_1.5fr_1.2fr_auto] md:items-center p-4 md:px-4 md:py-3 gap-3 md:gap-4 hover:bg-muted/30 transition-colors group"
            >
              {/* Top Row on Mobile (ID & Status) / ID on Desktop */}
              <div className="flex items-start md:items-center justify-between md:justify-start gap-2.5 min-w-0">
                <div className="flex items-center gap-2.5">
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ring-1", cfg.bg, cfg.ring)}>
                    <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-sm leading-none">{item.displayId}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{cfg.label}</p>
                  </div>
                </div>
                <div className="md:hidden">
                  <Badge variant="outline" className={cn("text-[11px] px-2 py-0.5 font-medium border", badge)}>
                    {getStatusLabel(item.status)}
                  </Badge>
                </div>
              </div>

              {/* Title — inline editable */}
              <div className="min-w-0">
                {editingTitle === item.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="Enter title…"
                      className="h-7 text-sm flex-1 min-w-0"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveTitleEdit(item);
                        if (e.key === "Escape") handleCancelTitleEdit();
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => handleSaveTitleEdit(item)}>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCancelTitleEdit}>
                      <X className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="min-w-0 flex-1">
                      <span className={cn("text-sm truncate block", !item.customTitle && "text-muted-foreground italic")}>
                        {item.customTitle || "No title"}
                      </span>
                      {item.mergedCount && item.mergedCount > 1 && (
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                          Merged · {item.mergedCount} items{item.mergedItemNames?.length ? `: ${item.mergedItemNames.join(", ")}` : ""}
                        </span>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleStartTitleEdit(item)}
                      title={item.customTitle ? "Edit title" : "Add title"}
                    >
                      {item.customTitle ? <Edit className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </Button>
                  </div>
                )}
              </div>

              {/* Status (Desktop only) */}
              <div className="hidden md:block">
                <Badge variant="outline" className={cn("text-[11px] px-2 py-0.5 font-medium border", badge)}>
                  {getStatusLabel(item.status)}
                </Badge>
              </div>

              {/* Bottom Row on Mobile (Date & Action) / Individual Columns on Desktop */}
              <div className="flex items-center justify-between md:contents pt-1 md:pt-0 border-t md:border-0 border-border/40">
                {/* Date */}
                <p className="text-[12px] text-muted-foreground whitespace-nowrap">{formatDate(item.createdDate)}</p>

                {/* Action */}
                <div className="flex justify-end gap-1 min-w-[70px]">
                  {actionType === "edit" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAction(item)}
                      disabled={isEditing}
                      className="h-7 text-xs gap-1 px-2.5 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span className="inline">Edit</span>
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAction(item)}
                      disabled={isEditing}
                      className="h-7 text-xs gap-1 px-2.5 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span className="inline">View</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t bg-muted/20 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{items.length}</span> record{items.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}
