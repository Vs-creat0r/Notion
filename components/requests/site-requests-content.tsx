"use client";

/**
 * Site Requests Content Component
 * 
 * Client component for site engineer requests page.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { MaterialRequestForm } from "@/components/requests/material-request-form";
import { RequestsTable } from "@/components/requests/requests-table";
import { CostComparisonDialog } from "@/components/purchase/cost-comparison-dialog";
import { RequestDetailsDialog } from "@/components/requests/request-details-dialog";
import { LocationInfoDialog } from "@/components/locations/location-info-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDeliveryDialog } from "@/components/requests/confirm-delivery-dialog";
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
import { Plus, CheckCircle2, Send, X, MapPin, Calendar, Package, AlertTriangle, Search, Filter, LayoutGrid, Table2, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { cn, normalizeSearchQuery, matchesSearchQuery } from "@/lib/utils";
import { useViewMode } from "@/hooks/use-view-mode";
import { PaginationControls } from "@/components/ui/pagination-controls";
import type { Id } from "@/convex/_generated/dataModel";

// Enhanced precise search function with priority for exact matches
const fuzzySearch = (request: any, query: string): boolean => {
  if (!query || !query.trim()) return true;

  const searchTerm = normalizeSearchQuery(query);
  if (!searchTerm) return true;

  // Split query into individual words for multi-term search
  const searchWords = searchTerm.split(/\s+/).filter(word => word.length > 0);
  if (searchWords.length === 0) return true;

  // PRIORITY 1: Exact request number matches (highest priority)
  if (request.requestNumber) {
    const requestNum = normalizeSearchQuery(request.requestNumber);
    // Check exact match with "REQ-" prefix
    if (requestNum === searchTerm || requestNum === `req-${searchTerm}`) {
      return true;
    }
    // Check just the number part
    const justNumber = requestNum.replace(/^req-/, '');
    if (justNumber === searchTerm) {
      return true;
    }
  }

  // PRIORITY 2: Exact item order matches
  if (request.itemOrder?.toString() === searchTerm) {
    return true;
  }

  // PRIORITY 3: Exact matches in other fields
  const exactMatchFields = [
    request.itemName,
    request.site?.name,
    request.description,
    request.specsBrand
  ];

  for (const field of exactMatchFields) {
    if (field && normalizeSearchQuery(field) === searchTerm) {
      return true;
    }
  }

  // PRIORITY 4: Contains matches (substring search)
  const containsMatchFields = [
    request.requestNumber,
    request.requestNumber?.replace(/^REQ-/, ''), // Just the number part
    request.itemOrder?.toString(),
    request.itemName,
    request.site?.name,
    request.description,
    request.specsBrand
  ];

  // Check if search term is contained in any field
  // Allow substring matching for all terms, but be more selective for short terms
  for (const field of containsMatchFields) {
    if (!field) continue;

    const normalizedField = normalizeSearchQuery(field);

    // For very short terms (1-2 chars), only match at the beginning of request numbers
    if (searchTerm.length <= 2) {
      // Special handling for request numbers - allow substring match
      if (field === request.requestNumber?.replace(/^REQ-/, '') && normalizedField.includes(searchTerm)) {
        return true;
      }
      // For item orders, allow exact prefix match
      if (field === request.itemOrder?.toString() && normalizedField.startsWith(searchTerm)) {
        return true;
      }
    } else {
      // Normal substring matching for longer terms
      if (normalizedField.includes(searchTerm)) {
        return true;
      }
    }
  }

  // PRIORITY 5: Fuzzy matching only for longer terms (>4 chars) or specific cases
  if (searchTerm.length > 4) {
    const matchesAnyWord = (fieldValue: string | undefined | null): boolean => {
      if (!fieldValue) return false;
      const normalizedField = normalizeSearchQuery(fieldValue);

      return searchWords.every(word => {
        // Exact substring match first
        if (normalizedField.includes(word)) return true;
        // Only do fuzzy matching for longer words
        if (word.length > 3) {
          return fuzzyMatch(normalizedField, word);
        }
        return false;
      });
    };

    const fuzzyMatchFields = [
      request.itemName,
      request.site?.name,
      request.description
    ];

    if (fuzzyMatchFields.some(field => matchesAnyWord(field))) {
      return true;
    }
  }

  return false;
};

// Simplified fuzzy matching - only for longer terms
const fuzzyMatch = (text: string, pattern: string): boolean => {
  if (pattern.length <= 3) return false; // No fuzzy matching for short terms

  // Simple fuzzy: allow 1 character difference
  let differences = 0;
  let i = 0;
  let j = 0;

  while (i < text.length && j < pattern.length) {
    if (text[i] === pattern[j]) {
      i++;
      j++;
    } else {
      differences++;
      if (differences > 1) return false;
      // Try skipping a character in text or pattern
      if (text[i + 1] === pattern[j]) {
        i++;
      } else if (text[i] === pattern[j + 1]) {
        j++;
      } else {
        i++;
        j++;
      }
    }
  }

  return differences <= 1 && j === pattern.length;
};

// Status color mapping for dropdown
const getStatusColor = (status: string) => {
  switch (status) {
    case "draft":
      return "text-slate-600 dark:text-slate-400";
    case "pending":
      return "text-amber-600 dark:text-amber-400";
    case "approved":
    case "recheck":
    case "ready_for_cc":
    case "cc_pending":
    case "cc_approved":
    case "ready_for_po":
    case "pending_po":
    case "sign_pending":
    case "ready_for_delivery":
      return "text-blue-600 dark:text-blue-400";
    case "delivery_processing":
    case "delivery_stage":
      return "text-orange-600 dark:text-orange-400";
    case "rejected":
    case "cc_rejected":
    case "rejected_po":
    case "sign_rejected":
      return "text-rose-600 dark:text-rose-400";
    case "delivered":
      return "text-emerald-600 dark:text-emerald-400";
    default:
      return "text-foreground";
  }
};

const getStatusDot = (status: string) => {
  switch (status) {
    case "draft":
      return "bg-slate-400";
    case "pending":
      return "bg-amber-400";
    case "approved":
    case "recheck":
    case "ready_for_cc":
    case "cc_pending":
    case "cc_approved":
    case "ready_for_po":
    case "pending_po":
    case "sign_pending":
    case "ready_for_delivery":
      return "bg-blue-400";
    case "delivery_processing":
    case "delivery_stage":
      return "bg-orange-400";
    case "rejected":
    case "cc_rejected":
    case "rejected_po":
    case "sign_rejected":
      return "bg-rose-400";
    case "delivered":
      return "bg-emerald-400";
    default:
      return "bg-muted-foreground";
  }
};

const statusGroupMapping: Record<string, string[]> = {
  draft: ["draft"],
  pending: ["pending", "sign_pending"],
  rejected: ["rejected", "sign_rejected", "cc_rejected", "rejected_po"],
  processing: ["approved", "recheck", "ready_for_cc", "cc_pending", "cc_approved", "ready_for_po", "pending_po", "direct_po", "ordered", "partially_processed", "ready_for_delivery"],
  out_for_delivery: ["delivery_stage", "delivery_processing"],
  delivered: ["delivered"]
};

const filterOptions = [
  { value: "draft", label: "Draft", color: "text-slate-600", dotColor: "bg-slate-400" },
  { value: "pending", label: "Pending", color: "text-amber-600", dotColor: "bg-amber-500" },
  { value: "rejected", label: "Rejected", color: "text-rose-600", dotColor: "bg-rose-500" },
  { value: "processing", label: "Approved & Processing", color: "text-blue-600", dotColor: "bg-blue-500" },
  { value: "out_for_delivery", label: "Out for Delivery", color: "text-orange-600", dotColor: "bg-orange-500" },
  { value: "delivered", label: "Delivered", color: "text-emerald-600", dotColor: "bg-emerald-500" },
];

export function SiteRequestsContent() {
  const [formOpen, setFormOpen] = useState(false);

  // Listen for external form open requests (from dashboard)
  useEffect(() => {
    const handleOpenForm = () => setFormOpen(true);
    const handleOpenRequestDetails = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setSelectedRequestId(customEvent.detail);
      }
    };
    
    window.addEventListener('openRequestForm', handleOpenForm);
    window.addEventListener('openRequestDetails', handleOpenRequestDetails);
    
    return () => {
      window.removeEventListener('openRequestForm', handleOpenForm);
      window.removeEventListener('openRequestDetails', handleOpenRequestDetails);
    };
  }, []);
  const [editDraftNumber, setEditDraftNumber] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<Id<"requests"> | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<Id<"sites"> | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [draftToSend, setDraftToSend] = useState<string | null>(null);
  const [newlySentRequestNumbers, setNewlySentRequestNumbers] = useState<Set<string>>(new Set());
  const [confirmDeliveryId, setConfirmDeliveryId] = useState<Id<"requests"> | null>(null);
  const { viewMode, toggleViewMode } = useViewMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const previousRequestsRef = useRef<typeof allRequests>(undefined);

  // CC Dialog State
  const [ccDialogOpen, setCcDialogOpen] = useState(false);
  const [ccDialogRequestId, setCcDialogRequestId] = useState<Id<"requests"> | null>(null);
  const [ccDialogRequestIds, setCcDialogRequestIds] = useState<Id<"requests">[]>([]);

  // Debounce search query for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 150); // 150ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Super search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
      // Escape to clear search
      if (e.key === 'Escape' && searchQuery) {
        setSearchQuery("");
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery]);

  const allRequests = useQuery(api.requests.getUserRequests);
  const draftDetails = useQuery(
    api.requests.getRequestsByRequestNumber,
    draftToSend ? { requestNumber: draftToSend } : "skip"
  );
  const sendDraft = useMutation(api.requests.sendDraftRequest);
  const deleteDraft = useMutation(api.requests.deleteDraftRequest);

  // Track newly sent requests for animation
  useEffect(() => {
    if (allRequests && previousRequestsRef.current) {
      // Find requests that were drafts and are now pending (newly sent)
      const previousDrafts = new Map(
        previousRequestsRef.current
          .filter((r) => r.status === "draft")
          .map((r) => [r.requestNumber, r])
      );

      const newPending = allRequests.filter(
        (r) => r.status === "pending" && previousDrafts.has(r.requestNumber)
      );

      if (newPending.length > 0) {
        const newNumbers = new Set(newPending.map((r) => r.requestNumber));
        setNewlySentRequestNumbers(newNumbers);

        // Scroll to top after a short delay
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, 200);

        // Clear animation after 3 seconds
        setTimeout(() => {
          setNewlySentRequestNumbers(new Set());
        }, 3000);
      }
    }
    previousRequestsRef.current = allRequests;
  }, [allRequests]);

  // Separate new requests from history (include drafts in new)
  // Sort by updatedAt descending (newest first) - newly sent requests will be at top
  const newRequests = (allRequests?.filter((r) =>
    ![
      "rejected",
      "sign_rejected",
      "delivered"
    ].includes(r.status)
  ) || []).sort((a, b) => {
    // Priority: Drafts first, then by updatedAt
    if (a.status === "draft" && b.status !== "draft") return -1;
    if (a.status !== "draft" && b.status === "draft") return 1;

    // If both are drafts or both are not drafts, sort by updatedAt (newest first)
    return b.updatedAt - a.updatedAt;
  });

  const historyRequests = allRequests?.filter((r) =>
    ["rejected", "sign_rejected", "delivered"].includes(r.status)
  ) || [];

  const handleEditDraft = (requestNumber: string) => {
    setEditDraftNumber(requestNumber);
    setFormOpen(true);
  };

  const handleDeleteDraft = (requestNumber: string) => {
    setDraftToDelete(requestNumber);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteDraft = async () => {
    if (!draftToDelete) return;

    try {
      await deleteDraft({ requestNumber: draftToDelete });
      toast.success("Draft deleted successfully");
      setDeleteConfirmOpen(false);
      setDraftToDelete(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete draft");
      console.error(error);
    }
  };

  const handleConfirmDelivery = (requestId: Id<"requests">) => {
    setConfirmDeliveryId(requestId);
  };

  const handleSendDraft = (requestNumber: string) => {
    setDraftToSend(requestNumber);
    setSendConfirmOpen(true);
  };

  const confirmSendDraft = async () => {
    if (!draftToSend) return;

    try {
      const result = await sendDraft({ requestNumber: draftToSend });
      // Mark as newly sent for animation
      setNewlySentRequestNumbers(new Set([result.requestNumber]));
      toast.success(`Draft sent successfully! Request #${result.requestNumber} has been created.`);

      // Close confirmation dialog
      setSendConfirmOpen(false);
      setDraftToSend(null);

      // Scroll to top after a short delay to allow the request to appear
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 300);

      // Clear animation after 3 seconds
      setTimeout(() => {
        setNewlySentRequestNumbers(new Set());
      }, 3000);
    } catch (error: any) {
      toast.error(error.message || "Failed to send draft");
      setSendConfirmOpen(false);
      setDraftToSend(null);
    }
  };

  // Filter requests based on search and status
  const filterRequests = (requestsList: typeof newRequests) => {
    let filtered = requestsList;

    // Filter by status (Multi-select)
    if (statusFilter.length > 0) {
      filtered = filtered.filter((r) => {
        // Check if request status matches any selected filter group
        return statusFilter.some(filterGroup => {
          const allowedStatuses = statusGroupMapping[filterGroup] || [filterGroup];
          return allowedStatuses.includes(r.status);
        });
      });
    }

    // Enhanced fuzzy search with priority on ID, order ID, and item name
    if (debouncedSearchQuery.trim()) {
      filtered = filtered.filter((r) => fuzzySearch(r, debouncedSearchQuery));
    }

    return filtered;
  };

  const filteredNewRequests = filterRequests(newRequests);
  const filteredHistoryRequests = filterRequests(historyRequests);

  // Combine all requests for single view
  const allFilteredRequests = [...filteredNewRequests, ...filteredHistoryRequests];

  // Search result stats for better UX
  const searchStats = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return null;

    const totalBeforeSearch = [...newRequests, ...historyRequests].length;
    const totalAfterSearch = allFilteredRequests.length;

    return {
      totalBeforeSearch,
      totalAfterSearch,
      searchTerm: debouncedSearchQuery.trim()
    };
  }, [debouncedSearchQuery, allFilteredRequests.length, newRequests, historyRequests]);

  // Pagination State with localStorage persistence
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    // Load from localStorage on mount
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('requestsPageSize');
      return saved ? Number(saved) : 2; // Default to 2
    }
    return 2;
  });

  // Save page size to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('requestsPageSize', pageSize.toString());
    }
  }, [pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter.length, viewMode]);


  // Pagination Logic: Group by Request Number first to keep requests intact across pages
  const groupBy = (array: any[], key: string) => {
    return array.reduce((result, currentValue) => {
      (result[currentValue[key]] = result[currentValue[key]] || []).push(currentValue);
      return result;
    }, {});
  };

  const groupedRequestsMap = groupBy(allFilteredRequests, 'requestNumber');
  // Sort groups based on their sorting in the original list (which is by date)
  // We can use the order of appearance in allFilteredRequests to maintain sort
  const uniqueRequestNumbers = Array.from(new Set(allFilteredRequests.map(r => r.requestNumber)));

  const totalRequestGroups = uniqueRequestNumbers.length;
  const totalPages = Math.ceil(totalRequestGroups / pageSize);

  const paginatedRequestNumbers = uniqueRequestNumbers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Flatten back to items list for the table, but only containing items for the current page's requests
  const paginatedRequests = paginatedRequestNumbers.flatMap(num => groupedRequestsMap[num]);

  return (
    <>
      {/* Search, Filters, and Actions Bar */}
      <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
        {/* Row 1: Search and View Toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search: order ID (001, 002...), item name, or location name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`pl-9 pr-9 h-9 sm:h-10 text-base w-full ${debouncedSearchQuery.trim() ? 'ring-2 ring-blue-500/50 border-blue-500' : ''}`}
              title="Press Ctrl+K to focus search, Escape to clear"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
                title="Clear search (Esc)"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            {/* Search results counter removed */}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleViewMode}
            className="h-10 w-10 flex-shrink-0"
            title={`Switch to ${viewMode === "card" ? "table" : "card"} view`}
          >
            {viewMode === "card" ? (
              <Table2 className="h-4 w-4" />
            ) : (
              <LayoutGrid className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Row 2: Status Filter and New Request */}
        <div className="flex gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex-1 sm:w-[200px] sm:flex-none h-9 sm:h-10 justify-between px-3 text-left font-normal text-base">
                <span className="truncate">
                  {statusFilter.length === 0
                    ? `All Items (${totalRequestGroups})`
                    : `${statusFilter.length} Selected`}
                </span>
                <Filter className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search status..." />
                <CommandList className="max-h-[600px] overflow-y-auto">
                  <CommandEmpty>No status found.</CommandEmpty>
                  <CommandGroup className="p-2">
                    <CommandItem
                      onSelect={() => setStatusFilter([])}
                      className={cn(
                        "cursor-pointer py-3.5 px-3 mb-2 rounded-xl border transition-all flex items-start gap-3 h-auto group",
                        statusFilter.length === 0
                          ? "bg-foreground text-background border-transparent shadow-md"
                          : "bg-card hover:bg-muted/60 border-border text-muted-foreground hover:text-foreground shadow-sm"
                      )}
                    >
                      <div className={cn(
                        "h-5 w-5 shrink-0 rounded flex items-center justify-center transition-all mt-0.5",
                        statusFilter.length === 0
                          ? "bg-background text-foreground border-2 border-background"
                          : "border-2 border-muted-foreground/30 bg-transparent group-hover:border-foreground/50"
                      )}>
                        {statusFilter.length === 0 && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </div>
                      <span className="font-bold text-sm flex-1 pt-0.5">All Statuses</span>
                    </CommandItem>

                    <div className="h-px bg-border/50 my-2 mx-1" />

                    {filterOptions.map((option) => {
                      const isSelected = statusFilter.includes(option.value);

                      // Calculate count for this status group
                      const getStatusCount = () => {
                        if (!allRequests) return 0;
                        const allowedStatuses = statusGroupMapping[option.value] || [option.value];
                        return allRequests.filter(r => allowedStatuses.includes(r.status)).length;
                      };

                      const count = getStatusCount();

                      // Default styling classes
                      const activeColor = "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground";
                      const hoverColor = "hover:bg-muted/50 dark:hover:bg-muted/30";
                      const borderColor = "border-primary bg-primary";
                      const selectedBorder = "border-primary dark:border-primary";

                      return (
                        <CommandItem
                          key={option.value}
                          onSelect={() => {
                            if (isSelected) {
                              setStatusFilter(statusFilter.filter((s) => s !== option.value));
                            } else {
                              setStatusFilter([...statusFilter, option.value]);
                            }
                          }}
                          className={cn(
                            "cursor-pointer py-3.5 px-3 mb-2 rounded-xl border transition-all flex items-start gap-3 h-auto group",
                            isSelected
                              ? cn(activeColor, selectedBorder, "shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/5")
                              : cn("bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80 shadow-sm", hoverColor)
                          )}
                        >
                          <div className={cn(
                            "h-5 w-5 shrink-0 rounded flex items-center justify-center transition-all mt-0.5",
                            isSelected
                              ? cn(borderColor, "text-white shadow-sm")
                              : "border-2 border-muted-foreground/30 bg-transparent group-hover:border-foreground/40"
                          )}>
                            {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                          </div>

                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className={`w-2.5 h-2.5 rounded-full ${option.dotColor} shadow-sm shrink-0 mt-1.5`} />
                            <span className={cn("font-bold text-sm whitespace-normal break-words leading-tight pt-0.5", option.color)}>{option.label}</span>
                          </div>

                          <div className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[28px] text-center shadow-sm mt-0.5",
                            isSelected ? "bg-white/90 text-black backdrop-blur-sm" : "bg-muted text-muted-foreground"
                          )}>
                            {count}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button
            onClick={() => setFormOpen(true)}
            className="h-9 sm:h-10 ml-auto text-base"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Request
          </Button>
        </div>

        {/* Bottom Row: Filters and View Toggle */}

      </div>

      {/* Pagination Controls - Top */}
      <div className="mb-3">
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          totalItems={totalRequestGroups}
          pageSizeOptions={[2, 10, 25, 50, 100]}
          itemCount={allFilteredRequests.length}
        />
      </div>

      <RequestsTable
        requests={paginatedRequests}
        onViewDetails={(requestId) => setSelectedRequestId(requestId)}
        preciseStatuses={true}
        hideStatusOnCard={true}
        hideItemCountOnCard={true}
        onEditDraft={handleEditDraft}
        onDeleteDraft={handleDeleteDraft}
        onSendDraft={handleSendDraft}
        onConfirmDelivery={handleConfirmDelivery}
        newlySentRequestNumbers={newlySentRequestNumbers}
        viewMode={viewMode}
        onOpenCC={(id, ids) => {
          setCcDialogRequestId(id);
          setCcDialogRequestIds(ids || []);
          setCcDialogOpen(true);
        }}
      />

      <div className="mt-4 border-t pt-4">
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          totalItems={totalRequestGroups}
          pageSizeOptions={[2, 10, 25, 50, 100]}
          itemCount={allFilteredRequests.length}
        />
      </div>

      <MaterialRequestForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditDraftNumber(null);
          }
        }}
        draftRequestNumber={editDraftNumber}
      />

      <RequestDetailsDialog
        open={!!selectedRequestId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequestId(null);
          }
        }}
        requestId={selectedRequestId}
        onOpenCC={(id, ids) => {
          setCcDialogRequestId(id);
          setCcDialogRequestIds(ids || []);
          setCcDialogOpen(true);
        }}
      />

      <LocationInfoDialog
        open={!!selectedSiteId}
        onOpenChange={(open) => {
          if (!open) setSelectedSiteId(null);
        }}
        locationId={selectedSiteId}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this draft? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDraftToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteDraft}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Draft Confirmation Dialog */}
      <AlertDialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-full bg-primary/10">
                <CheckCircle2 className="h-6 w-6 text-primary" />
              </div>
              <AlertDialogTitle className="text-lg sm:text-xl font-bold">Confirm & Send Draft</AlertDialogTitle>
            </div>
            <div className="text-sm text-muted-foreground space-y-4 pt-2">
              {draftDetails && draftDetails.length > 0 ? (
                <>
                  <div className="p-4 rounded-lg bg-muted/50 border space-y-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Location</p>
                        {draftDetails[0].site ? (
                          <button
                            onClick={() => setSelectedSiteId(draftDetails[0].site!._id)}
                            className="text-sm font-medium text-foreground hover:text-primary hover:bg-muted/50 rounded-md px-2 py-1 -mx-2 -my-1 transition-colors cursor-pointer text-left"
                          >
                            {draftDetails[0].site.name}
                            {draftDetails[0].site.code && (
                              <span className="text-muted-foreground ml-1">({draftDetails[0].site.code})</span>
                            )}
                          </button>
                        ) : (
                          <p className="text-sm font-medium">Selected site</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Required By</p>
                        <p className="text-sm font-medium">
                          {draftDetails[0].requiredBy ? format(new Date(draftDetails[0].requiredBy), "dd/MM/yyyy") : "Not set"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Package className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Items</p>
                        <p className="text-sm font-medium">
                          {draftDetails.length} item{draftDetails.length > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </div>

                  {draftDetails.filter((i) => i.isUrgent).length > 0 && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-destructive mb-1">Urgent Items</p>
                        <p className="text-sm text-destructive/90">
                          {draftDetails.filter((i) => i.isUrgent).length} item{draftDetails.filter((i) => i.isUrgent).length > 1 ? 's are' : ' is'} marked as urgent and will be prioritized.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t">
                    <p className="text-sm font-medium text-foreground">
                      Are you sure you want to send this draft? It will be converted to a request and sent for approval. This action cannot be undone.
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  Loading draft details...
                </div>
              )}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
            <AlertDialogCancel
              className="w-full sm:w-auto order-2 sm:order-1 h-10 sm:h-11 text-sm font-semibold border-2"
              onClick={() => {
                setSendConfirmOpen(false);
                setDraftToSend(null);
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSendDraft}
              className="w-full sm:w-auto order-1 sm:order-2 h-10 sm:h-11 text-sm font-bold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all"
            >
              <Send className="h-4 w-4 mr-2" />
              Confirm & Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Confirm Delivery Dialog */}
      <ConfirmDeliveryDialog
        open={!!confirmDeliveryId}
        onOpenChange={(open) => !open && setConfirmDeliveryId(null)}
        requestId={confirmDeliveryId}
      />

      {/* Cost Comparison Dialog (View Only for Site Engineer) */}
      {ccDialogRequestId && (
        <CostComparisonDialog
          open={ccDialogOpen}
          onOpenChange={setCcDialogOpen}
          requestId={ccDialogRequestId}
          requestIds={ccDialogRequestIds}
        />
      )}
    </>
  );
}

