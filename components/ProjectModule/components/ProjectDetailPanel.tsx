"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Edit,
  Trash2,
  MapPin,
  Calendar,
  User,
  FileText,
  ExternalLink,
  Download,
  FolderKanban,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ProjectFormDialog } from "./ProjectFormDialog";
import { ProjectItemsManager } from "./ProjectItemsManager";
import type { Project } from "../types/project.types";
import { useUserRole } from "@/hooks/use-user-role";
import { useRouter } from "next/navigation";
import { ROLES } from "@/lib/auth/roles";
import { ChevronDown, ChevronRight, Eye } from "lucide-react";

interface ProjectDetailPanelProps {
  project: Project;
  onBack: () => void;
}

export function ProjectDetailPanel({ project, onBack }: ProjectDetailPanelProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPdf, setShowPdf] = useState(false);

  const deleteMutation = useMutation(api.projects.deleteProject);

  // Live data — stays in sync after edits
  const live = useQuery(api.projects.getProjectById, { projectId: project._id });
  const creator = useQuery(
    api.users.getUserById,
    live?.createdBy ? { userId: live.createdBy } : "skip"
  );

  const p = live ?? project;
  const isActive = (p.status ?? "active") === "active";

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMutation({ projectId: p._id });
      toast.success("Project deleted");
      onBack();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Project Header ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Accent bar */}
        <div className={cn("h-1", isActive ? "bg-emerald-500" : "bg-muted-foreground/30")} />

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            {/* Left: icon + name + location */}
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <FolderKanban className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-foreground">{p.name}</h2>
                  <Badge
                    variant={isActive ? "default" : "secondary"}
                    className={cn(
                      "text-[10px] h-5 px-2 uppercase tracking-wider font-bold",
                      isActive && "bg-emerald-600 hover:bg-emerald-700"
                    )}
                  >
                    {p.status ?? "active"}
                  </Badge>
                </div>
                {p.location && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {p.location}
                  </p>
                )}
                {p.description && (
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-2xl">
                    {p.description}
                  </p>
                )}
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setIsEditOpen(true)}
              >
                <Edit className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60 hover:bg-destructive/5"
                onClick={() => setIsDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-border/50">
            <MetaPill icon={<User className="h-3.5 w-3.5" />} label="Created by" value={creator?.fullName ?? "—"} />
            <MetaPill icon={<Calendar className="h-3.5 w-3.5" />} label="Created" value={format(new Date(p.createdAt), "dd MMM yyyy")} />
            {(p.estimatedTimeline || p.timeline) && (
              <MetaPill
                icon={<Calendar className="h-3.5 w-3.5 text-orange-500" />}
                label="Deadline"
                value={p.estimatedTimeline ? format(new Date(p.estimatedTimeline), "dd MMM yyyy") : (p.timeline ?? "—")}
                highlight
              />
            )}
            {p.pdfFileName && (
              <MetaPill icon={<FileText className="h-3.5 w-3.5 text-red-500" />} label="PDF" value={p.pdfFileName} />
            )}
          </div>
        </div>
      </div>

      {/* ── PDF Section ──────────────────────────────────────────────── */}
      {p.pdfUrl && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">{p.pdfFileName || "Material Requirement.pdf"}</p>
                <p className="text-xs text-muted-foreground">PDF Document</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setShowPdf((v) => !v)}
              >
                {showPdf ? "Hide Preview" : "Preview"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => window.open(p.pdfUrl!, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
                <a href={p.pdfUrl} download={p.pdfFileName || "document.pdf"}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              </Button>
            </div>
          </div>
          {showPdf && (
            <div className="bg-muted/10" style={{ height: "65vh" }}>
              <iframe
                src={`${p.pdfUrl}#toolbar=0`}
                className="w-full h-full"
                title={p.pdfFileName || "Document"}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Material Items ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <h3 className="text-sm font-bold text-foreground">Material Items</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add items and send them to procurement as an RFQ
          </p>
        </div>
        <div className="p-4">
          <ProjectItemsManager projectId={p._id} />
        </div>
      </div>

      <ProjectRequestsSection projectId={p._id} />

      {/* Dialogs */}
      <ProjectFormDialog open={isEditOpen} onOpenChange={setIsEditOpen} projectData={p} />

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{p.name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Meta Pill ──────────────────────────────────────────────────────────── */
function MetaPill({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm max-w-full overflow-hidden",
      highlight ? "bg-primary/5 border-primary/20" : "bg-card border-border"
    )}>
      <span className="shrink-0">{icon}</span>
      <span className="text-muted-foreground whitespace-nowrap">{label}:</span>
      <span className="font-semibold truncate text-foreground">{value}</span>
    </div>
  );
}

/* ── Project Requests Section ───────────────────────────────────────────── */
function ProjectRequestsSection({ projectId }: { projectId: string }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const requests = useQuery(api.requests.getRequestsByProjectId, projectId ? { projectId: projectId as any } : "skip");
  const role = useUserRole();
  const router = useRouter();

  // Group requests by requestNumber
  const groupedRequests = requests?.reduce((acc, req) => {
    if (!acc[req.requestNumber]) {
      acc[req.requestNumber] = [];
    }
    acc[req.requestNumber].push(req);
    return acc;
  }, {} as Record<string, typeof requests>);

  const requestGroups = groupedRequests ? Object.entries(groupedRequests).map(([requestNumber, items]) => ({
    requestNumber,
    items,
    itemCount: items.length,
    latestItem: items.sort((a, b) => b._creationTime - a._creationTime)[0]
  })).sort((a, b) => b.latestItem._creationTime - a.latestItem._creationTime) : [];

  const handleViewRequest = (requestId: string) => {
    let path = "/dashboard/requests";
    if (role === ROLES.MANAGER) path = "/dashboard/manager/requests";
    if (role === ROLES.PURCHASE_OFFICER) path = "/dashboard/purchase/requests";
    if (role === ROLES.SITE_ENGINEER) path = "/dashboard/site/requests";
    
    router.push(`${path}?requestId=${requestId}`);
  };

  if (!requests) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 mt-6 animate-pulse">
        <div className="h-5 w-48 bg-muted rounded mb-2"></div>
      </div>
    );
  }

  if (requestGroups.length === 0) {
    return null; // Don't show the section if there are no requests associated
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mt-6">
      <div 
        className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            Associated Requests 
            <Badge variant="secondary" className="h-5 px-1.5">{requestGroups.length}</Badge>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Material requests generated from this project
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
      
      {isExpanded && (
        <div className="p-4 flex flex-col gap-3">
          {requestGroups.map((group) => (
            <div key={group.requestNumber} className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 rounded-lg border border-border/50 bg-background hover:bg-muted/10 transition-colors">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">{group.requestNumber}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {group.itemCount} {group.itemCount === 1 ? 'item' : 'items'} • Last updated {format(new Date(group.latestItem._creationTime), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1.5"
                onClick={() => handleViewRequest(group.latestItem._id)}
              >
                <Eye className="h-3.5 w-3.5" />
                View
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
