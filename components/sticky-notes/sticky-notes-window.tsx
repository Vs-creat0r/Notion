/**
 * Sticky Notes Window Component
 * 
 * Main drawer panel for sticky notes with list view and create/edit functionality.
 */

"use client";

// Export the component

import { useState, useRef, useEffect } from "react";
import { isToday, isTomorrow, isYesterday, format, differenceInCalendarDays } from "date-fns";
import { Plus, Search, Check, GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StickyNoteCard } from "./sticky-note-card";
import { StickyNoteForm } from "./sticky-note-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useStickyNotes,
  useCreateStickyNote,
  useUpdateStickyNote,
  useCompleteStickyNote,
  useDeleteStickyNote,
  useMarkStickyNotesAllRead,
  useBulkCompleteTasks,
  useBulkAssignTasks,
} from "@/hooks/use-sticky-notes";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { useUserRole } from "@/hooks/use-user-role";
import { ROLES } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { TaskFilters, type ViewFilter, type PriorityFilter } from "./task-filters";
import { TaskExportDialog } from "./task-export-dialog";
import { Download } from "lucide-react";

// Draggable Note Card Component for the window
function DraggableNoteCard({
  note,
  onComplete,
  onDelete,
  onEdit,
  onDragOut,
  onChecklistUpdate,
  isCreator,
  isManager,
  currentUserId,
  updateNote,
  onClick,
  isNew,
}: {
  note: any;
  onComplete: (noteId: any, isCompleted: boolean) => void;
  onDelete: (noteId: any) => void;
  onEdit: (noteId: any) => void;
  onDragOut: (noteId: any, x: number, y: number) => void;
  onChecklistUpdate?: (noteId: any, items: any[]) => void;
  isCreator: boolean;
  isManager: boolean;
  currentUserId: any;
  updateNote: any;
  onClick?: () => void;
  isNew?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Only allow dragging from the grip handle or top area
    if (!target.closest('.drag-handle') && e.clientY > (cardRef.current?.getBoundingClientRect().top || 0) + 60) {
      return;
    }

    if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea')) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) {
      dragStartRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      setDragPosition({ x: e.clientX, y: e.clientY });
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragPosition({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragStartRef.current || !cardRef.current) {
        setIsDragging(false);
        return;
      }

      const sheet = document.querySelector('[role="dialog"]');
      const sheetRect = sheet?.getBoundingClientRect();

      // Check if dropped outside the sheet
      if (sheetRect && (e.clientX < sheetRect.left || e.clientX > sheetRect.right ||
        e.clientY < sheetRect.top || e.clientY > sheetRect.bottom)) {
        // Calculate position relative to viewport
        const x = Math.max(0, Math.min(e.clientX - dragStartRef.current.x, window.innerWidth - 300));
        const y = Math.max(0, Math.min(e.clientY - dragStartRef.current.y, window.innerHeight - 250));
        onDragOut(note._id, x, y);
      }

      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, note._id, onDragOut]);

  return (
    <>
      <div
        id={`task-${note._id}`}
        ref={cardRef}
        className={cn(
          "relative transition-transform duration-200 scroll-m-4",
          isDragging && "opacity-50 z-50"
        )}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          if (onClick) {
             onClick();
          }
        }}
      >
        <StickyNoteCard
          note={note}
          onComplete={onComplete}
          onDelete={onDelete}
          onEdit={onEdit}
          onChecklistUpdate={onChecklistUpdate}
          isCreator={isCreator}
          disableDrag={true}
          isManager={isManager}
          currentUserId={currentUserId}
          isNew={isNew}
        />
        {/* Drag Handle */}
        <div className="drag-handle absolute top-2 right-2 cursor-grab active:cursor-grabbing z-10 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      {/* Drag Preview */}
      {isDragging && (
        <div
          className="fixed pointer-events-none z-[9999]"
          style={{
            left: dragPosition.x - (dragStartRef.current?.x || 0),
            top: dragPosition.y - (dragStartRef.current?.y || 0),
            width: cardRef.current?.offsetWidth || 300,
            height: cardRef.current?.offsetHeight || 200,
            opacity: 0.8,
          }}
        >
          <StickyNoteCard
            note={note}
            onComplete={() => { }}
            onDelete={() => { }}
            onEdit={() => { }}
            isCreator={isCreator}
            disableDrag={true}
            isManager={isManager}
            currentUserId={currentUserId}
            isNew={isNew}
          />
        </div>
      )}
    </>
  );
}

interface StickyNotesWindowProps {
  currentUserId: Id<"users">;
  onClose?: () => void;
  className?: string;
}

