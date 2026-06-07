"use client";

/**
 * GRN Register — Digital Warehouse Goods Receipt Note Register (Logbook)
 * Layout matches the purchase requests page exactly:
 * Search bar → Filter row → Pagination → Table → Pagination
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
    CalendarIcon,
    Upload,
    Search,
    FileText,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    X,
    RefreshCw,
    LayoutGrid,
    Table2,
    BookOpen,
    Filter,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { MediaInput } from "@/components/shared/media-input";
import { PDFPreviewDialog } from "@/components/purchase/pdf-preview-dialog";
import { VendorInfoDialog } from "@/components/purchase/vendor-info-dialog";
import { ItemInfoDialog } from "@/components/requests/item-info-dialog";
import { LocationInfoDialog } from "@/components/locations/location-info-dialog";
import { PaginationControls } from "@/components/ui/pagination-controls";
import type { Id } from "@/convex/_generated/dataModel";
import { ExportExcelButton } from "@/components/ui/export-excel-button";
import { exportToExcel, fmtExcelDate, type ExcelColumn } from "@/lib/excel-export";

type SortField = "grnNumber" | "grnDate" | "invoiceNo" | "poNumber" | "vendorName" | "materialName" | "quantity" | "rate" | "total" | "site" | "invoiceDate";
type SortDirection = "asc" | "desc";

export function GRNPageContent() {
    const grns = useQuery(api.grn.getAllGRNs) as any;
    const updateGRN = useMutation(api.grn.updateGRN);

    const [searchQuery, setSearchQuery] = useState("");
    const [sortField, setSortField] = useState<SortField>("grnDate");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
    const [viewMode, setViewMode] = useState<"table" | "card">("table");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        setIsHydrated(true);
        const saved = localStorage.getItem("grnPageSize");
        if (saved) setPageSize(Number(saved));
        const savedView = localStorage.getItem("grnViewMode");
        if (savedView === "card" || savedView === "table") setViewMode(savedView);
    }, []);

    useEffect(() => {
        if (isHydrated) localStorage.setItem("grnPageSize", pageSize.toString());
    }, [pageSize, isHydrated]);

    useEffect(() => {
        if (isHydrated) localStorage.setItem("grnViewMode", viewMode);
    }, [viewMode, isHydrated]);

    useEffect(() => { setCurrentPage(1); }, [searchQuery]);

    // Inline Upload State
    const [inlineUploadGRNId, setInlineUploadGRNId] = useState<Id<"grns"> | null>(null);
    const [inlineUploadPhoto, setInlineUploadPhoto] = useState<File | null>(null);
    const [isUploadingInline, setIsUploadingInline] = useState(false);

    // PDF Preview state
    const [pdfPreviewPoNumber, setPdfPreviewPoNumber] = useState<string | null>(null);
    const [pdfPreviewRequestId, setPdfPreviewRequestId] = useState<string | null>(null);

    // Info dialog state
    const [selectedVendorId, setSelectedVendorId] = useState<Id<"vendors"> | null>(null);
    const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
    const [selectedSiteId, setSelectedSiteId] = useState<Id<"sites"> | null>(null);

    // Enrich GRN data with computed fields
    const enrichedGRNs = useMemo(() => {
        if (!grns) return [];
        return grns.map((_grn: any) => {
            const grn = _grn as any;
            const po = grn.po as any;
            const basis = po?.perUnitBasis || 1;
            const unitRate = po?.unitRate || 0;
            const rate = unitRate / basis;
            const total = grn.receivedQuantity * rate;
            return {
                ...grn,
                rate,
                total,
                vendorName: grn.vendor?.companyName || "—",
                materialName: grn.itemName || po?.itemDescription?.split("\n")[0] || "—",
                siteName: grn.site?.name || "—",
            };
        });
    }, [grns]);

    // Filter
    const filtered = useMemo(() => {
        if (!searchQuery.trim()) return enrichedGRNs;
        const q = searchQuery.toLowerCase();
        return enrichedGRNs.filter(
            (grn: any) =>
                grn.grnNumber.toLowerCase().includes(q) ||
                grn.po?.poNumber.toLowerCase().includes(q) ||
                grn.vendorName.toLowerCase().includes(q) ||
                grn.materialName.toLowerCase().includes(q) ||
                grn.siteName.toLowerCase().includes(q) ||
                (grn.invoiceNo || "").toLowerCase().includes(q)
        );
    }, [enrichedGRNs, searchQuery]);

    // Site filter
    const [filterSite, setFilterSite] = useState<string[]>([]);

    // Unique site names for filter
    const uniqueSites = useMemo(() => {
        const sites = new Set<string>();
        enrichedGRNs.forEach((grn: any) => {
            if (grn.siteName && grn.siteName !== "—") sites.add(grn.siteName);
        });
        return Array.from(sites).sort();
    }, [enrichedGRNs]);

    // Apply site filter to filtered results
    const siteFiltered = useMemo(() => {
        if (filterSite.length === 0) return filtered;
        return filtered.filter((grn: any) => filterSite.includes(grn.siteName));
    }, [filtered, filterSite]);

    // Sort
    const sorted = useMemo(() => {
        return [...siteFiltered].sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case "grnNumber": comparison = a.grnNumber.localeCompare(b.grnNumber); break;
                case "grnDate": comparison = a.createdAt - b.createdAt; break;
                case "invoiceNo": comparison = (a.invoiceNo || "").localeCompare(b.invoiceNo || ""); break;
                case "poNumber": comparison = (a.po?.poNumber || "").localeCompare(b.po?.poNumber || ""); break;
                case "vendorName": comparison = a.vendorName.localeCompare(b.vendorName); break;
                case "materialName": comparison = a.materialName.localeCompare(b.materialName); break;
                case "quantity": comparison = a.receivedQuantity - b.receivedQuantity; break;
                case "rate": comparison = a.rate - b.rate; break;
                case "total": comparison = a.total - b.total; break;
                case "site": comparison = a.siteName.localeCompare(b.siteName); break;
                case "invoiceDate": comparison = (a.invoiceDate || 0) - (b.invoiceDate || 0); break;
            }
            return sortDirection === "asc" ? comparison : -comparison;
        });
    }, [siteFiltered, sortField, sortDirection]);

    // Paginate
    const totalItems = sorted.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const handleSort = useCallback((field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortDirection("asc");
        }
    }, [sortField]);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
        return sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
    };

    // Inline edit handlers with auto-save
    const handleInvoiceNoBlur = useCallback(async (grnId: Id<"grns">, currentValue: string | undefined, newValue: string) => {
        if (newValue !== (currentValue || "")) {
            try {
                await updateGRN({ grnId, invoiceNo: newValue });
                toast.success("Invoice number saved");
            } catch {
                toast.error("Failed to update invoice number");
            }
        }
    }, [updateGRN]);

    const handleInvoiceDateChange = useCallback(async (grnId: Id<"grns">, date: Date | undefined) => {
        try {
            if (date) {
                await updateGRN({ grnId, invoiceDate: date.getTime() });
            } else {
                await updateGRN({ grnId, clearInvoiceDate: true });
            }
            toast.success(date ? "Invoice date saved" : "Invoice date cleared");
        } catch {
            toast.error("Failed to update invoice date");
        }
    }, [updateGRN]);

    // Grand totals (use siteFiltered)
    const grandTotal = useMemo(() => siteFiltered.reduce((sum: any, grn: any) => sum + grn.total, 0), [siteFiltered]);
    const totalQuantity = useMemo(() => siteFiltered.reduce((sum: any, grn: any) => sum + grn.receivedQuantity, 0), [siteFiltered]);

    return (
        <div className="space-y-3 sm:space-y-4">
            {/* Row 1: Search Bar + View Toggle — matching requests page exactly */}
            <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by GRN#, PO#, vendor, material, site, invoice..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={cn(
                            "pl-9 pr-9 h-9 sm:h-10 text-base w-full",
                            searchQuery.trim() && "ring-2 ring-blue-500/50 border-blue-500"
                        )}
                    />
                    {searchQuery && (
                        <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")} className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted" title="Clear search">
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>
                <Button
                    variant="outline"
                    size="icon"
                    className="h-9 sm:h-10 w-9 sm:w-10 flex-shrink-0"
                    onClick={() => setViewMode(viewMode === "table" ? "card" : "table")}
                    title={`Switch to ${viewMode === "table" ? "card" : "table"} view`}
                >
                    {viewMode === "table" ? <LayoutGrid className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
                </Button>
                <ExportExcelButton
                    size="sm"
                    label="Download XL"
                    onExport={async () => {
                        const allGrns = sorted;
                        if (allGrns.length === 0) throw new Error("No data to export");
                        const columns: ExcelColumn[] = [
                            { header: "S.No", key: "sno", type: "number", width: 6 },
                            { header: "GRN Number", key: "grnNumber", width: 16 },
                            { header: "GRN Date", key: "grnDate", type: "date", width: 14 },
                            { header: "Invoice No.", key: "invoiceNo", width: 16 },
                            { header: "Invoice Date", key: "invoiceDate", type: "date", width: 14 },
                            { header: "PO Number", key: "poNumber", width: 16 },
                            { header: "Vendor", key: "vendorName", width: 22 },
                            { header: "Material", key: "materialName", width: 24 },
                            { header: "Quantity", key: "quantity", type: "number", width: 12 },
                            { header: "Unit", key: "unit", width: 8 },
                            { header: "Rate (\u20b9)", key: "rate", type: "currency", width: 14 },
                            { header: "Total (\u20b9)", key: "total", type: "currency", width: 16 },
                            { header: "Site", key: "siteName", width: 16 },
                        ];
                        const data = allGrns.map((grn: any, idx: number) => ({
                            sno: idx + 1,
                            grnNumber: grn.grnNumber,
                            grnDate: fmtExcelDate(grn.createdAt),
                            invoiceNo: grn.invoiceNo || "\u2014",
                            invoiceDate: fmtExcelDate(grn.invoiceDate),
                            poNumber: grn.po?.poNumber || "\u2014",
                            vendorName: grn.vendorName,
                            materialName: grn.materialName,
                            quantity: grn.receivedQuantity,
                            unit: grn.po?.unit || "nos",
                            rate: grn.rate,
                            total: grn.total,
                            siteName: grn.siteName,
                        }));
                        return exportToExcel({ fileName: "GRN_Register", sheetName: "GRN", columns, data });
                    }}
                />
            </div>

            {/* Row 2: Site Filter — matching "Filter by status" style */}
            <div className="flex gap-2 items-center">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 sm:h-10 justify-between min-w-[180px]">
                            {filterSite.length > 0
                                ? filterSite.length === 1 ? filterSite[0] : `${filterSite.length} sites`
                                : "Filter by site"}
                            <Filter className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[250px] p-2" align="start">
                        <div className="space-y-1">
                            <Button
                                variant={filterSite.length === 0 ? "secondary" : "ghost"}
                                size="sm"
                                className="w-full justify-start text-sm"
                                onClick={() => setFilterSite([])}
                            >
                                All Sites
                            </Button>
                            {uniqueSites.map((site) => (
                                <Button
                                    key={site}
                                    variant={filterSite.includes(site) ? "secondary" : "ghost"}
                                    size="sm"
                                    className="w-full justify-start text-sm"
                                    onClick={() => {
                                        setFilterSite((prev) =>
                                            prev.includes(site)
                                                ? prev.filter((s) => s !== site)
                                                : [...prev, site]
                                        );
                                    }}
                                >
                                    {site}
                                </Button>
                            ))}
                        </div>
                        {filterSite.length > 0 && (
                            <div className="border-t mt-2 pt-2">
                                <Button variant="ghost" size="sm" className="w-full text-center text-xs" onClick={() => setFilterSite([])}>
                                    Clear filters
                                </Button>
                            </div>
                        )}
                    </PopoverContent>
                </Popover>
                {filterSite.length > 0 && filterSite.map((site) => (
                    <Badge key={site} variant="secondary" className="gap-1 px-2 py-1 text-xs">
                        {site}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => setFilterSite((prev) => prev.filter((s) => s !== site))} />
                    </Badge>
                ))}
            </div>

            {/* Pagination */}
            <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                totalItems={totalItems}
                pageSizeOptions={[10, 25, 50, 100]}
                itemCount={paginated.length}
            />

            {/* Content */}
            {!grns ? (
                <div className="flex items-center justify-center py-24">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : enrichedGRNs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                    <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center">
                        <BookOpen className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <div className="text-center">
                        <p className="font-semibold text-base">No GRN entries yet</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            GRNs will appear here when deliveries are confirmed from the Pending PO page.
                        </p>
                    </div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <Search className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No GRNs match your search</p>
                </div>
            ) : viewMode === "table" ? (
                /* ===== TABLE VIEW ===== */
                <div className="rounded-lg border bg-card overflow-hidden w-full">
                    <div className="overflow-x-auto w-full">
                        <Table className="w-full">
                            <TableHeader>
                                <TableRow className="bg-muted/40 text-[11px] text-muted-foreground uppercase tracking-wider">
                                    <TableHead className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground transition-colors whitespace-nowrap" onClick={() => handleSort("grnNumber")}>
                                        <div className="flex items-center gap-1">GRN No. <SortIcon field="grnNumber" /></div>
                                    </TableHead>
                                    <TableHead className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground transition-colors whitespace-nowrap" onClick={() => handleSort("grnDate")}>
                                        <div className="flex items-center gap-1">Date <SortIcon field="grnDate" /></div>
                                    </TableHead>
                                    <TableHead className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("invoiceNo")}>
                                        <div className="flex items-center gap-1">Invoice No. <SortIcon field="invoiceNo" /></div>
                                    </TableHead>
                                    <TableHead className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground transition-colors whitespace-nowrap" onClick={() => handleSort("poNumber")}>
                                        <div className="flex items-center gap-1">PO No. <SortIcon field="poNumber" /></div>
                                    </TableHead>
                                    <TableHead className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("vendorName")}>
                                        <div className="flex items-center gap-1">Vendor <SortIcon field="vendorName" /></div>
                                    </TableHead>
                                    <TableHead className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("materialName")}>
                                        <div className="flex items-center gap-1">Material <SortIcon field="materialName" /></div>
                                    </TableHead>
                                    <TableHead className="py-2.5 px-2 font-semibold cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort("quantity")}>
                                        <div className="flex items-center justify-center gap-1">Qty <SortIcon field="quantity" /></div>
                                    </TableHead>
                                    <TableHead className="py-2.5 px-2 font-semibold cursor-pointer hover:text-foreground transition-colors text-right whitespace-nowrap" onClick={() => handleSort("rate")}>
                                        <div className="flex items-center justify-end gap-1">Rate <SortIcon field="rate" /></div>
                                    </TableHead>
                                    <TableHead className="py-2.5 px-2 font-semibold cursor-pointer hover:text-foreground transition-colors text-right whitespace-nowrap" onClick={() => handleSort("total")}>
                                        <div className="flex items-center justify-end gap-1">Total <SortIcon field="total" /></div>
                                    </TableHead>
                                    <TableHead className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("site")}>
                                        <div className="flex items-center gap-1">Site <SortIcon field="site" /></div>
                                    </TableHead>
                                    <TableHead className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground transition-colors whitespace-nowrap" onClick={() => handleSort("invoiceDate")}>
                                        <div className="flex items-center gap-1">Inv. Date <SortIcon field="invoiceDate" /></div>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginated.map((grn, idx) => (
                                    <TableRow key={grn._id} className={cn(
                                        "hover:bg-muted/30 transition-colors",
                                        idx % 2 === 0 && "bg-muted/5"
                                    )}>
                                        <TableCell className="py-2.5 px-3 font-mono font-bold text-xs whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                                            {grn.grnNumber}
                                        </TableCell>
                                        <TableCell className="py-2.5 px-3 text-xs whitespace-nowrap">
                                            {format(new Date(grn.createdAt), "dd/MM/yy")}
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3">
                                            <div className="flex items-center gap-1">
                                                <Input
                                                    defaultValue={grn.invoiceNo || ""}
                                                    placeholder="Invoice..."
                                                    className="h-7 w-[110px] text-xs font-mono px-1.5 py-0.5 border-muted-foreground/20 focus-visible:ring-1 focus-visible:border-primary"
                                                    onBlur={(e) => handleInvoiceNoBlur(grn._id, grn.invoiceNo, e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                                />
                                                {grn.invoicePhoto ? (
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30" title="View Invoice" onClick={() => window.open(grn.invoicePhoto!.imageUrl, '_blank')}>
                                                        <FileText className="h-3.5 w-3.5" />
                                                    </Button>
                                                ) : (
                                                    <Button variant="outline" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary border-dashed" title="Upload Invoice" onClick={() => setInlineUploadGRNId(grn._id)}>
                                                        <Upload className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2.5 px-3">
                                            <span
                                                className="font-mono text-xs cursor-pointer text-blue-600 hover:text-blue-800 hover:underline py-0.5 rounded transition-colors"
                                                onClick={() => {
                                                    if (grn.po?.poNumber) {
                                                        setPdfPreviewPoNumber(grn.po.poNumber);
                                                        if (grn.po.requestId) setPdfPreviewRequestId(grn.po.requestId);
                                                    }
                                                }}
                                                title="View PO PDF"
                                            >
                                                {grn.po?.poNumber || "—"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-2.5 px-3">
                                            <div
                                                className="text-xs font-medium truncate max-w-[120px] cursor-pointer hover:text-primary hover:underline transition-colors"
                                                title={grn.vendorName}
                                                onClick={() => { if (grn.vendor?._id) setSelectedVendorId(grn.vendor._id); }}
                                            >{grn.vendorName}</div>
                                        </TableCell>
                                        <TableCell className="py-2.5 px-3">
                                            <div
                                                className="text-xs truncate max-w-[130px] cursor-pointer hover:text-primary hover:underline transition-colors"
                                                title={grn.materialName}
                                                onClick={() => setSelectedItemName(grn.materialName)}
                                            >{grn.materialName}</div>
                                        </TableCell>
                                        <TableCell className="py-2.5 px-2 text-center text-xs whitespace-nowrap">
                                            <span className="font-semibold">{grn.receivedQuantity}</span>
                                            <span className="text-muted-foreground text-[10px] ml-0.5">{grn.po?.unit}</span>
                                        </TableCell>
                                        <TableCell className="py-2.5 px-2 text-right text-xs whitespace-nowrap">
                                            ₹{grn.rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="py-2.5 px-2 text-right text-xs whitespace-nowrap font-bold text-emerald-700 dark:text-emerald-400">
                                            ₹{grn.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="py-2.5 px-3">
                                            <div
                                                className="text-xs text-muted-foreground truncate max-w-[90px] cursor-pointer hover:text-primary hover:underline transition-colors"
                                                title={grn.siteName}
                                                onClick={() => { if (grn.siteId) setSelectedSiteId(grn.siteId); }}
                                            >{grn.siteName}</div>
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3">
                                            <div className="flex items-center gap-0.5">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            className={cn(
                                                                "h-7 flex-1 min-w-[90px] justify-start text-left font-normal text-[11px] px-1.5 py-0.5",
                                                                !grn.invoiceDate && "text-muted-foreground border-dashed"
                                                            )}
                                                        >
                                                            <CalendarIcon className="mr-1 h-3 w-3 opacity-70" />
                                                            {grn.invoiceDate ? format(new Date(grn.invoiceDate), "dd/MMM/yy") : <span>Select</span>}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0 z-[100]" align="end">
                                                        <Calendar
                                                            mode="single"
                                                            selected={grn.invoiceDate ? new Date(grn.invoiceDate) : undefined}
                                                            onSelect={(date) => handleInvoiceDateChange(grn._id, date)}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                {grn.invoiceDate && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                                        title="Clear date"
                                                        onClick={() => handleInvoiceDateChange(grn._id, undefined)}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}

                                {/* Grand Total Row */}
                                <TableRow className="bg-gradient-to-r from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/30 dark:to-teal-950/30 border-t-2 border-emerald-200 dark:border-emerald-800 font-bold">
                                    <TableCell colSpan={6} className="py-2.5 px-3 text-right text-xs uppercase tracking-wider text-muted-foreground">
                                        Total ({filtered.length} entries)
                                    </TableCell>
                                    <TableCell className="py-2.5 px-2 text-center text-xs">{totalQuantity}</TableCell>
                                    <TableCell className="py-2.5 px-2" />
                                    <TableCell className="py-2.5 px-2 text-right text-sm text-emerald-700 dark:text-emerald-400">
                                        ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell colSpan={2} className="py-2.5 px-3" />
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </div>
            ) : (
                /* ===== CARD VIEW ===== */
                <div className="space-y-3">
                    {paginated.map((grn) => (
                        <div key={grn._id} className="rounded-lg border bg-card p-4 hover:bg-muted/20 transition-colors">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                {/* Left: GRN Info */}
                                <div className="flex items-center gap-4 min-w-0">
                                    <div>
                                        <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-lg">
                                            {grn.grnNumber}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            {format(new Date(grn.createdAt), "dd MMM yyyy")}
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {grn.siteName !== "—" && (
                                            <Badge variant="outline" className="text-[10px]">{grn.siteName}</Badge>
                                        )}
                                    </div>
                                </div>

                                {/* Right: Amount */}
                                <div className="text-right">
                                    <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                                        ₹{grn.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {grn.receivedQuantity} {grn.po?.unit} × ₹{grn.rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>

                            {/* Details Row */}
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                <div>
                                    <div className="text-muted-foreground uppercase text-[10px] tracking-wider">PO</div>
                                    <span
                                        className="font-mono cursor-pointer text-blue-600 hover:underline"
                                        onClick={() => {
                                            if (grn.po?.poNumber) {
                                                setPdfPreviewPoNumber(grn.po.poNumber);
                                                if (grn.po.requestId) setPdfPreviewRequestId(grn.po.requestId);
                                            }
                                        }}
                                    >
                                        {grn.po?.poNumber || "—"}
                                    </span>
                                </div>
                                <div>
                                    <div className="text-muted-foreground uppercase text-[10px] tracking-wider">Vendor</div>
                                    <div className="font-medium truncate">{grn.vendorName}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground uppercase text-[10px] tracking-wider">Material</div>
                                    <div className="truncate">{grn.materialName}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground uppercase text-[10px] tracking-wider">Invoice</div>
                                    <div className="font-mono">{grn.invoiceNo || "—"}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Bottom Pagination */}
            {totalPages > 1 && (
                <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    pageSize={pageSize}
                    onPageSizeChange={setPageSize}
                    totalItems={totalItems}
                    pageSizeOptions={[10, 25, 50, 100]}
                    itemCount={paginated.length}
                />
            )}

            {/* Inline Upload Dialog */}
            <Dialog open={!!inlineUploadGRNId} onOpenChange={(open) => {
                if (!open) { setInlineUploadGRNId(null); setInlineUploadPhoto(null); }
            }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Upload Invoice Photo/Doc</DialogTitle>
                        <DialogDescription>Add an invoice photo or document for this GRN.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <MediaInput onValueChange={(file) => setInlineUploadPhoto(file)} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setInlineUploadGRNId(null); setInlineUploadPhoto(null); }}>Cancel</Button>
                        <Button
                            disabled={!inlineUploadPhoto || isUploadingInline}
                            onClick={async () => {
                                if (!inlineUploadPhoto || !inlineUploadGRNId) return;
                                setIsUploadingInline(true);
                                try {
                                    const formData = new FormData();
                                    formData.append("file", inlineUploadPhoto);
                                    const response = await fetch("/api/upload/image", { method: "POST", body: formData });
                                    if (!response.ok) throw new Error("Upload failed");
                                    const data = await response.json();
                                    await updateGRN({
                                        grnId: inlineUploadGRNId,
                                        invoicePhoto: { imageUrl: data.imageUrl, imageKey: data.imageKey }
                                    });
                                    toast.success("Invoice uploaded successfully");
                                    setInlineUploadGRNId(null);
                                    setInlineUploadPhoto(null);
                                } catch { toast.error("Failed to upload invoice"); }
                                finally { setIsUploadingInline(false); }
                            }}
                        >
                            {isUploadingInline ? "Uploading..." : "Upload & Save"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* PDF Preview Dialog */}
            <PDFPreviewDialog
                open={!!pdfPreviewPoNumber}
                onOpenChange={(open) => { if (!open) { setPdfPreviewPoNumber(null); setPdfPreviewRequestId(null); } }}
                poNumber={pdfPreviewPoNumber}
                requestId={pdfPreviewRequestId}
            />

            {/* Vendor Info Dialog */}
            <VendorInfoDialog
                open={!!selectedVendorId}
                onOpenChange={(open) => { if (!open) setSelectedVendorId(null); }}
                vendorId={selectedVendorId}
            />

            {/* Item Info Dialog */}
            <ItemInfoDialog
                open={!!selectedItemName}
                onOpenChange={(open) => { if (!open) setSelectedItemName(null); }}
                itemName={selectedItemName}
            />

            {/* Location Info Dialog */}
            <LocationInfoDialog
                open={!!selectedSiteId}
                onOpenChange={(open) => { if (!open) setSelectedSiteId(null); }}
                locationId={selectedSiteId}
            />
        </div>
    );
}
