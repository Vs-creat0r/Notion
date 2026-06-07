"use client";

/**
 * User Management Component
 * 
 * Main component for managing users (Manager only).
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
import { CreateUserDialog } from "./create-user-dialog";
import { UserTable } from "./user-table";
import { ROLES, ROLE_LABELS, Role } from "@/lib/auth/roles";
import { useViewMode } from "@/hooks/use-view-mode";
import { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { ExportExcelButton } from "@/components/ui/export-excel-button";
import { exportToExcel, fmtExcelDate, type ExcelColumn } from "@/lib/excel-export";

type ViewMode = "table" | "card";
type SortOption = "newest" | "oldest" | "name_asc" | "name_desc";

export function UserManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const { viewMode, toggleViewMode } = useViewMode("user-view-mode");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isAuthenticated } = useAuth();


  // Only fetch users if user is signed in
  const users = useQuery(
    api.users.getAllUsers,
    isAuthenticated ? {} : "skip"
  );

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    // Load from localStorage on mount
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('userPageSize');
      return saved ? Number(saved) : 10;
    }
    return 10;
  });

  // Save page size to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('userPageSize', pageSize.toString());
    }
  }, [pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, statusFilter, sortBy]);

  // Filter and sort users
  const filteredAndSortedUsers = useMemo(() => {
    if (!users) return undefined;

    let filtered = [...users];

    // Search filter - smart search with normalized query
    const normalizedQuery = normalizeSearchQuery(searchQuery);
    if (normalizedQuery) {
      filtered = filtered.filter((user) =>
        matchesAnySearchQuery(
          [user.fullName, user.username, user.phoneNumber, user.address],
          normalizedQuery
        )
      );
    }

    // Role filter
    if (roleFilter !== "all") {
      filtered = filtered.filter((user) => user.role === roleFilter);
    }

    // Status filter
    if (statusFilter !== "all") {
      const isActive = statusFilter === "active";
      filtered = filtered.filter((user) => user.isActive === isActive);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return b.createdAt - a.createdAt;
        case "oldest":
          return a.createdAt - b.createdAt;
        case "name_asc":
          return a.fullName.localeCompare(b.fullName);
        case "name_desc":
          return b.fullName.localeCompare(a.fullName);
        default:
          return 0;
      }
    });

    return filtered;
  }, [users, searchQuery, roleFilter, statusFilter, sortBy]);

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
              placeholder="Search by name, username, or phone..."
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[140px] h-10 text-sm bg-muted/30 border-muted-foreground/20 font-medium">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-10 text-sm bg-muted/30 border-muted-foreground/20 font-medium">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger className="w-[140px] h-10 text-sm bg-muted/30 border-muted-foreground/20 font-medium">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                <SelectItem value="name_desc">Name (Z-A)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="h-10 px-6 shadow-sm hover:shadow-md transition-all font-semibold w-full sm:w-auto"
          >
            <Plus className="h-5 w-5 mr-1.5" />
            Create User
          </Button>

          <ExportExcelButton
            label="Download XL"
            onExport={async () => {
              const allUsers = filteredAndSortedUsers || [];
              if (allUsers.length === 0) throw new Error("No data to export");
              const columns: ExcelColumn[] = [
                { header: "S.No", key: "sno", type: "number", width: 6 },
                { header: "Full Name", key: "fullName", width: 22 },
                { header: "Username", key: "username", width: 16 },
                { header: "Role", key: "role", width: 18 },
                { header: "Status", key: "status", width: 10 },
                { header: "Phone", key: "phone", width: 16 },
                { header: "Address", key: "address", width: 28 },
                { header: "Created Date", key: "createdDate", type: "date", width: 14 },
              ];
              const data = allUsers.map((u: any, idx: number) => ({
                sno: idx + 1,
                fullName: u.fullName || "\u2014",
                username: u.username || "\u2014",
                role: ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] || u.role || "\u2014",
                status: u.isActive ? "Active" : "Inactive",
                phone: u.phoneNumber || "\u2014",
                address: u.address || "\u2014",
                createdDate: fmtExcelDate(u.createdAt),
              }));
              return exportToExcel({ fileName: "User_Management", sheetName: "Users", columns, data });
            }}
          />
        </div>
      </div>

      {/* Pagination Logic */}
      {(() => {
        const totalItems = filteredAndSortedUsers?.length || 0;
        const totalPages = Math.ceil(totalItems / pageSize);
        const paginatedUsers = filteredAndSortedUsers?.slice(
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
                itemCount={paginatedUsers?.length || 0}
                className="py-0"
              />
            </div>

            <UserTable
              key={refreshKey}
              users={paginatedUsers}
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
                itemCount={paginatedUsers?.length || 0}
                className="py-0"
              />
            </div>
          </>
        );
      })()}

      {/* Create user dialog */}
      <CreateUserDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}

