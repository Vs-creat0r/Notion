"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Package,
  IndianRupee,
  Loader2,
  Send,
  ShoppingCart,
  CheckCircle2,
  Search,
  X,
  Camera,
  Upload,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Hash,
  LayoutGrid,
  Table2,
  Edit,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import type { ProjectItemFormData } from "../types/project.types";
import { CameraDialog } from "@/components/inventory/camera-dialog";
import { CategoryCombobox } from "@/components/ui/category-combobox";

const COMMON_UNITS = [
  "nos", "kg", "kgs", "ton", "mt",
  "m", "ft", "rmt", "sqm", "sqft",
  "bags", "box", "pcs", "set", "pair",
  "ltr", "ml", "cum", "cft",
];

interface ProjectItemsManagerProps {
  projectId: Id<"projects">;
}

const EMPTY: ProjectItemFormData = {
  name: "",
  description: "",
  categoryId: "",
  unit: "",
  hsnSacCode: "",
  quantity: "",
  rate: "",
};

type ViewMode = "table" | "card";
const PAGE_SIZES = [10, 25, 50];


// ─── Item Form (shared between Add Dialog and Edit mode) ─────────────────────
interface ItemFormFieldsProps {
  form: ProjectItemFormData;
  setForm: React.Dispatch<React.SetStateAction<ProjectItemFormData>>;
  inventoryItems: Array<any> | undefined;
  selectedInvImages: { imageUrl: string; imageKey: string }[];
  setSelectedInvImages: React.Dispatch<React.SetStateAction<{ imageUrl: string; imageKey: string }[]>>;
  selectedInvHsn: string;
  setSelectedInvHsn: React.Dispatch<React.SetStateAction<string>>;
  inventoryImageUrls: string[];
  setInventoryImageUrls: React.Dispatch<React.SetStateAction<string[]>>;
  photoPreviews: string[];
  setPhotoPreviews: React.Dispatch<React.SetStateAction<string[]>>;
  selectedPhotos: File[];
  setSelectedPhotos: React.Dispatch<React.SetStateAction<File[]>>;
  onOpenCamera: () => void;
  onOpenInvPicker: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handlePhotoFiles: (files: FileList | null) => void;
}

