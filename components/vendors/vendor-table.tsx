"use client";

/**
 * Vendor Table Component
 * 
 * Displays all vendors in a table or card view with actions (Purchase Officer only for CRUD).
 */

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { MoreHorizontal, Edit, Trash2, Building2, Mail, Phone, MapPin, Hash, Calendar, User } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import { ROLES } from "@/lib/auth/roles";
import { VendorFormDialog } from "./vendor-form-dialog";
import { toast } from "sonner";
// ... top imports ...
import type { Doc } from "@/convex/_generated/dataModel";
import { VendorInfoDialog } from "@/components/purchase/vendor-info-dialog";
import { VendorHistoryDialog } from "./vendor-history-dialog";
import { History as HistoryIcon } from "lucide-react";

type ViewMode = "table" | "card";

interface VendorTableProps {
  vendors: typeof import("@/convex/_generated/api").api.vendors.getAllVendors._returnType | undefined;
  viewMode?: ViewMode;
}

export function VendorTable({ vendors, viewMode = "table" }: VendorTableProps) {
  const userRole = useUserRole();

  const [editingVendor, setEditingVendor] = useState<Doc<"vendors"> | null>(null);
  const [viewingVendorId, setViewingVendorId] = useState<string | null>(null);
  const [historyVendorId, setHistoryVendorId] = useState<string | null>(null);
  const [deletingVendor, setDeletingVendor] = useState<Doc<"vendors"> | null>(null);
  const [loadingVendorId, setLoadingVendorId] = useState<string | null>(null);
  const deleteVendor = useMutation(api.vendors.deleteVendor);

  // Check vendor usage when delete dialog opens
  const vendorUsage = useQuery(
    api.vendors.checkVendorUsage,
    deletingVendor ? { vendorId: deletingVendor._id } : "skip"
  );

  const canPerformCRUD = userRole === ROLES.PURCHASE_OFFICER || userRole === ROLES.MANAGER; // Only Purchase Officers and Managers can edit/delete
  const canDelete = userRole === ROLES.PURCHASE_OFFICER || userRole === ROLES.MANAGER; // Only Purchase Officers and Managers can delete

  const handleOpenInMap = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
    window.open(mapUrl, '_blank');
  };

  const handleDelete = async () => {
    if (!deletingVendor) return;

    setLoadingVendorId(deletingVendor._id);
    try {
      await deleteVendor({ vendorId: deletingVendor._id });
      toast.success("Vendor deleted permanently");
      setDeletingVendor(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete vendor";
      toast.error(errorMessage);
    } finally {
      setLoadingVendorId(null);
    }
  };

  if (!vendors) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  if (vendors.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No vendors found. Add your first vendor to get started.
      </div>
    );
  }

  const VendorCard = ({ vendor }: { vendor: Doc<"vendors"> }) => {
    return (
      <Card className="h-full flex flex-col hover:shadow-md transition-all duration-200 border border-border bg-card group rounded-xl overflow-hidden">
        <CardHeader className="p-4 pb-3 border-b border-border/40 bg-muted/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border border-primary/10">
                  <Building2 className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle
                    className="text-base font-bold truncate pr-2 leading-tight cursor-pointer hover:text-primary transition-colors hover:underline underline-offset-4 decoration-primary/30"
                    title={vendor.companyName}
                    onClick={() => setViewingVendorId(vendor._id)}
                  >
                    {vendor.companyName}
                  </CardTitle>
                </div>
              </div>
              <Badge variant="secondary" className="font-mono text-[10px] h-5 px-1.5 ml-11 text-muted-foreground border-border/50 bg-background/50 w-fit max-w-[calc(100%-2.75rem)] truncate">
                <Hash className="h-3 w-3 mr-1 opacity-50 shrink-0" />
                {vendor.gstNumber}
              </Badge>
            </div>
            {canPerformCRUD && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/70 hover:text-foreground shrink-0 -mr-2 -mt-1">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setEditingVendor(vendor)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Vendor
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setHistoryVendorId(vendor._id)}>
                    <HistoryIcon className="h-4 w-4 mr-2" />
                    View History
                  </DropdownMenuItem>
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeletingVendor(vendor)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Vendor
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-4 space-y-4 flex-1 flex flex-col">
          <div className="grid grid-cols-2 gap-4">
            {vendor.contactName && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">Contact</span>
                </div>
                <p className="text-sm font-medium pl-5 truncate">{vendor.contactName}</p>
              </div>
            )}
            {vendor.phone && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">Phone</span>
                </div>
                <p className="text-sm font-medium pl-5 font-mono text-xs">{vendor.phone}</p>
              </div>
            )}
          </div>

          <div className="space-y-1 pt-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3 w-3" />
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">Email</span>
            </div>
            <p className="text-sm font-medium pl-5 truncate hover:text-primary transition-colors cursor-pointer" title={vendor.email}>{vendor.email}</p>
          </div>

          <div className="space-y-1 pt-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">Address</span>
            </div>
            <div className="pl-5 flex items-start gap-2">
              <p className="text-sm text-balance text-muted-foreground leading-relaxed line-clamp-2">{vendor.address}</p>
              <button
                onClick={() => handleOpenInMap(vendor.address)}
                className="text-primary hover:text-primary/80 hover:bg-primary/5 p-1 rounded-md transition-colors shrink-0"
                title="Open in Maps"
              >
                <MapPin className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground/60">
            <Calendar className="h-3.5 w-3.5" />
            <span>Created {new Date(vendor.createdAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card >
    );
  };

  return (
    <>
      {/* Table View */}
      {viewMode === "table" && (
        <div className="border rounded-xl overflow-hidden shadow-sm bg-background">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-[180px] font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Company Name</TableHead>
                  <TableHead className="w-[140px] font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Contact Person</TableHead>
                  <TableHead className="w-[160px] font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Email</TableHead>
                  <TableHead className="w-[120px] font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Phone</TableHead>
                  <TableHead className="w-[140px] font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">GST Number</TableHead>
                  <TableHead className="min-w-[200px] font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Address</TableHead>
                  <TableHead className="w-[100px] font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Created</TableHead>
                  {canPerformCRUD && <TableHead className="w-[60px] text-right font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((vendor, index) => (
                  <TableRow
                    key={vendor._id}
                    className={`
                        group transition-all duration-300 border-b last:border-0 hover:bg-primary/5 hover:shadow-sm hover:z-10 hover:relative
                        ${index % 2 === 0 ? "bg-background" : "bg-muted/20"}
                        animate-in fade-in slide-in-from-bottom-3
                    `}
                    style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
                  >
                    <TableCell className="align-top py-4 pl-4">
                      <div
                        className="font-bold text-sm text-foreground hover:text-primary transition-colors cursor-pointer hover:underline underline-offset-4 decoration-primary/30"
                        onClick={() => setViewingVendorId(vendor._id)}
                      >
                        {vendor.companyName}
                      </div>
                    </TableCell>
                    <TableCell className="align-top py-4 font-medium text-sm text-muted-foreground">
                      <div
                        className="cursor-pointer hover:text-foreground transition-colors w-fit"
                        onClick={() => setViewingVendorId(vendor._id)}
                      >
                        {vendor.contactName || <span className="text-muted-foreground/30 pointer-events-none">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="align-top py-4 text-sm font-medium">{vendor.email}</TableCell>
                    <TableCell className="align-top py-4 text-xs font-mono">{vendor.phone || <span className="text-muted-foreground/30 font-sans text-sm">—</span>}</TableCell>
                    <TableCell className="align-top py-4">
                      <Badge variant="outline" className="font-mono text-[10px] bg-background/50">{vendor.gstNumber}</Badge>
                    </TableCell>
                    <TableCell className="align-top py-4 max-w-xs">
                      <div className="flex items-start gap-2 group/addr">
                        <span className="text-sm text-muted-foreground line-clamp-2 leading-relaxed flex-1">{vendor.address}</span>
                        <button
                          onClick={() => handleOpenInMap(vendor.address)}
                          className="text-primary p-1 hover:bg-primary/10 rounded transition-colors"
                          title="Open in Maps"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground/70 text-xs align-top py-4">
                      {new Date(vendor.createdAt).toLocaleDateString()}
                    </TableCell>
                    {canPerformCRUD && (
                      <TableCell className="text-right align-top py-4 pr-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 hover:text-primary hover:bg-primary/5 rounded-full">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setEditingVendor(vendor)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Vendor
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setHistoryVendorId(vendor._id)}>
                              <HistoryIcon className="h-4 w-4 mr-2" />
                              View History
                            </DropdownMenuItem>
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setDeletingVendor(vendor)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Vendor
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Card View */}
      {viewMode === "card" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6 pt-2 pb-10">
          {vendors.map((vendor, index) => (
            <div
              key={vendor._id}
              className="animate-in fade-in slide-in-from-bottom-5 h-full"
              style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
            >
              <VendorCard vendor={vendor} />
            </div>
          ))}
        </div>
      )}

      {/* Edit Vendor Dialog */}
      <VendorFormDialog
        open={editingVendor !== null}
        onOpenChange={(open) => !open && setEditingVendor(null)}
        vendorId={editingVendor?._id}
        initialData={editingVendor ? {
          companyName: editingVendor.companyName,
          contactName: editingVendor.contactName,
          email: editingVendor.email,
          phone: editingVendor.phone,
          gstNumber: editingVendor.gstNumber,
          address: editingVendor.address,
        } : null}
      />

      {/* View Vendor Details Dialog */}
      <VendorInfoDialog
        open={viewingVendorId !== null}
        onOpenChange={(open) => !open && setViewingVendorId(null)}
        vendorId={viewingVendorId as any}
      />

      {/* Vendor History Dialog */}
      <VendorHistoryDialog
        open={historyVendorId !== null}
        onOpenChange={(open) => !open && setHistoryVendorId(null)}
        vendorId={historyVendorId as any}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deletingVendor !== null} onOpenChange={(open) => !open && setDeletingVendor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {vendorUsage?.isInUse ? (
                <div className="space-y-2">
                  <p>
                    Cannot delete <strong>{deletingVendor?.companyName}</strong> because it is currently in use.
                  </p>
                  {vendorUsage.usedInInventory > 0 && (
                    <p className="text-destructive">
                      • Used in {vendorUsage.usedInInventory} inventory item(s)
                    </p>
                  )}
                  <p className="mt-2">
                    Please remove the vendor from inventory items before deleting.
                  </p>
                </div>
              ) : (
                <p>
                  This will <strong>permanently delete</strong> vendor <strong>{deletingVendor?.companyName}</strong>. This action cannot be undone and the vendor will be removed permanently.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={vendorUsage?.isInUse || loadingVendorId === deletingVendor?._id}
              className={vendorUsage?.isInUse ? "opacity-50 cursor-not-allowed" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {loadingVendorId === deletingVendor?._id ? "Deleting..." : "Delete Vendor"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

