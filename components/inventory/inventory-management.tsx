"use client";

/**
 * Inventory Management Component
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
import { Plus, Search, LayoutGrid, Table2 } from "lucide-react";
import { InventoryFormDialog } from "./inventory-form-dialog";
import { InventoryTable } from "./inventory-table";
import { ROLES, Role } from "@/lib/auth/roles";
import { useViewMode } from "@/hooks/use-view-mode";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { ExportExcelButton } from "@/components/ui/export-excel-button";
import { exportToExcel, fmtExcelDate, type ExcelColumn } from "@/lib/excel-export";

type ViewMode = "table" | "card";
type SortOption = "newest" | "oldest" | "name_asc" | "name_desc" | "stock_asc" | "stock_desc";

interface InventoryManagementProps {
  userRole: Role;
}

export function InventoryManagement({ userRole }: InventoryManagementProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const { viewMode, toggleViewMode } = useViewMode("inventory-view-mode");
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isAuthenticated } = useAuth();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("inventoryPageSize");
      return saved ? Number(saved) : 10;
    }
    return 10;
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("inventoryPageSize", pageSize.toString());
  }, [pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, selectedCategoryId]);

  const canCreate = userRole === ROLES.PURCHASE_OFFICER || userRole === ROLES.MANAGER;

  const items = useQuery(api.inventory.getAllInventoryItems, isAuthenticated ? {} : "skip");
  const categories = useQuery(api.inventory.getInventoryCategories);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey(Date.now());
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const filteredAndSortedItems = useMemo(() => {
    if (!items) return undefined;
    let filtered = [...items];

    // Category filter
    if (selectedCategoryId !== "all") {
      filtered = filtered.filter((item) => (item as any).categoryId === selectedCategoryId);
    }

    // Search filter
    const normalizedQuery = normalizeSearchQuery(searchQuery);
    if (normalizedQuery) {
      filtered = filtered.filter((item) =>
        matchesAnySearchQuery(
          [
            item.itemName,
            item.unit,
            (item as any).categoryName,
            item.vendor?.companyName,
            ...(item.vendors?.map((v) => v.companyName) || []),
          ],
          normalizedQuery
        )
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest": return b.createdAt - a.createdAt;
        case "oldest": return a.createdAt - b.createdAt;
        case "name_asc": return a.itemName.localeCompare(b.itemName);
        case "name_desc": return b.itemName.localeCompare(a.itemName);
        case "stock_asc": return (a.centralStock || 0) - (b.centralStock || 0);
        case "stock_desc": return (b.centralStock || 0) - (a.centralStock || 0);
        default: return 0;
      }
    });

    return filtered;
  }, [items, searchQuery, sortBy, selectedCategoryId]);

  return (
    <div className="space-y-4">
      {/* Search and Filters Toolbar */}
      <div className="flex flex-col gap-3 bg-card p-3 rounded-xl border border-border shadow-sm">
        {/* Row 1: Search + View Toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by item name, unit, category or vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-muted/30 border-muted-foreground/20 focus-visible:ring-primary/20 transition-all font-medium w-full"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleViewMode}
            className="h-10 w-10 flex-shrink-0 bg-muted/30 border-muted-foreground/20 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all"
            title={viewMode === "card" ? "Switch to Table View" : "Switch to Card View"}
          >
            {viewMode === "card" ? <Table2 className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
          </Button>
        </div>

        {/* Row 2: Category filter + Sort + Add */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
          {/* Category dropdown filter */}
          <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
            <SelectTrigger className="w-[180px] h-9 text-sm bg-muted/30 border-muted-foreground/20 font-medium">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat._id} value={cat._id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectTrigger className="w-[160px] h-9 text-sm bg-muted/30 border-muted-foreground/20 font-medium">
              <SelectValue placeholder="Sort Items" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="name_asc">Name (A-Z)</SelectItem>
              <SelectItem value="name_desc">Name (Z-A)</SelectItem>
              <SelectItem value="stock_asc">Stock (Low-High)</SelectItem>
              <SelectItem value="stock_desc">Stock (High-Low)</SelectItem>
            </SelectContent>
          </Select>

          {canCreate && (
            <Button onClick={() => setIsCreateDialogOpen(true)} className="h-9 px-5 shadow-sm font-semibold">
              <Plus className="h-4 w-4 mr-1.5" />
              Add New Item
            </Button>
          )}

          <ExportExcelButton
            size="sm"
            label="Download XL"
            className="ml-auto"
            onExport={async () => {
              const allItems = filteredAndSortedItems || [];
              if (allItems.length === 0) throw new Error("No data to export");
              const columns: ExcelColumn[] = [
                { header: "S.No", key: "sno", type: "number", width: 6 },
                { header: "Item Name", key: "itemName", width: 28 },
                { header: "Category", key: "category", width: 18 },
                { header: "Unit", key: "unit", width: 10 },
                { header: "Central Stock", key: "centralStock", type: "number", width: 14 },
                { header: "Min Stock Level", key: "minStockLevel", type: "number", width: 14 },
                { header: "HSN Code", key: "hsnCode", width: 14 },
                { header: "Vendor(s)", key: "vendors", width: 30 },
                { header: "Created Date", key: "createdDate", type: "date", width: 14 },
              ];
              const data = allItems.map((item: any, idx: number) => ({
                sno: idx + 1,
                itemName: item.itemName || "\u2014",
                category: item.categoryName || "\u2014",
                unit: item.unit || "\u2014",
                centralStock: item.centralStock ?? 0,
                minStockLevel: item.minStockLevel ?? 0,
                hsnCode: item.hsnCode || "\u2014",
                vendors: item.vendors?.map((v: any) => v.companyName).join(", ") || item.vendor?.companyName || "\u2014",
                createdDate: fmtExcelDate(item.createdAt),
              }));
              return exportToExcel({ fileName: "Inventory", sheetName: "Inventory", columns, data });
            }}
          />
        </div>
      </div>

      {/* Pagination + Table */}
      {(() => {
        const totalItems = filteredAndSortedItems?.length || 0;
        const totalPages = Math.ceil(totalItems / pageSize);
        const paginatedItems = filteredAndSortedItems?.slice(
          (currentPage - 1) * pageSize,
          currentPage * pageSize
        );

        return (
          <>
            <div className="mb-4 bg-card p-2 rounded-xl border border-border shadow-sm">
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                totalItems={totalItems}
                pageSizeOptions={[10, 25, 50, 100]}
                itemCount={paginatedItems?.length || 0}
                className="py-0"
              />
            </div>

            <InventoryTable
              key={refreshKey}
              items={paginatedItems}
              viewMode={viewMode}
              onRefresh={handleRefresh}
            />

            <div className="mt-4 bg-card p-2 rounded-xl border border-border shadow-sm">
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                totalItems={totalItems}
                pageSizeOptions={[10, 25, 50, 100]}
                itemCount={paginatedItems?.length || 0}
                className="py-0"
              />
            </div>
          </>
        );
      })()}

      {canCreate && (
        <InventoryFormDialog
          open={isCreateDialogOpen}
          onOpenChange={(open) => {
            setIsCreateDialogOpen(open);
            if (!open) handleRefresh();
          }}
        />
      )}
    </div>
  );
}