export function StickyNotesWindow({
  currentUserId,
  onClose,
  className,
}: StickyNotesWindowProps) {
  const allNotesList = useStickyNotes(true); // Get all notes
  const currentUser = useQuery(api.users.getCurrentUser);
  const userRole = useUserRole();
  const isManager = userRole === ROLES.MANAGER;

  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<Id<"stickyNotes"> | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("me");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [deleteNoteId, setDeleteNoteId] = useState<Id<"stickyNotes"> | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Default all users to 'All' view on open
  useEffect(() => {
    setViewFilter("me");
  }, [userRole]);

  // Filter notes locally
  const allActiveNotes = allNotesList?.filter(note => !note.isCompleted) || [];
  const allCompletedNotes = allNotesList?.filter(note => note.isCompleted) || [];

  // Filter notes based on selected filters
  const filterTask = (note: any) => {
    if (!currentUser) return false;
    
    // View Filter
    if (viewFilter === "me" && note.assignee?._id !== currentUser._id && note.assignedTo !== currentUser._id) return false;
    if (viewFilter === "assigned" && (note.creator?._id === currentUser._id ? false : true) === false) return false;
    if (viewFilter === "assigned" && note.createdBy === currentUser._id) return false;
    if (viewFilter === "self") {
      // Self = tasks the current user created AND assigned to themselves
      const isAssignedToMe = note.assignee?._id === currentUser._id || note.assignedTo === currentUser._id;
      const isCreatedByMe = note.creator?._id === currentUser._id || note.createdBy === currentUser._id;
      if (!isAssignedToMe || !isCreatedByMe) return false;
    }
    if (viewFilter === "manager_assigned") {
      // Manager assigned = assigned to me but NOT created by me
      const isAssignedToMe = note.assignee?._id === currentUser._id || note.assignedTo === currentUser._id;
      const isCreatedByMe = note.creator?._id === currentUser._id || note.createdBy === currentUser._id;
      if (!isAssignedToMe || isCreatedByMe) return false;
    }

    // Priority Filter
    if (priorityFilter !== "all" && note.priority !== priorityFilter) return false;

    return true;
  };

  const activeNotes = allActiveNotes.filter(filterTask);
  const completedNotes = allCompletedNotes.filter(filterTask);

  const createNote = useCreateStickyNote();
  const updateNote = useUpdateStickyNote();
  const completeNote = useCompleteStickyNote();
  const deleteNote = useDeleteStickyNote();
  const markAllRead = useMarkStickyNotesAllRead();

  const [sessionUnreadIds, setSessionUnreadIds] = useState<Set<string>>(new Set());
  const hasInitializedRead = useRef(false);

  // Capture unread notes for session highlighting, then mark them read
  useEffect(() => {
    if (allActiveNotes && !hasInitializedRead.current) {
      const unreadIds = new Set<string>();
      allActiveNotes.forEach(note => {
        if (note.isRead === false && note.assignedTo === currentUser?._id) {
          unreadIds.add(note._id);
        }
      });
      if (unreadIds.size > 0) {
        setSessionUnreadIds(unreadIds);
      }
      markAllRead();
      hasInitializedRead.current = true;
    }
  }, [allActiveNotes, currentUser]);

  // Get note to edit
  const editingNote = editingNoteId
    ? allNotesList?.find((n) => n._id === editingNoteId)
    : null;

  // Filter notes by search query
  const filterNotes = (notes: typeof activeNotes) => {
    if (!notes || notes.length === 0) return [];
    let filtered = notes;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = notes.filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query)
      );
    }
    
    // Sort new/unread notes to the top
    return filtered.sort((a, b) => {
      const aIsNew = sessionUnreadIds.has(a._id);
      const bIsNew = sessionUnreadIds.has(b._id);
      if (aIsNew && !bIsNew) return -1;
      if (!aIsNew && bIsNew) return 1;
      return 0;
    });
  };

  const filteredActiveNotes = filterNotes(activeNotes);
  const filteredCompletedNotes = filterNotes(completedNotes);

  // Group notes by due date (or createdAt) for WhatsApp-style date separators
  const getDateLabel = (timestamp: number): string => {
    const d = new Date(timestamp);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    if (isYesterday(d)) return "Yesterday";
    const diff = differenceInCalendarDays(d, new Date());
    if (diff > 0 && diff <= 6) return format(d, "EEEE"); // e.g. Monday
    return format(d, "MMMM d, yyyy");
  };

  type GroupedNotes = { label: string; notes: typeof filteredActiveNotes }[];

  const groupNotesByDate = (notes: typeof filteredActiveNotes): GroupedNotes => {
    const groups = new Map<string, typeof filteredActiveNotes>();
    for (const note of notes) {
      const ts = note.createdAt;
      const label = getDateLabel(ts);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(note);
    }
    // Sort: Today first, then Tomorrow, then future, then past
    const order = ["Today", "Tomorrow", "Yesterday"];
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      })
      .map(([label, notes]) => ({ label, notes }));
  };

  const groupedActiveNotes = groupNotesByDate(filteredActiveNotes);
  const groupedCompletedNotes = groupNotesByDate(filteredCompletedNotes);

  // Scroll to task if hash is present (must be after groupedActiveNotes is defined)
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash;
      if (hash.startsWith("#task-")) {
        setTimeout(() => {
          const element = document.getElementById(hash.substring(1));
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("ring-2", "ring-primary", "ring-offset-2", "transition-all", "duration-1000");
            setTimeout(() => {
              element.classList.remove("ring-2", "ring-primary", "ring-offset-2");
            }, 2000);
          }
        }, 300);
      }
    }
  }, [filteredActiveNotes.length, filteredCompletedNotes.length]);

  const handleCreate = async (data: any) => {
    try {
      await createNote(data);
      toast.success("Task created!");
      setShowForm(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to create note");
    }
  };

  const handleUpdate = async (data: any) => {
    if (!editingNoteId) return;
    try {
      await updateNote({
        noteId: editingNoteId,
        ...data,
      });
      toast.success("Task updated!");
      setEditingNoteId(null);
      setShowForm(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update note");
    }
  };

  const handleComplete = async (noteId: Id<"stickyNotes">, isCompleted: boolean) => {
    try {
      await completeNote({ noteId, isCompleted });
      toast.success(isCompleted ? "Note marked as completed!" : "Note unmarked!");
    } catch (error: any) {
      toast.error(error.message || "Failed to update note");
    }
  };

  const handleDelete = async (noteId: Id<"stickyNotes">) => {
    setDeleteNoteId(noteId);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!deleteNoteId) return;
    try {
      await deleteNote({ noteId: deleteNoteId });
      toast.success("Note deleted!");
      setShowDeleteDialog(false);
      setDeleteNoteId(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete note");
      setShowDeleteDialog(false);
      setDeleteNoteId(null);
    }
  };

  const handleEdit = (noteId: Id<"stickyNotes">) => {
    setEditingNoteId(noteId);
    setShowForm(true);
  };

  const handleDragOut = async (noteId: Id<"stickyNotes">, x: number, y: number) => {
    try {
      await updateNote({
        noteId,
        positionX: x,
        positionY: y,
        width: 300,
        height: 250,
      });
      toast.success("Note moved to screen!");
    } catch (error: any) {
      toast.error("Failed to move note");
    }
  };

  const isCreator = (note: typeof activeNotes[0]) => {
    return note.creator?._id === currentUserId;
  };

  return (
    <div className={`flex flex-col h-full w-full bg-gradient-to-br from-background via-background to-muted/20 overflow-hidden ${className || ""}`}>
      {/* Header */}
      <div className="relative flex items-center gap-2 sm:gap-3 py-3 sm:py-4 px-4 border-b border-border/50 bg-background/80 backdrop-blur-md shrink-0 shadow-sm w-full">
        <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0">
          <Plus className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <h1 className="text-base sm:text-lg font-bold truncate">
            Tasks
          </h1>
          <p className="text-xs text-muted-foreground truncate">
            {allActiveNotes.length} active • {allCompletedNotes.length} completed
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => {
              setEditingNoteId(null);
              setShowForm(true);
            }}
            size="sm"
            className="shadow-sm h-8 px-2 sm:px-3"
          >
            <Plus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">New</span>
          </Button>
          <Button
            onClick={() => setShowExportDialog(true)}
            size="sm"
            variant="outline"
            className="h-8 px-2 sm:px-3 gap-1 border-emerald-500/50 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-500/40 dark:hover:bg-emerald-900/20"
            title="Download tasks as Excel"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Download XL</span>
          </Button>
          {onClose && (
            <Button
              onClick={onClose}
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 hover:bg-muted/80 rounded-lg transition-colors"
              title="Close tasks"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="py-3 sm:py-4 px-4 border-b border-border/50 bg-background/50 backdrop-blur-sm shrink-0 w-full">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-background/80 backdrop-blur-sm border-border/50 w-full"
          />
        </div>
      </div>

      {/* Scrollable area — everything scrolls together */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 scrollbar-hide w-full">
        {/* Tabs + Filters inside scroll */}
        <div className="px-4 pt-3 pb-2 space-y-3 border-b border-border/50">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
            <TabsList className="w-full bg-muted/40 p-1 border border-border/50 rounded-lg">
              <TabsTrigger value="active" className="data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground flex-1 rounded-md transition-all font-medium text-muted-foreground">
                Active ({activeNotes.length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground flex-1 rounded-md transition-all font-medium text-muted-foreground">
                Completed ({completedNotes.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <TaskFilters
            viewFilter={viewFilter}
            setViewFilter={setViewFilter}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            isManager={isManager}
          />
        </div>

        {/* Notes via Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">

          <TabsContent value="active" className="mt-0 w-full flex-1 min-h-0 flex flex-col data-[state=active]:flex">
            {filteredActiveNotes.length === 0 ? (
              <div className="text-center py-16 w-full px-4">
                <div className="inline-flex h-16 w-16 rounded-full bg-muted/50 items-center justify-center mb-4">
                  <Plus className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-semibold mb-2">
                  No active tasks found
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Adjust filters or create a new task.
                </p>
                {viewFilter === "me" && (
                  <Button
                    onClick={() => {
                      setEditingNoteId(null);
                      setShowForm(true);
                    }}
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Create Note
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
                <div className="flex flex-col gap-0 w-full">
                  {groupedActiveNotes.map(({ label, notes }) => (
                    <div key={label} className="mb-2">
                      {/* Date Group Header */}
                      <div className="flex items-center gap-3 my-3 sticky top-0 z-10">
                        <div className="flex-1 h-px bg-border/50" />
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 py-1 rounded-full bg-muted/60 border border-border/40 shadow-sm backdrop-blur-sm">
                          {label}
                        </span>
                        <div className="flex-1 h-px bg-border/50" />
                      </div>
                      <div className="flex flex-col gap-3">
                        {notes.map((note) => (
                          <DraggableNoteCard
                            key={note._id}
                            note={note}
                            onComplete={handleComplete}
                            onDelete={handleDelete}
                            onEdit={handleEdit}
                            onDragOut={handleDragOut}
                            onChecklistUpdate={async (noteId, items) => {
                              try {
                                await updateNote({ noteId, checklistItems: items });
                              } catch (error: any) {
                                toast.error("Failed to update checklist");
                              }
                            }}
                            isCreator={isCreator(note)}
                            isManager={isManager}
                            currentUserId={currentUserId}
                            updateNote={updateNote}
                            isNew={sessionUnreadIds.has(note._id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-0 w-full flex-1 min-h-0 flex flex-col data-[state=active]:flex">
            {filteredCompletedNotes.length === 0 ? (
              <div className="text-center py-16 w-full px-4">
                <div className="inline-flex h-16 w-16 rounded-full bg-muted/50 items-center justify-center mb-4">
                  <Check className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-semibold mb-2">
                  No completed tasks found
                </p>
                <p className="text-sm text-muted-foreground">
                  Adjust filters to see more tasks.
                </p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
                <div className="flex flex-col gap-0 w-full">
                  {groupedCompletedNotes.map(({ label, notes }) => (
                    <div key={label} className="mb-2">
                      <div className="flex items-center gap-3 my-3">
                        <div className="flex-1 h-px bg-border/50" />
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 py-1 rounded-full bg-muted/60 border border-border/40 shadow-sm backdrop-blur-sm">
                          {label}
                        </span>
                        <div className="flex-1 h-px bg-border/50" />
                      </div>
                      <div className="flex flex-col gap-3">
                        {notes.map((note) => (
                          <DraggableNoteCard
                            key={note._id}
                            note={note}
                            onComplete={handleComplete}
                            onDelete={handleDelete}
                            onEdit={handleEdit}
                            onDragOut={handleDragOut}
                            onChecklistUpdate={async (noteId, items) => {
                              try {
                                await updateNote({ noteId, checklistItems: items.length > 0 ? items : [] });
                              } catch (error: any) {
                                toast.error("Failed to update checklist");
                              }
                            }}
                            isCreator={isCreator(note)}
                            isManager={isManager}
                            currentUserId={currentUserId}
                            updateNote={updateNote}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>

      {/* Create/Edit Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm} modal={true}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {editingNoteId ? "Edit Task" : "Create Task"}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 pr-2 -mr-2 scrollbar-hide">
            <StickyNoteForm
              noteId={editingNoteId || undefined}
              initialData={editingNote ? {
                title: editingNote.title,
                content: editingNote.content,
                color: editingNote.color,
                reminderAt: editingNote.reminderAt,
                assignedTo: editingNote.assignedTo,
                checklistItems: editingNote.checklistItems,
                priority: editingNote.priority,
                dueDate: editingNote.dueDate,
              } : undefined}
              currentUserId={currentUserId}
              onSubmit={editingNoteId ? handleUpdate : handleCreate}
              onCancel={() => {
                setShowForm(false);
                setEditingNoteId(null);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteNoteId && (() => {
                const noteToDelete = allNotesList?.find(n => n._id === deleteNoteId);
                return noteToDelete
                  ? `Are you sure you want to delete "${noteToDelete.title}"? This action cannot be undone.`
                  : "Are you sure you want to delete this note? This action cannot be undone.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Export Dialog */}
      <TaskExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        allNotes={allNotesList || []}
        currentUserId={currentUserId}
        isManager={isManager}
      />
    </div>
  );
}

