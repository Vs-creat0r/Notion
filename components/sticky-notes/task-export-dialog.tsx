"use client";

/**
 * Task Export Dialog
 *
 * Modal with checkboxes letting the manager choose what to export:
 *  ✅ My Tasks
 *  ✅ Assigned by Me
 *  ✅ All Tasks
 *
 * Generates a professional Excel with task details, priority colors,
 * status indicators, and auto-filters.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import {
  exportToExcel,
  fmtExcelDate,
  EXCEL_THEME,
  type ExcelColumn,
  type CellColorOverride,
} from "@/lib/excel-export";
import { format } from "date-fns";

interface TaskExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allNotes: any[];
  currentUserId: string;
  isManager: boolean;
}

const PRIORITY_COLORS: Record<string, { bg: string; font: string }> = {
  high:   { bg: "FEE2E2", font: "991B1B" },   // red
  medium: { bg: "FEF3C7", font: "92400E" },   // amber
  low:    { bg: "DBEAFE", font: "1E40AF" },    // blue
};

const STATUS_COLORS: Record<string, { bg: string; font: string }> = {
  active:    { bg: "DCFCE7", font: "166534" },  // green
  completed: { bg: "E0E7FF", font: "3730A3" },  // indigo
  overdue:   { bg: "FEE2E2", font: "991B1B" },  // red
};

export function TaskExportDialog({
  open,
  onOpenChange,
  allNotes,
  currentUserId,
  isManager,
}: TaskExportDialogProps) {
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(
    new Set(["my_tasks"])
  );
  const [isExporting, setIsExporting] = useState(false);

  const toggleFilter = (key: string) => {
    setSelectedFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const filterOptions = [
    {
      key: "my_tasks",
      label: "My Tasks",
      description: "Tasks assigned to me",
    },
    {
      key: "assigned_by_me",
      label: "Assigned by Me",
      description: "Tasks I created and assigned to others",
    },
    {
      key: "all_tasks",
      label: "All Tasks",
      description: "Every task in the system",
    },
  ];

  const handleExport = async () => {
    if (selectedFilters.size === 0) {
      toast.error("Please select at least one option");
      return;
    }
    setIsExporting(true);
    try {
      // Build filtered set
      let filteredNotes: any[] = [];

      if (selectedFilters.has("all_tasks")) {
        filteredNotes = [...allNotes];
      } else {
        const seen = new Set<string>();
        if (selectedFilters.has("my_tasks")) {
          allNotes.forEach((note) => {
            if (
              (note.assignee?._id === currentUserId ||
                note.assignedTo === currentUserId) &&
              !seen.has(note._id)
            ) {
              filteredNotes.push(note);
              seen.add(note._id);
            }
          });
        }
        if (selectedFilters.has("assigned_by_me")) {
          allNotes.forEach((note) => {
            if (
              (note.creator?._id === currentUserId ||
                note.createdBy === currentUserId) &&
              note.assignee?._id !== currentUserId &&
              note.assignedTo !== currentUserId &&
              !seen.has(note._id)
            ) {
              filteredNotes.push(note);
              seen.add(note._id);
            }
          });
        }
      }

      if (filteredNotes.length === 0) {
        toast.error("No tasks found matching your selection");
        setIsExporting(false);
        return;
      }

      // Build columns
      const columns: ExcelColumn[] = [
        { header: "S.No", key: "sno", type: "number", width: 6 },
        { header: "Title", key: "title", width: 28 },
        { header: "Description", key: "description", width: 35 },
        { header: "Priority", key: "priority", width: 10 },
        { header: "Status", key: "status", width: 12 },
        { header: "Assigned To", key: "assignedTo", width: 18 },
        { header: "Created By", key: "createdBy", width: 18 },
        { header: "Due Date", key: "dueDate", type: "date", width: 14 },
        { header: "Created Date", key: "createdDate", type: "date", width: 14 },
        { header: "Checklist Progress", key: "checklist", width: 18 },
        { header: "Reminder", key: "reminder", type: "date", width: 16 },
      ];

      // Build data
      const data = filteredNotes.map((note, idx) => {
        const checklistItems = note.checklistItems || [];
        const completed = checklistItems.filter((i: any) => i.completed).length;
        const total = checklistItems.length;
        const checklistStr = total > 0 ? `${completed}/${total} done` : "—";

        const isOverdue =
          !note.isCompleted &&
          note.dueDate &&
          new Date(note.dueDate) < new Date();

        return {
          sno: idx + 1,
          title: note.title || "—",
          description: note.content || "—",
          priority: note.priority
            ? note.priority.charAt(0).toUpperCase() + note.priority.slice(1)
            : "—",
          status: note.isCompleted
            ? "Completed"
            : isOverdue
              ? "Overdue"
              : "Active",
          assignedTo: note.assignee?.fullName || "—",
          createdBy: note.creator?.fullName || "—",
          dueDate: fmtExcelDate(note.dueDate),
          createdDate: fmtExcelDate(note.createdAt),
          checklist: checklistStr,
          reminder: note.reminderAt
            ? format(new Date(note.reminderAt), "dd MMM yy, h:mm a")
            : "—",
        };
      });

      // Build cell color overrides for Priority and Status columns
      const cellColors: CellColorOverride[] = [];
      data.forEach((row, idx) => {
        const excelRow = idx + 2; // row 1 = header

        // Priority column (col 4)
        const priorityKey = row.priority.toLowerCase();
        if (PRIORITY_COLORS[priorityKey]) {
          cellColors.push({
            row: excelRow,
            col: 4,
            bgColor: PRIORITY_COLORS[priorityKey].bg,
            fontColor: PRIORITY_COLORS[priorityKey].font,
          });
        }

        // Status column (col 5)
        const statusKey = row.status.toLowerCase();
        if (STATUS_COLORS[statusKey]) {
          cellColors.push({
            row: excelRow,
            col: 5,
            bgColor: STATUS_COLORS[statusKey].bg,
            fontColor: STATUS_COLORS[statusKey].font,
          });
        }
      });

      const count = await exportToExcel({
        fileName: "Tasks_Export",
        sheetName: "Tasks",
        columns,
        data,
        cellColors,
      });

      toast.success(`Downloaded ${count} task(s) as Excel`);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Task export failed:", err);
      toast.error("Failed to export tasks");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
            Export Tasks to Excel
          </DialogTitle>
          <DialogDescription>
            Select which tasks you want to include in the download.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {filterOptions.map((option) => (
            <label
              key={option.key}
              className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/30 hover:bg-muted/30 transition-all cursor-pointer group"
            >
              <Checkbox
                checked={selectedFilters.has(option.key)}
                onCheckedChange={() => toggleFilter(option.key)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                  {option.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </p>
              </div>
            </label>
          ))}

          {selectedFilters.size > 0 && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2.5 border border-border/40">
              <span className="font-medium text-foreground">Note:</span> The
              Excel file will include professional formatting with color-coded
              priorities, status indicators, auto-filters, and alternating row
              colors.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || selectedFilters.size === 0}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