function ItemFormFields({
  form, setForm, inventoryItems,
  selectedInvImages, setSelectedInvImages, selectedInvHsn, setSelectedInvHsn,
  inventoryImageUrls, setInventoryImageUrls,
  photoPreviews, setPhotoPreviews, selectedPhotos, setSelectedPhotos,
  onOpenCamera, onOpenInvPicker, fileInputRef, handlePhotoFiles,
}: ItemFormFieldsProps) {
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);
  const [showUnitSuggestions, setShowUnitSuggestions] = useState(false);
  const [itemSuggestionIndex, setItemSuggestionIndex] = useState(-1);
  const [unitSuggestionIndex, setUnitSuggestionIndex] = useState(-1);
  const itemInputRef = useRef<HTMLInputElement>(null);
  const unitInputRef = useRef<HTMLInputElement>(null);
  const itemSuggestionsRef = useRef<HTMLDivElement>(null);
  const unitSuggestionsRef = useRef<HTMLDivElement>(null);

  const filteredInventoryItems = (inventoryItems || []).filter((inv) =>
    form.name.trim().length > 0
      ? inv.itemName.toLowerCase().includes(form.name.toLowerCase().trim())
      : true
  ).slice(0, 8);

  const filteredUnits = COMMON_UNITS.filter((u) =>
    form.unit.trim().length === 0 || u.toLowerCase().startsWith(form.unit.toLowerCase().trim())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        itemSuggestionsRef.current &&
        !itemSuggestionsRef.current.contains(e.target as Node) &&
        !itemInputRef.current?.contains(e.target as Node)
      ) { setShowItemSuggestions(false); setItemSuggestionIndex(-1); }
      if (
        unitSuggestionsRef.current &&
        !unitSuggestionsRef.current.contains(e.target as Node) &&
        !unitInputRef.current?.contains(e.target as Node)
      ) { setShowUnitSuggestions(false); setUnitSuggestionIndex(-1); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectInventoryItem = (inv: { itemName: string; unit: string; description?: string; images?: { imageUrl: string; imageKey: string }[]; hsnSacCode?: string }) => {
    setForm((prev) => ({
      ...prev,
      name: inv.itemName,
      unit: inv.unit || prev.unit,
      description: inv.description || prev.description,
      hsnSacCode: inv.hsnSacCode || prev.hsnSacCode,
    }));
    setSelectedInvImages(inv.images || []);
    setSelectedInvHsn(inv.hsnSacCode || "");
    setInventoryImageUrls([]);
    setPhotoPreviews((prev) => prev.filter((url) => !inventoryImageUrls.includes(url)));
    setShowItemSuggestions(false);
    setItemSuggestionIndex(-1);
  };

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showItemSuggestions || filteredInventoryItems.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setItemSuggestionIndex((i) => Math.min(i + 1, filteredInventoryItems.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setItemSuggestionIndex((i) => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && itemSuggestionIndex >= 0) { e.preventDefault(); selectInventoryItem(filteredInventoryItems[itemSuggestionIndex]); }
    else if (e.key === "Escape") { setShowItemSuggestions(false); setItemSuggestionIndex(-1); }
  };

  const handleUnitKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showUnitSuggestions || filteredUnits.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setUnitSuggestionIndex((i) => Math.min(i + 1, filteredUnits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setUnitSuggestionIndex((i) => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && unitSuggestionIndex >= 0) {
      e.preventDefault();
      setForm((prev) => ({ ...prev, unit: filteredUnits[unitSuggestionIndex] }));
      setShowUnitSuggestions(false); setUnitSuggestionIndex(-1);
    } else if (e.key === "Escape") { setShowUnitSuggestions(false); setUnitSuggestionIndex(-1); }
  };

  const removePhoto = (index: number) => {
    setSelectedPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {/* Item Name with inventory autocomplete */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item Name *</Label>
        <div className="relative">
          <Input
            ref={itemInputRef}
            placeholder="e.g. 10mm Steel TMT Bar"
            value={form.name}
            onChange={(e) => { setForm({ ...form, name: e.target.value }); setShowItemSuggestions(true); setItemSuggestionIndex(-1); }}
            onFocus={() => setShowItemSuggestions(true)}
            onKeyDown={handleItemKeyDown}
            className="h-9 text-sm pr-8"
            required
            autoComplete="off"
          />
          {form.name ? (
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setForm({ ...form, name: "" }); setShowItemSuggestions(false); }} tabIndex={-1}>
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          )}
          {showItemSuggestions && filteredInventoryItems.length > 0 && (
            <div ref={itemSuggestionsRef} className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
              <div className="px-2 py-1 border-b border-border">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">From Inventory</p>
              </div>
              {filteredInventoryItems.map((inv, idx) => (
                <button key={inv._id} type="button"
                  className={cn("w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors", idx === itemSuggestionIndex && "bg-accent")}
                  onMouseDown={(e) => { e.preventDefault(); selectInventoryItem(inv); }}
                  onMouseEnter={() => setItemSuggestionIndex(idx)}
                >
                  <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.itemName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {inv.unit && <span className="mr-2">Unit: {inv.unit}</span>}
                      {inv.centralStock != null && inv.centralStock > 0 && <span className="text-emerald-600 dark:text-emerald-400">Stock: {inv.centralStock}</span>}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Category <span className="normal-case font-normal text-muted-foreground">(optional)</span>
        </Label>
        <CategoryCombobox
          value={form.categoryId}
          onChange={(v) => setForm({ ...form, categoryId: v as Id<"inventoryCategories"> | Id<"projectCategories"> })}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Description <span className="normal-case font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          placeholder="Additional details…"
          className="resize-none h-14 text-sm"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>

      {/* HSN / SAC Code */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          HSN / SAC Code <span className="normal-case font-normal text-muted-foreground">(optional)</span>
        </Label>
        <div className="relative">
          <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="e.g. 7214"
            value={form.hsnSacCode}
            onChange={(e) => setForm({ ...form, hsnSacCode: e.target.value })}
            className="pl-8 h-9 text-sm font-mono"
            autoComplete="off"
          />
        </div>
        {selectedInvHsn && form.hsnSacCode === selectedInvHsn && (
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">✓ Auto-filled from inventory</p>
        )}
      </div>

      {/* Qty + Unit */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qty *</Label>
          <div className="relative">
            <Package className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input type="number" min="0" step="0.01" className="pl-8 h-9 text-sm" placeholder="0"
              value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value as number | "" })} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit</Label>
          <div className="relative">
            <Input ref={unitInputRef} placeholder="kg, nos, m…" value={form.unit}
              onChange={(e) => { setForm({ ...form, unit: e.target.value }); setShowUnitSuggestions(true); setUnitSuggestionIndex(-1); }}
              onFocus={() => setShowUnitSuggestions(true)} onKeyDown={handleUnitKeyDown}
              className="h-9 text-sm" autoComplete="off" />
            {showUnitSuggestions && filteredUnits.length > 0 && (
              <div ref={unitSuggestionsRef} className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                <div className="flex flex-wrap gap-1 p-2">
                  {filteredUnits.map((u, idx) => (
                    <button key={u} type="button"
                      className={cn("px-2 py-0.5 text-xs rounded-md border border-border hover:bg-accent transition-colors", idx === unitSuggestionIndex && "bg-accent border-primary")}
                      onMouseDown={(e) => { e.preventDefault(); setForm((prev) => ({ ...prev, unit: u })); setShowUnitSuggestions(false); setUnitSuggestionIndex(-1); }}
                      onMouseEnter={() => setUnitSuggestionIndex(idx)}
                    >{u}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rate */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rate *</Label>
        <div className="relative">
          <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input type="number" min="0" step="0.01" className="pl-8 h-9 text-sm" placeholder="0.00"
            value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value as number | "" })} required />
        </div>
      </div>

      {/* Photos (optional) */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Photos <span className="normal-case font-normal text-muted-foreground">(optional)</span>
        </Label>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handlePhotoFiles(e.target.files)} />
        <div className="flex gap-2 flex-wrap">
          <Button type="button" variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5" onClick={onOpenCamera}>
            <Camera className="h-3.5 w-3.5" />Camera
          </Button>
          <Button type="button" variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />Upload
          </Button>
          {selectedInvImages.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1.5 border-violet-300 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950"
              onClick={onOpenInvPicker}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Use from Inventory ({selectedInvImages.length})
              {inventoryImageUrls.length > 0 && (
                <span className="ml-1 bg-violet-600 text-white rounded-full px-1.5 py-0 text-[10px] font-bold">
                  {inventoryImageUrls.length} added
                </span>
              )}
            </Button>
          )}
        </div>
        {photoPreviews.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5 mt-1">
            {photoPreviews.map((src, idx) => (
              <div key={idx} className="relative group aspect-square">
                <img src={src} alt="" className="w-full h-full object-cover rounded-md border border-border" />
                <button type="button"
                  onClick={() => {
                    if (inventoryImageUrls.includes(src)) {
                      setInventoryImageUrls((prev) => prev.filter((u) => u !== src));
                    } else {
                      removePhoto(photoPreviews.indexOf(src));
                    }
                    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
                  }}
                  className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Main Component ──────────────────────────────────────────────────────────
export function ProjectItemsManager({ projectId }: ProjectItemsManagerProps) {
  const items = useQuery(api.projectItems.getItemsByProjectId, { projectId });
  const categories = useQuery(api.inventory.getInventoryCategories);
  const inventoryItems = useQuery(api.requests.getInventoryItemsForAutocomplete, {});
  const createItem = useMutation(api.projectItems.createItem);
  const deleteItem = useMutation(api.projectItems.deleteItem);
  const updateItem = useMutation(api.projectItems.updateItem);
  const createCategory = useMutation(api.inventory.createInventoryCategory);
  const sendToProcurement = useMutation(api.projectItems.sendItemsToProcurement);
  const addPhotoToItem = useMutation(api.projectItems.addPhotoToProjectItem);

  // ── Add form state ──────────────────────────────────────────────────────────
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState<ProjectItemFormData>(EMPTY);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [inventoryImageUrls, setInventoryImageUrls] = useState<string[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [selectedInvImages, setSelectedInvImages] = useState<{ imageUrl: string; imageKey: string }[]>([]);
  const [selectedInvHsn, setSelectedInvHsn] = useState<string>("");
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState<ProjectItemFormData>(EMPTY);
  const [editSelectedPhotos, setEditSelectedPhotos] = useState<File[]>([]);
  const [editPhotoPreviews, setEditPhotoPreviews] = useState<string[]>([]);
  const [editInventoryImageUrls, setEditInventoryImageUrls] = useState<string[]>([]);
  const [editSelectedInvImages, setEditSelectedInvImages] = useState<{ imageUrl: string; imageKey: string }[]>([]);
  const [editSelectedInvHsn, setEditSelectedInvHsn] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // ── Item detail / edit dialog ───────────────────────────────────────────────
  const [detailItem, setDetailItem] = useState<any | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<"view" | "edit">("view");

  // ── Camera / lightbox / inv picker ─────────────────────────────────────────
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<"add" | "edit">("add");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [invImagePickerOpen, setInvImagePickerOpen] = useState(false);
  const [invPickerTarget, setInvPickerTarget] = useState<"add" | "edit">("add");

  // ── Category dialog ─────────────────────────────────────────────────────────
  const [isCatOpen, setIsCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  // ── Selection / send ────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<Id<"projectItems">>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // ── View mode & pagination ──────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // On mobile always use card view
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const effectiveView: ViewMode = isMobile ? "card" : viewMode;

  // ── Pagination ──────────────────────────────────────────────────────────────
  const totalItems = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pagedItems = items?.slice((page - 1) * pageSize, page * pageSize) ?? [];

  // Reset to page 1 when items or pageSize changes
  useEffect(() => { setPage(1); }, [pageSize, totalItems]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const toggle = (id: Id<"projectItems">) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectAll = () => {
    if (!items) return;
    setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i._id)));
  };

  const openLightbox = (photos: string[], index: number) => {
    setLightboxPhotos(photos);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handlePhotoFiles = (files: FileList | null, target: "add" | "edit" = "add") => {
    if (!files) return;
    const valid = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!valid.length) { toast.error("Please select image files only"); return; }
    if (target === "add") {
      setSelectedPhotos((prev) => [...prev, ...valid]);
      valid.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => setPhotoPreviews((prev) => [...prev, reader.result as string]);
        reader.readAsDataURL(file);
      });
    } else {
      setEditSelectedPhotos((prev) => [...prev, ...valid]);
      valid.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => setEditPhotoPreviews((prev) => [...prev, reader.result as string]);
        reader.readAsDataURL(file);
      });
    }
  };

  const handleCameraCapture = (file: File) => {
    if (cameraTarget === "add") {
      setSelectedPhotos((prev) => [...prev, file]);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    } else {
      setEditSelectedPhotos((prev) => [...prev, file]);
      const reader = new FileReader();
      reader.onloadend = () => setEditPhotoPreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    }
  };

  const uploadPhotos = async (itemId: string, photos: File[]) => {
    const results: { imageUrl: string; imageKey: string }[] = [];
    for (const file of photos) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("itemId", itemId);
      const res = await fetch("/api/upload/image", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Photo upload failed");
      const data = await res.json();
      results.push({ imageUrl: data.imageUrl, imageKey: data.imageKey });
    }
    return results;
  };

  const openDetailDialog = (item: any) => {
    setDetailItem(item);
    setDetailMode("view");
    setDetailDialogOpen(true);
  };

  const openEditMode = (item: any) => {
    setDetailItem(item);
    setEditForm({
      name: item.name || "",
      description: item.description || "",
      categoryId: item.categoryId || "",
      unit: item.unit || "",
      hsnSacCode: item.hsnSacCode || "",
      quantity: item.quantity ?? "",
      rate: item.rate ?? "",
    });
    setEditSelectedPhotos([]);
    setEditPhotoPreviews([]);
    setEditInventoryImageUrls([]);
    setEditSelectedInvImages([]);
    setEditSelectedInvHsn("");
    setDetailMode("edit");
    setDetailDialogOpen(true);
  };

  // ── Mutations ────────────────────────────────────────────────────────────────
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.quantity === "" || form.rate === "") {
      toast.error("Fill in all required fields"); return;
    }
    if (Number(form.quantity) <= 0) { toast.error("Quantity must be > 0"); return; }
    if (Number(form.rate) < 0) { toast.error("Rate cannot be negative"); return; }

    setIsSubmitting(true);
    try {
      const itemId = await createItem({
        projectId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.categoryId ? form.categoryId as Id<"inventoryCategories"> | Id<"projectCategories"> : undefined,
        unit: form.unit.trim() || undefined,
        hsnSacCode: form.hsnSacCode.trim() || undefined,
        quantity: Number(form.quantity),
        rate: Number(form.rate),
      });

      if (selectedPhotos.length > 0 || inventoryImageUrls.length > 0) {
        setIsUploadingPhotos(true);
        try {
          if (selectedPhotos.length > 0) {
            const uploaded = await uploadPhotos(itemId, selectedPhotos);
            for (const p of uploaded) {
              await addPhotoToItem({ itemId, imageUrl: p.imageUrl, imageKey: p.imageKey });
            }
          }
          for (const url of inventoryImageUrls) {
            const img = selectedInvImages.find((i) => i.imageUrl === url);
            if (img) {
              await addPhotoToItem({ itemId, imageUrl: img.imageUrl, imageKey: img.imageKey });
            }
          }
        } catch {
          toast.warning("Item added but some photos failed to upload");
        }
        setIsUploadingPhotos(false);
      }

      toast.success("Item added");
      setForm(EMPTY);
      setSelectedPhotos([]);
      setPhotoPreviews([]);
      setInventoryImageUrls([]);
      setSelectedInvImages([]);
      setSelectedInvHsn("");
      setAddDialogOpen(false);
    } catch {
      toast.error("Failed to add item");
    } finally {
      setIsSubmitting(false);
      setIsUploadingPhotos(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailItem) return;
    if (!editForm.name || editForm.quantity === "" || editForm.rate === "") {
      toast.error("Fill in all required fields"); return;
    }
    if (Number(editForm.quantity) <= 0) { toast.error("Quantity must be > 0"); return; }
    if (Number(editForm.rate) < 0) { toast.error("Rate cannot be negative"); return; }

    setIsSavingEdit(true);
    try {
      await updateItem({
        itemId: detailItem._id,
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        categoryId: editForm.categoryId ? editForm.categoryId as Id<"inventoryCategories"> | Id<"projectCategories"> : undefined,
        unit: editForm.unit.trim() || undefined,
        hsnSacCode: editForm.hsnSacCode.trim() || undefined,
        quantity: Number(editForm.quantity),
        rate: Number(editForm.rate),
      });

      if (editSelectedPhotos.length > 0 || editInventoryImageUrls.length > 0) {
        try {
          if (editSelectedPhotos.length > 0) {
            const uploaded = await uploadPhotos(detailItem._id, editSelectedPhotos);
            for (const p of uploaded) {
              await addPhotoToItem({ itemId: detailItem._id, imageUrl: p.imageUrl, imageKey: p.imageKey });
            }
          }
          for (const url of editInventoryImageUrls) {
            const img = editSelectedInvImages.find((i) => i.imageUrl === url);
            if (img) {
              await addPhotoToItem({ itemId: detailItem._id, imageUrl: img.imageUrl, imageKey: img.imageKey });
            }
          }
        } catch {
          toast.warning("Item updated but some photos failed to upload");
        }
      }

      toast.success("Item updated");
      setDetailDialogOpen(false);
      setDetailItem(null);
    } catch {
      toast.error("Failed to update item");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (id: Id<"projectItems">) => {
    try {
      await deleteItem({ itemId: id });
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast.success("Item removed");
    } catch { toast.error("Failed to remove item"); }
  };

  const handleSend = async () => {
    setIsSending(true);
    try {
      const result = await sendToProcurement({ projectId, itemIds: Array.from(selected) });
      toast.success(`${selected.size} item(s) sent — RFQ #${result.requestNumber}`);
      setSelected(new Set());
      setIsConfirmOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const id = await createCategory({ name: newCatName });
      setForm((prev) => ({ ...prev, categoryId: id }));
      setNewCatName("");
      setIsCatOpen(false);
      toast.success("Category created");
    } catch { toast.error("Failed to create category"); }
  };

  const totalEstimate = items?.reduce((s, i) => s + i.quantity * i.rate, 0) ?? 0;
  const selectedItems = items?.filter((i) => selected.has(i._id)) ?? [];


  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-foreground">Items</span>
          {items && items.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">{items.length}</Badge>
          )}
          {totalEstimate > 0 && (
            <span className="text-xs text-muted-foreground">
              · Est. <span className="font-semibold text-foreground">₹{totalEstimate.toLocaleString()}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Select All (only when items exist) */}
          {items && items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 px-2 text-xs text-muted-foreground hidden sm:flex">
              {selected.size === items.length ? "Deselect All" : "Select All"}
            </Button>
          )}
          {/* View toggle (hidden on mobile) */}
          {items && items.length > 0 && (
            <div className="hidden sm:flex items-center border border-border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn("p-1.5 transition-colors", viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                title="Table view"
              >
                <Table2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={cn("p-1.5 transition-colors", viewMode === "card" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                title="Card view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* Add Item button */}
          <Button size="sm" className="h-8 gap-1.5 font-semibold text-sm" onClick={() => { setForm(EMPTY); setSelectedPhotos([]); setPhotoPreviews([]); setInventoryImageUrls([]); setSelectedInvImages([]); setSelectedInvHsn(""); setAddDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      {/* ── Items area ──────────────────────────────────────────────────────── */}
      {!items ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground rounded-xl border border-border">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center text-muted-foreground rounded-xl border border-dashed border-border">
          <Package className="h-10 w-10 mb-3 opacity-20" />
          <p className="text-sm font-medium">No items yet</p>
          <p className="text-xs opacity-70 mt-1">Click "Add Item" to add material items.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
          {/* ── Card view ─────────────────────────────────────────────────── */}
          {effectiveView === "card" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
              {pagedItems.map((item) => {
                const isSel = selected.has(item._id);
                const photos = (item as any).photos as Array<{ imageUrl: string }> | undefined;
                const total = item.quantity * item.rate;
                return (
                  <div
                    key={item._id}
                    className={cn(
                      "rounded-xl border bg-card shadow-sm transition-all cursor-pointer hover:shadow-md hover:border-primary/30 flex flex-col overflow-hidden",
                      isSel ? "border-primary/50 bg-primary/5" : "border-border"
                    )}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('[data-no-row-click]')) return;
                      openDetailDialog(item);
                    }}
                  >
                    {/* Photo strip */}
                    {photos && photos.length > 0 && (
                      <div className="h-32 w-full overflow-hidden bg-muted relative" data-no-row-click>
                        <img src={photos[0].imageUrl} alt="" className="w-full h-full object-cover" />
                        {photos.length > 1 && (
                          <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                            +{photos.length - 1}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-3 flex flex-col gap-2 flex-1">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground leading-tight truncate">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0" data-no-row-click>
                          <Checkbox checked={isSel} onCheckedChange={() => toggle(item._id)} className="mr-1" />
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => openEditMode(item)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item._id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1">
                        {item.categoryName && item.categoryName !== "—" && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{item.categoryName}</Badge>
                        )}
                        {(item as any).unit && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{(item as any).unit}</Badge>}
                        {(item as any).hsnSacCode && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                            HSN {(item as any).hsnSacCode}
                          </Badge>
                        )}
                      </div>

                      {/* Financials */}
                      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{item.quantity}</span>
                          {(item as any).unit && <span className="ml-0.5">{(item as any).unit}</span>}
                          <span className="mx-1">×</span>
                          <span>₹{item.rate.toLocaleString()}</span>
                        </div>
                        <p className="text-sm font-bold text-primary">₹{total.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Table view ────────────────────────────────────────────────── */}
          {effectiveView === "table" && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-10 pl-3">
                      <Checkbox checked={selected.size === items.length && items.length > 0} onCheckedChange={selectAll} />
                    </TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Item</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[100px]">Category</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[90px]">HSN/SAC</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[60px] text-right">Qty</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[55px]">Unit</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[85px] text-right">Rate</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[90px] text-right">Total</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[80px]">Photos</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((item, i) => {
                    const isSel = selected.has(item._id);
                    const photos = (item as any).photos as Array<{ imageUrl: string }> | undefined;
                    return (
                      <TableRow
                        key={item._id}
                        className={cn("transition-colors cursor-pointer", isSel ? "bg-primary/5" : i % 2 === 1 ? "bg-muted/10" : "", "hover:bg-accent/30")}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('[data-no-row-click]')) return;
                          openDetailDialog(item);
                        }}
                      >
                        <TableCell className="pl-3 py-2.5" data-no-row-click>
                          <Checkbox checked={isSel} onCheckedChange={() => toggle(item._id)} />
                        </TableCell>
                        <TableCell className="py-2.5">
                          <p className="text-sm font-semibold text-foreground leading-tight">{item.name}</p>
                          {item.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {item.categoryName && item.categoryName !== "—"
                            ? <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-medium">{item.categoryName}</Badge>
                            : <span className="text-muted-foreground/30 text-xs">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs font-mono text-muted-foreground">
                          {(item as any).hsnSacCode || <span className="text-muted-foreground/30">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm text-right font-medium">{item.quantity}</TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">{(item as any).unit || "—"}</TableCell>
                        <TableCell className="py-2.5 text-sm text-right text-muted-foreground">₹{item.rate.toLocaleString()}</TableCell>
                        <TableCell className="py-2.5 text-sm text-right font-bold text-foreground">₹{(item.quantity * item.rate).toLocaleString()}</TableCell>
                        <TableCell className="py-2.5" data-no-row-click>
                          {photos && photos.length > 0 ? (
                            <div className="flex gap-1">
                              {photos.slice(0, 2).map((p, idx) => (
                                <button key={idx} type="button" onClick={() => openLightbox(photos.map(x => x.imageUrl), idx)} className="relative">
                                  <img src={p.imageUrl} alt="" className="h-7 w-7 object-cover rounded border border-border hover:border-primary transition-colors" />
                                  {idx === 1 && photos.length > 2 && (
                                    <div className="absolute inset-0 bg-black/60 rounded flex items-center justify-center text-white text-[9px] font-bold">+{photos.length - 2}</div>
                                  )}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 pr-3" data-no-row-click>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item._id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ── Pagination ────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-muted/10 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-7 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>{Math.min((page - 1) * pageSize + 1, totalItems)}–{Math.min(page * pageSize, totalItems)} of {totalItems}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground px-1">{page} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* ── Send to procurement footer ────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/10 flex-wrap">
            <div className="text-sm text-muted-foreground">
              {selected.size > 0
                ? <span><strong className="text-foreground">{selected.size}</strong> item{selected.size !== 1 ? "s" : ""} selected</span>
                : <span>Select items to send to procurement</span>}
            </div>
            <Button
              onClick={() => { if (selected.size === 0) { toast.error("Select at least one item"); return; } setIsConfirmOpen(true); }}
              disabled={selected.size === 0} size="sm"
              className={cn("gap-2 font-semibold text-sm h-8", selected.size > 0 ? "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm" : "")}
              variant={selected.size === 0 ? "outline" : "default"}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Send to Procurement
              {selected.size > 0 && <Badge className="h-4 px-1 text-[10px] bg-white/20 text-white border-0">{selected.size}</Badge>}
            </Button>
          </div>
        </div>
      )}


      {/* ── Add Item Dialog ──────────────────────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!isSubmitting && !isUploadingPhotos) setAddDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Add New Item
            </DialogTitle>
            <DialogDescription>Fill in the details for the new project item.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-1 pt-1">
            <ItemFormFields
              form={form}
              setForm={setForm}
              inventoryItems={inventoryItems}
              selectedInvImages={selectedInvImages}
              setSelectedInvImages={setSelectedInvImages}
              selectedInvHsn={selectedInvHsn}
              setSelectedInvHsn={setSelectedInvHsn}
              inventoryImageUrls={inventoryImageUrls}
              setInventoryImageUrls={setInventoryImageUrls}
              photoPreviews={photoPreviews}
              setPhotoPreviews={setPhotoPreviews}
              selectedPhotos={selectedPhotos}
              setSelectedPhotos={setSelectedPhotos}
              onOpenCamera={() => { setCameraTarget("add"); setCameraOpen(true); }}
              onOpenInvPicker={() => { setInvPickerTarget("add"); setInvImagePickerOpen(true); }}
              fileInputRef={addFileInputRef}
              handlePhotoFiles={(files) => handlePhotoFiles(files, "add")}
            />
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} disabled={isSubmitting || isUploadingPhotos}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || isUploadingPhotos}>
                {(isSubmitting || isUploadingPhotos)
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isUploadingPhotos ? "Uploading…" : "Adding…"}</>
                  : <><Plus className="h-4 w-4 mr-2" />Add Item</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Item Detail / Edit Dialog ────────────────────────────────────── */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => { if (!isSavingEdit) { setDetailDialogOpen(open); if (!open) setDetailItem(null); } }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          {detailItem && detailMode === "view" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  Item Details
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-1">
                {/* Name & category */}
                <div>
                  <p className="text-lg font-bold text-foreground">{detailItem.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {detailItem.categoryName && detailItem.categoryName !== "—" && (
                      <Badge variant="secondary">{detailItem.categoryName}</Badge>
                    )}
                    {(detailItem as any).hsnSacCode && (
                      <Badge variant="outline" className="font-mono">HSN {(detailItem as any).hsnSacCode}</Badge>
                    )}
                    {(detailItem as any).unit && (
                      <Badge variant="outline">{(detailItem as any).unit}</Badge>
                    )}
                  </div>
                </div>

                {/* Description */}
                {detailItem.description && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                    <p className="text-sm text-foreground">{detailItem.description}</p>
                  </div>
                )}

                {/* Financials */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Qty</p>
                    <p className="text-lg font-bold text-foreground">{detailItem.quantity}</p>
                    {(detailItem as any).unit && <p className="text-xs text-muted-foreground">{(detailItem as any).unit}</p>}
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Rate</p>
                    <p className="text-lg font-bold text-foreground">₹{detailItem.rate.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-primary/5 p-3 text-center">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total</p>
                    <p className="text-lg font-bold text-primary">₹{(detailItem.quantity * detailItem.rate).toLocaleString()}</p>
                  </div>
                </div>

                {/* Photos */}
                {(detailItem as any).photos && (detailItem as any).photos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Photos</p>
                    <div className="grid grid-cols-4 gap-2">
                      {((detailItem as any).photos as Array<{ imageUrl: string }>).map((p, idx) => (
                        <button key={idx} type="button" onClick={() => openLightbox((detailItem as any).photos.map((x: any) => x.imageUrl), idx)} className="aspect-square rounded-lg overflow-hidden border border-border hover:border-primary transition-colors">
                          <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>Close</Button>
                <Button onClick={() => openEditMode(detailItem)} className="gap-2">
                  <Edit className="h-4 w-4" />Edit
                </Button>
              </DialogFooter>
            </>
          )}

          {detailItem && detailMode === "edit" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Edit className="h-5 w-5 text-primary" />
                  Edit Item
                </DialogTitle>
                <DialogDescription>Update the item details. HSN/SAC code changes are saved locally only.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveEdit} className="space-y-1 pt-1">
                <ItemFormFields
                  form={editForm}
                  setForm={setEditForm}
                  inventoryItems={inventoryItems}
                  selectedInvImages={editSelectedInvImages}
                  setSelectedInvImages={setEditSelectedInvImages}
                  selectedInvHsn={editSelectedInvHsn}
                  setSelectedInvHsn={setEditSelectedInvHsn}
                  inventoryImageUrls={editInventoryImageUrls}
                  setInventoryImageUrls={setEditInventoryImageUrls}
                  photoPreviews={editPhotoPreviews}
                  setPhotoPreviews={setEditPhotoPreviews}
                  selectedPhotos={editSelectedPhotos}
                  setSelectedPhotos={setEditSelectedPhotos}
                  onOpenCamera={() => { setCameraTarget("edit"); setCameraOpen(true); }}
                  onOpenInvPicker={() => { setInvPickerTarget("edit"); setInvImagePickerOpen(true); }}
                  fileInputRef={editFileInputRef}
                  handlePhotoFiles={(files) => handlePhotoFiles(files, "edit")}
                />
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setDetailMode("view")} disabled={isSavingEdit}>Cancel</Button>
                  <Button type="submit" disabled={isSavingEdit}>
                    {isSavingEdit ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirm Send Dialog ──────────────────────────────────────────── */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" />Send to Procurement</DialogTitle>
            <DialogDescription>Creates an RFQ with {selected.size} item(s) and sends them to the Cost Comparison queue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[260px] overflow-y-auto py-2">
            {selectedItems.map((item, idx) => (
              <div key={item._id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Badge variant="secondary" className="h-6 w-6 rounded-full p-0 flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity}{(item as any).unit ? ` ${(item as any).unit}` : ""} × ₹{item.rate.toLocaleString()} = ₹{(item.quantity * item.rate).toLocaleString()}
                  </p>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmOpen(false)} disabled={isSending}>Cancel</Button>
            <Button onClick={handleSend} disabled={isSending} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white">
              {isSending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : <><Send className="h-4 w-4 mr-2" />Confirm & Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Category Dialog ──────────────────────────────────────────── */}
      <Dialog open={isCatOpen} onOpenChange={setIsCatOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>New Category</DialogTitle>
            <DialogDescription>Create a material category available across all projects.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCat} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input placeholder="e.g. Plumbing, Civil, Electrical" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCatOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!newCatName.trim()}>Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Photo Lightbox ───────────────────────────────────────────────── */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="sm:max-w-[700px] p-2 bg-black/95 border-border">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          <div className="relative flex items-center justify-center min-h-[300px]">
            {lightboxPhotos[lightboxIndex] && (
              <img src={lightboxPhotos[lightboxIndex]} alt="" className="max-h-[70vh] max-w-full object-contain rounded" />
            )}
            {lightboxPhotos.length > 1 && (
              <>
                <button onClick={() => setLightboxIndex((i) => (i === 0 ? lightboxPhotos.length - 1 : i - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button onClick={() => setLightboxIndex((i) => (i === lightboxPhotos.length - 1 ? 0 : i + 1))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70">
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/70 text-xs">{lightboxIndex + 1} / {lightboxPhotos.length}</div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Camera ───────────────────────────────────────────────────────── */}
      <CameraDialog open={cameraOpen} onOpenChange={setCameraOpen} onCapture={handleCameraCapture} multiple />

      {/* ── Inventory Image Picker Dialog ────────────────────────────────── */}
      {invImagePickerOpen && (
        <Dialog open={invImagePickerOpen} onOpenChange={setInvImagePickerOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-primary" />
                Use Image from Inventory
              </DialogTitle>
              <DialogDescription>
                Click an image to add it to this item's photos.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto py-2">
              {(invPickerTarget === "add" ? selectedInvImages : editSelectedInvImages).map((img, idx) => {
                const currentUrls = invPickerTarget === "add" ? inventoryImageUrls : editInventoryImageUrls;
                const setCurrentUrls = invPickerTarget === "add" ? setInventoryImageUrls : setEditInventoryImageUrls;
                const setCurrentPreviews = invPickerTarget === "add" ? setPhotoPreviews : setEditPhotoPreviews;
                const isSelected = currentUrls.includes(img.imageUrl);
                return (
                  <button
                    key={idx}
                    type="button"
                    className={cn(
                      "relative aspect-square rounded-lg overflow-hidden border-2 transition-all group",
                      isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
                    )}
                    onClick={() => {
                      if (isSelected) {
                        setCurrentUrls((prev) => prev.filter((u) => u !== img.imageUrl));
                        setCurrentPreviews((prev) => prev.filter((u) => u !== img.imageUrl));
                      } else {
                        setCurrentUrls((prev) => [...prev, img.imageUrl]);
                        setCurrentPreviews((prev) => [...prev, img.imageUrl]);
                      }
                    }}
                  >
                    <img src={img.imageUrl} alt={`Inventory image ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                    {isSelected ? (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="bg-primary text-primary-foreground rounded-full p-1 shadow-lg">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg">
                          <Plus className="h-4 w-4" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {(invPickerTarget === "add" ? inventoryImageUrls : editInventoryImageUrls).length} selected
              </p>
              <Button size="sm" onClick={() => setInvImagePickerOpen(false)}>Done</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
