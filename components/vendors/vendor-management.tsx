"use client";

/**
 * Vendor Management Component
 * 
 * Main component for managing vendors with search, filters, and responsive views.
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "convex/react";
import { useAuth } from "@/app/providers/auth-provider";
import { api } from "@/convex/_generated/api";
import { normalizeSearchQuery, matchesAnySearchQuery } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, LayoutGrid, Table2, RefreshCw } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { VendorFormDialog } from "./vendor-form-dialog";
import { VendorTable } from "./vendor-table";
import { useUserRole } from "@/hooks/use-user-role";
import { ROLES } from "@/lib/auth/roles";
import { useViewMode } from "@/hooks/use-view-mode";
import { cn } from "@/lib/utils";
import { ExportExcelButton } from "@/components/ui/export-excel-button";
import { exportToExcel, fmtExcelDate, type ExcelColumn } from "@/lib/excel-export";

type ViewMode = "table" | "card";
type SortOption = "newest" | "oldest" | "name_asc" | "name_desc";

interface VendorManagementProps {
  showTableOnly?: boolean;
}

export function VendorManagement({ showTableOnly = false }: VendorManagementProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const { viewMode, toggleViewMode } = useViewMode("vendor-view-mode");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isAuthenticated } = useAuth();
  const userRole = useUserRole();

  const canCreate = userRole === ROLES.PURCHASE_OFFICER || userRole === ROLES.MANAGER;



  // Only fetch vendors if user is signed in
  const vendors = useQuery(
    api.vendors.getAllVendors,
    isAuthenticated ? {} : "skip"
  );

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    // Load from localStorage on mount
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vendorPageSize');
      return saved ? Number(saved) : 10;
    }
    return 10;
  });

  // Save page size to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vendorPageSize', pageSize.toString());
    }
  }, [pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy]);

  // Filter and sort vendors
  const filteredAndSortedVendors = useMemo(() => {
    if (!vendors) return undefined;

    let filtered = [...vendors];

    // Search filter - smart search with normalized query
    const normalizedQuery = normalizeSearchQuery(searchQuery);
    if (normalizedQuery) {
      filtered = filtered.filter((vendor) =>
        matchesAnySearchQuery(
          [
            vendor.companyName,
            vendor.contactName,
            vendor.email,
            vendor.phone,
            vendor.gstNumber,
            vendor.address,
          ],
          normalizedQuery
        )
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return b.createdAt - a.createdAt;
        case "oldest":
          return a.createdAt - b.createdAt;
        case "name_asc":
          return a.companyName.localeCompare(b.companyName);
        case "name_desc":
          return b.companyName.localeCompare(a.companyName);
        default:
          return 0;
      }
    });

    return filtered;
  }, [vendors, searchQuery, sortBy]);

  if (showTableOnly) {
    return <VendorTable vendors={filteredAndSortedVendors ?? undefined} viewMode={viewMode} />;
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters Toolbar */}
      <div className="flex flex-col gap-3 bg-card p-3 rounded-xl border border-border shadow-sm">
        {/* Row 1: Search and View Toggle */}
        <div className="flex items-center gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by company, email, phone, GST, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-muted/30 border-muted-foreground/20 focus-visible:ring-primary/20 transition-all font-medium w-full"
            />
          </div>

          {/* View mode toggle */}
          <Button
            variant="outline"
            size="icon"
            onClick={toggleViewMode}
            className="h-10 w-10 flex-shrink-0 bg-muted/30 border-muted-foreground/20 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all"
            title={viewMode === "card" ? "Switch to Table View" : "Switch to Card View"}
          >
            {viewMode === "card" ? (
              <Table2 className="h-5 w-5" />
            ) : (
              <LayoutGrid className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Row 2: Filters and Actions */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/50">
          {/* Sort Filter */}
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectTrigger className="w-[180px] h-10 text-sm bg-muted/30 border-muted-foreground/20 font-medium">
              <SelectValue placeholder="Sort Vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="name_asc">Name (A-Z)</SelectItem>
              <SelectItem value="name_desc">Name (Z-A)</SelectItem>
            </SelectContent>
          </Select>

          {/* Add Vendor Button */}
          {canCreate && (
            <Button
              onClick={() => setIsCreateDialogOpen(true)}
              className="h-10 px-6 shadow-sm hover:shadow-md transition-all font-semibold"
            >
              <Plus className="h-5 w-5 mr-1.5" />
              Add New Vendor
            </Button>
          )}

          <ExportExcelButton
            label="Download XL"
            className="ml-auto"
            onExport={async () => {
              const allVendors = filteredAndSortedVendors || [];
              if (allVendors.length === 0) throw new Error("No data to export");
              const columns: ExcelColumn[] = [
                { header: "S.No", key: "sno", type: "number", width: 6 },
                { header: "Company Name", key: "companyName", width: 28 },
                { header: "Contact Person", key: "contactName", width: 20 },
                { header: "Email", key: "email", width: 24 },
                { header: "Phone", key: "phone", width: 16 },
                { header: "GST Number", key: "gstNumber", width: 18 },
                { header: "PAN Number", key: "panNumber", width: 14 },
                { header: "Address", key: "address", width: 32 },
                { header: "Bank Name", key: "bankName", width: 18 },
                { header: "Account Number", key: "accountNumber", width: 20 },
                { header: "IFSC Code", key: "ifscCode", width: 14 },
                { header: "Created Date", key: "createdDate", type: "date", width: 14 },
              ];
              const data = allVendors.map((v: any, idx: number) => ({
                sno: idx + 1,
                companyName: v.companyName || "\u2014",
                contactName: v.contactName || "\u2014",
                email: v.email || "\u2014",
                phone: v.phone || "\u2014",
                gstNumber: v.gstNumber || "\u2014",
                panNumber: v.panNumber || "\u2014",
                address: v.address || "\u2014",
                bankName: v.bankName || "\u2014",
                accountNumber: v.accountNumber || "\u2014",
                ifscCode: v.ifscCode || "\u2014",
                createdDate: fmtExcelDate(v.createdAt),
              }));
              return exportToExcel({ fileName: "Vendors", sheetName: "Vendors", columns, data });
            }}
          />
        </div>
      </div>

      {/* Pagination Logic */}
      {(() => {
        const totalItems = filteredAndSortedVendors?.length || 0;
        const totalPages = Math.ceil(totalItems / pageSize);
        const paginatedVendors = filteredAndSortedVendors?.slice(
          (currentPage - 1) * pageSize,
          currentPage * pageSize
        );

        return (
          <>
            {/* Top Pagination */}
            <div className="mb-4 bg-card p-2 rounded-xl border border-border shadow-sm">
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                totalItems={totalItems}
                pageSizeOptions={[10, 25, 50, 100]}
                itemCount={paginatedVendors?.length || 0}
                className="py-0"
              />
            </div>

            <VendorTable
              key={refreshKey}
              vendors={paginatedVendors}
              viewMode={viewMode}
            />

            {/* Bottom Pagination */}
            <div className="mt-4 bg-card p-2 rounded-xl border border-border shadow-sm">
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                totalItems={totalItems}
                pageSizeOptions={[10, 25, 50, 100]}
                itemCount={paginatedVendors?.length || 0}
                className="py-0"
              />
            </div>
          </>
        );
      })()}

      {/* Create vendor dialog */}
      {canCreate && (
        <VendorFormDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
        />
      )}
    </div>
  );
}

