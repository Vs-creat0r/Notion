"use client";

/**
 * Cost Comparison Dialog Component
 * 
 * Dialog for creating/editing cost comparisons with multiple vendor quotes.
 */

import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Save, Send, AlertCircle, Package, CheckCircle, Building, Info, ExternalLink, Mail, Phone, Hash, MapPin } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import { ROLES } from "@/lib/auth/roles";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { VendorCreationForm } from "./vendor-creation-form";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageSlider } from "@/components/ui/image-slider";
import type { Id } from "@/convex/_generated/dataModel";
import { Edit, Check, X, FileText, Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface CostComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId?: Id<"requests"> | null; // Main request ID (used when opening single item)
  requestIds?: Id<"requests">[]; // Multiple request IDs for batch CC viewing
  isDirectCreation?: boolean; // Flag for direct CC creation without request
  autoOpenQuoteForm?: boolean; // Auto-open the Add Vendor Quote form on mount
}

interface VendorQuote {
  vendorId: Id<"vendors">;
  unitPrice: number;
  amount?: number;
  unit?: string;
  discountPercent?: number;  // Optional discount percentage
  gstPercent?: number;       // Optional GST percentage
  perUnitBasis?: number;     // Optional basis for price (e.g. price per 50 units)
  contact?: string;          // Vendor Contact
  reference?: string;        // Reference
  date?: string;             // Date
  deliveryPeriod?: string;   // Delivery Period
  paymentTerms?: string;     // Payment Terms
  pastPerformance?: string;  // Past Performance
  freight?: string;          // Freight
  specification?: string;    // Specification / Model No
}

// Common unit suggestions for autocomplete
const UNIT_SUGGESTIONS = [
  "kg", "kgs", "kilogram", "kilograms",
  "g", "gm", "gram", "grams",
  "lb", "lbs", "pound", "pounds",
  "ton", "tons", "tonne", "tonnes",
  "m", "meter", "meters", "metre", "metres",
  "cm", "centimeter", "centimeters",
  "mm", "millimeter", "millimeters",
  "ft", "feet", "foot",
  "inch", "inches", "in",
  "l", "liter", "liters", "litre", "litres",
  "ml", "milliliter", "milliliters",
  "gal", "gallon", "gallons",
  "pcs", "pieces", "piece", "pc",
  "box", "boxes",
  "pack", "packs", "packet", "packets",
  "dozen", "dozens",
  "set", "sets",
  "roll", "rolls",
  "sheet", "sheets",
  "bag", "bags",
  "bottle", "bottles",
  "can", "cans",
  "tube", "tubes",
  "unit", "units",
  "each"
];

// Common units for suggestions (expanded list)
const COMMON_UNITS = [
  "bags", "kg", "g", "gm", "ton", "mm", "cm", "m", "km",
  "nos", "pieces", "pcs", "liters", "l", "ml", "sqft", "sqm",
  "cft", "cum", "boxes", "cartons", "bundles", "rolls", "sheets", "units",
];

export function CostComparisonDialog({
  open,
  onOpenChange,
  requestId,
  requestIds,
  autoOpenQuoteForm = false,
}: CostComparisonDialogProps) {
  // Multi-item CC navigation state
  const [currentCCIndex, setCurrentCCIndex] = useState(0);

  // Determine the list of request IDs to work with
  const ccRequestIds = requestIds && requestIds.length > 0 ? requestIds : [requestId];
  const hasMultipleCCs = ccRequestIds.length > 1;

  // Active request ID based on current index
  const activeRequestId = ccRequestIds[currentCCIndex] || requestId;

  const [vendorQuotes, setVendorQuotes] = useState<VendorQuote[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<Id<"vendors"> | "">("");
  const [unitPrice, setUnitPrice] = useState("");
  const [isDirectDelivery, setIsDirectDelivery] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [inventoryInfoOpen, setInventoryInfoOpen] = useState(false);
  const [imageSliderOpen, setImageSliderOpen] = useState(false);
  const [imageSliderImages, setImageSliderImages] = useState<Array<{ imageUrl: string; imageKey: string }>>([]);
  const [imageSliderItemName, setImageSliderItemName] = useState("");
  const [imageSliderInitialIndex, setImageSliderInitialIndex] = useState(0);
  const [isCreatingDirectPO, setIsCreatingDirectPO] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState("1");
  const [quoteUnit, setQuoteUnit] = useState("");
  const [quoteDiscount, setQuoteDiscount] = useState("");  // Discount percentage
  // const [quoteGst, setQuoteGst] = useState("");            // GST percentage - Replaced by CGST/SGST
  const [quoteCgst, setQuoteCgst] = useState("9");       // CGST percentage (default 9)
  const [quoteSgst, setQuoteSgst] = useState("9");       // SGST percentage (default 9)
  const [perUnitBasis, setPerUnitBasis] = useState("1");   // Per unit basis for price (e.g. price per 1 unit, or per 50 units) - Hidden in UI now

  // New Quote Fields
  const [quoteContact, setQuoteContact] = useState("");
  const [quoteReference, setQuoteReference] = useState("");
  const [quoteDate, setQuoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [quoteDeliveryPeriod, setQuoteDeliveryPeriod] = useState("");
  const [quotePaymentTerms, setQuotePaymentTerms] = useState("");
  const [quotePastPerformance, setQuotePastPerformance] = useState("");
  const [quoteFreight, setQuoteFreight] = useState("");
  const [quoteSpecification, setQuoteSpecification] = useState("");
  // showAdditionalDetails removed to keep section always open

  const [showVendorDetails, setShowVendorDetails] = useState<string | null>(null);
  const [showDirectDeliveryConfirm, setShowDirectDeliveryConfirm] = useState(false);
  const [showCreateVendorDialog, setShowCreateVendorDialog] = useState(false);
  const [vendorSearchTerm, setVendorSearchTerm] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [selectedVendorIndex, setSelectedVendorIndex] = useState(-1);
  const [editingQuoteIndex, setEditingQuoteIndex] = useState(-1); // -1 = adding new, >= 0 = editing existing
  const [ccViewMode, setCCViewMode] = useState<"form" | "preview">("form"); // toggle between edit form and formatted CC preview
  const [ccZoom, setCcZoom] = useState(1.0); // CC preview zoom level
  const ccScrollRef = useRef<HTMLDivElement>(null); // ref for horizontal scroll container

  // Inventory-based fulfillment state (skip vendor comparison)
  const [useInventoryStock, setUseInventoryStock] = useState(false);

  // Split fulfillment state - for partial inventory fulfillment
  const [quantityFromInventory, setQuantityFromInventory] = useState(0);
  const [quantityFromVendor, setQuantityFromVendor] = useState(0); // Minimum needed from vendor
  const [quantityToBuy, setQuantityToBuy] = useState(0); // Actual quantity to buy (can be >= quantityFromVendor)

  // Unit suggestions state
  const [showUnitSuggestions, setShowUnitSuggestions] = useState(false);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState(-1);



  // Item details edit state
  const [isEditingItem, setIsEditingItem] = useState(false);
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSpecification, setEditSpecification] = useState("");
  const [editItemName, setEditItemName] = useState("");
  const [isUpdatingItem, setIsUpdatingItem] = useState(false);


  // Item name autocomplete state
  const [showItemNameSuggestions, setShowItemNameSuggestions] = useState(false);
  const [selectedItemNameIndex, setSelectedItemNameIndex] = useState(-1);

  // Manager review state
  const [selectedFinalVendor, setSelectedFinalVendor] = useState<Id<"vendors"> | "">("");
  // Per-item vendor selection for merged CC manager review
  const [selectedVendorPerItem, setSelectedVendorPerItem] = useState<Record<string, Id<"vendors">>>({});
  const [managerNotes, setManagerNotes] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [counterOfferPercent, setCounterOfferPercent] = useState<number>(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const userRole = useUserRole();
  const isManager = userRole === ROLES.MANAGER;
  const currentUser = useQuery(api.users.getCurrentUser);
  const reviewCC = useMutation(api.costComparisons.reviewCostComparison);

  const request = useQuery(
    api.requests.getRequestById,
    activeRequestId ? { requestId: activeRequestId } : "skip"
  );

  // Fetch all requests for multi-item merged preview
  const req0 = useQuery(api.requests.getRequestById, ccRequestIds[0] ? { requestId: ccRequestIds[0] } : "skip");
  const req1 = useQuery(api.requests.getRequestById, ccRequestIds[1] ? { requestId: ccRequestIds[1] } : "skip");
  const req2 = useQuery(api.requests.getRequestById, ccRequestIds[2] ? { requestId: ccRequestIds[2] } : "skip");
  const req3 = useQuery(api.requests.getRequestById, ccRequestIds[3] ? { requestId: ccRequestIds[3] } : "skip");
  const req4 = useQuery(api.requests.getRequestById, ccRequestIds[4] ? { requestId: ccRequestIds[4] } : "skip");
  const req5 = useQuery(api.requests.getRequestById, ccRequestIds[5] ? { requestId: ccRequestIds[5] } : "skip");
  const allCCRequests = [req0, req1, req2, req3, req4, req5].slice(0, ccRequestIds.length).filter(Boolean) as any[];

  // Fetch CCs for all items (for merged preview)
  const cc0 = useQuery(api.costComparisons.getCostComparisonByRequestId, ccRequestIds[0] ? { requestId: ccRequestIds[0] } : "skip");
  const cc1 = useQuery(api.costComparisons.getCostComparisonByRequestId, ccRequestIds[1] ? { requestId: ccRequestIds[1] } : "skip");
  const cc2 = useQuery(api.costComparisons.getCostComparisonByRequestId, ccRequestIds[2] ? { requestId: ccRequestIds[2] } : "skip");
  const cc3 = useQuery(api.costComparisons.getCostComparisonByRequestId, ccRequestIds[3] ? { requestId: ccRequestIds[3] } : "skip");
  const cc4 = useQuery(api.costComparisons.getCostComparisonByRequestId, ccRequestIds[4] ? { requestId: ccRequestIds[4] } : "skip");
  const cc5 = useQuery(api.costComparisons.getCostComparisonByRequestId, ccRequestIds[5] ? { requestId: ccRequestIds[5] } : "skip");
  const allItemCCs = [cc0, cc1, cc2, cc3, cc4, cc5].slice(0, ccRequestIds.length);
  const vendors = useQuery(api.vendors.getAllVendors);
  const inventoryItems = useQuery(api.inventory.getAllInventoryItems);

  // Check if item exists in inventory
  const itemInInventory = inventoryItems?.find(
    (item) => item.itemName.toLowerCase() === request?.itemName.toLowerCase()
  );

  // Check if inventory has sufficient stock
  const hasSufficientInventory = itemInInventory && (itemInInventory.centralStock || 0) >= (request?.quantity || 0);

  // Get smart vendor suggestions based on item in inventory
  const suggestedVendors = vendors?.filter(vendor =>
    itemInInventory?.vendorIds?.includes(vendor._id) || false
  ) || [];

  const otherVendors = vendors?.filter(vendor =>
    !itemInInventory?.vendorIds?.includes(vendor._id) &&
    !vendorQuotes.some(quote => quote.vendorId === vendor._id)
  ) || [];
  const existingCC = useQuery(
    api.costComparisons.getCostComparisonByRequestId,
    activeRequestId ? { requestId: activeRequestId } : "skip"
  );
  const upsertCC = useMutation(api.costComparisons.upsertCostComparison);
  const submitCC = useMutation(api.costComparisons.submitCostComparison);
  const resubmitCC = useMutation(api.costComparisons.resubmitCostComparison);
  const updateRequestDetails = useMutation(api.requests.updateRequestDetails);
  const updatePurchaseRequestStatus = useMutation(api.requests.updatePurchaseRequestStatus);
  const deductInventoryStock = useMutation(api.inventory.deductInventoryStockByName);

  // Track whether this is the initial open of the dialog (vs tab switch)
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Load existing cost comparison
  useEffect(() => {
    if (existingCC && open) {
      setVendorQuotes(
        existingCC.vendorQuotes.map((q) => ({
          vendorId: q.vendorId,
          unitPrice: q.unitPrice,
          amount: q.amount,
          unit: q.unit,
          discountPercent: q.discountPercent,
          gstPercent: q.gstPercent,
          perUnitBasis: q.perUnitBasis,
          contact: q.contact,
          reference: q.reference,
          date: q.date,
          deliveryPeriod: q.deliveryPeriod,
          paymentTerms: q.paymentTerms,
          pastPerformance: q.pastPerformance,
          freight: q.freight,
        }))
      );
      setIsDirectDelivery(existingCC.isDirectDelivery ?? false);
      // If there are vendor quotes, user chose external purchase
      setUseInventoryStock(existingCC.vendorQuotes.length === 0);

      // Load saved quantity preferences if available
      if (existingCC.purchaseQuantity) {
        setQuantityToBuy(existingCC.purchaseQuantity);
        // If we have saved purchase quantity, we should trust it for quantityFromVendor too unless we want to recalculate
        // But usually purchaseQuantity >= quantityFromVendor
      }

      if (existingCC.inventoryFulfillmentQuantity) {
        setQuantityFromInventory(existingCC.inventoryFulfillmentQuantity);
      }

      if (existingCC.counterOfferPercent !== undefined) {
        setCounterOfferPercent(existingCC.counterOfferPercent);
      } else {
        setCounterOfferPercent(0); // default
      }

      // Reset manager notes when opening
      if (isManager) {
        setManagerNotes("");
      }

      // Auto show preview if CC already has quotes — only on initial open, not on tab switch
      if (isInitialLoad) {
        if (existingCC.vendorQuotes.length > 0) {
          setCCViewMode("preview");
        } else {
          setCCViewMode("form");
        }
        setIsInitialLoad(false);
      }
    } else if (open && !existingCC) {
      // Reset when opening new
      setVendorQuotes([]);
      setIsDirectDelivery(false);
      // Default to inventory stock if sufficient
      setUseInventoryStock(false);
      if (isInitialLoad) {
        setCCViewMode("form"); // always start in form mode for new CC
        setIsInitialLoad(false);
      }
      setCounterOfferPercent(0); // default
      if (isManager) {
        setManagerNotes("");
      }
    }
  }, [existingCC, open, isManager]);

  // Initialize edit fields when request loads
  useEffect(() => {
    if (request && open) {
      setEditQuantity(request.quantity.toString());
      setEditUnit(request.unit || "");
      setEditDescription(request.description || "");
      setEditItemName(request.itemName);
    }
  }, [request, open]);

  // Initialize split fulfillment quantities when request and inventory loads
  useEffect(() => {
    // If we have an existing CC with saved quantities, don't overwrite them with defaults
    if (existingCC?.purchaseQuantity || existingCC?.inventoryFulfillmentQuantity) {
      return;
    }

    if (request && itemInInventory && open) {
      const availableStock = itemInInventory.centralStock || 0;
      const requiredQuantity = request.quantity || 0;

      if (availableStock >= requiredQuantity) {
        // Full inventory fulfillment possible
        setQuantityFromInventory(requiredQuantity);
        setQuantityFromVendor(0);
        setQuantityToBuy(0);
      } else if (availableStock > 0) {
        // Partial inventory fulfillment
        const neededFromVendor = requiredQuantity - availableStock;
        setQuantityFromInventory(availableStock);
        setQuantityFromVendor(neededFromVendor);
        setQuantityToBuy(neededFromVendor); // Default to minimum needed
      } else {
        // No inventory, all from vendors
        setQuantityFromInventory(0);
        setQuantityFromVendor(requiredQuantity);
        setQuantityToBuy(requiredQuantity);
      }
    } else if (request && !itemInInventory && open) {
      // New item, all from vendors
      setQuantityFromInventory(0);
      setQuantityFromVendor(request.quantity || 0);
      setQuantityToBuy(request.quantity || 0);
    }
  }, [request, itemInInventory, open, existingCC]);

  // Get vendor name by ID
  const getVendorName = (vendorId: Id<"vendors">) => {
    return vendors?.find((v) => v._id === vendorId)?.companyName || "Unknown";
  };

  // Add or update vendor quote
  const handleAddVendor = () => {
    if (!selectedVendorId || !unitPrice) {
      toast.error("Please select a vendor and enter unit price");
      return;
    }

    const basis = parseFloat(perUnitBasis) || 1;
    const enteredPrice = parseFloat(unitPrice);

    if (isNaN(enteredPrice) || enteredPrice < 0) {
      toast.error("Please enter a valid unit price");
      return;
    }

    const price = enteredPrice / basis; // Normalize price per 1 unit

    if (editingQuoteIndex === -1 && vendorQuotes.some((q) => q.vendorId === selectedVendorId)) {
      toast.error("This vendor is already added");
      return;
    }

    const amount = parseFloat(quoteAmount) || 1;
    const unit = quoteUnit.trim() || request?.unit || itemInInventory?.unit || "units";
    const discount = parseFloat(quoteDiscount) || 0;
    // GST is now sum of CGST and SGST
    const cgst = parseFloat(quoteCgst) || 0;
    const sgst = parseFloat(quoteSgst) || 0;
    const gst = cgst + sgst;

    if (discount < 0 || discount > 100) {
      toast.error("Discount must be between 0% and 100%");
      return;
    }

    if (cgst < 0 || cgst > 100 || sgst < 0 || sgst > 100) {
      toast.error("Tax percentages must be between 0% and 100%");
      return;
    }

    const newQuote: VendorQuote = {
      vendorId: selectedVendorId as Id<"vendors">,
      unitPrice: price,
      amount: amount,
      unit: unit,
      discountPercent: discount > 0 ? discount : undefined,
      gstPercent: gst > 0 ? gst : undefined,
      perUnitBasis: basis,
      contact: quoteContact.trim() || undefined,
      reference: quoteReference.trim() || undefined,
      date: quoteDate.trim() || undefined,
      deliveryPeriod: quoteDeliveryPeriod.trim() || undefined,
      paymentTerms: quotePaymentTerms.trim() || undefined,
      pastPerformance: quotePastPerformance.trim() || undefined,
      freight: quoteFreight.trim() || undefined,
      specification: quoteSpecification.trim() || undefined,
    };

    let newQuotes: VendorQuote[];
    if (editingQuoteIndex >= 0) {
      // Update existing quote
      newQuotes = [...vendorQuotes];
      newQuotes[editingQuoteIndex] = newQuote;
      setVendorQuotes(newQuotes);
      toast.success("Quote updated");
    } else {
      // Add new quote
      newQuotes = [...vendorQuotes, newQuote];
      setVendorQuotes(newQuotes);
      toast.success("Quote added");
    }

    // Update quantity to buy if this is the first quote or if it's different (user intention)
    // We assume the user wants to buy the amount they are quoting for.
    setQuantityToBuy(amount);

    // Save immediately with new quantity
    handleSave(false, newQuotes, amount);

    // Reset form
    setSelectedVendorId("");
    setUnitPrice("");
    setQuoteAmount("1");
    const defaultUnit = request?.unit || itemInInventory?.unit || "units";
    setQuoteUnit(defaultUnit);
    setQuoteDiscount("");
    setQuoteCgst("9"); // Reset to 9
    setQuoteSgst("9"); // Reset to 9
    setQuoteContact("");
    setQuoteReference("");
    setQuoteDate(new Date().toISOString().slice(0, 10));
    setQuoteDeliveryPeriod("");
    setQuotePaymentTerms("");
    setQuotePastPerformance("");
    setQuoteFreight("");
    setQuoteSpecification("");
    setEditingQuoteIndex(-1);
    setVendorSearchTerm("");
    setVendorDialogOpen(false);

    // Switch to preview mode to show the formatted CC after adding
    setCCViewMode("preview");
  };

  // Get related units based on selected item's unit
  const getRelatedUnits = (itemUnit: string): string[] => {
    if (!itemUnit) return [];
    const cleanedUnit = itemUnit.replace(/\d+/g, '').trim();
    if (!cleanedUnit) return [];
    const unit = cleanedUnit.toLowerCase();

    if (unit === "kg" || unit === "kilogram" || unit === "kilograms") return ["kg", "gm", "g", "ton", "quintal"];
    if (unit === "g" || unit === "gm" || unit === "gram" || unit === "grams") return ["g", "gm", "kg"];
    if (unit === "ton" || unit === "tonne") return ["ton", "kg", "quintal"];
    if (unit === "m" || unit === "meter" || unit === "meters" || unit === "metre" || unit === "metres") return ["m", "cm", "mm", "km", "ft", "inch"];
    if (unit === "cm" || unit === "centimeter") return ["cm", "mm", "m", "inch"];
    if (unit === "mm" || unit === "millimeter") return ["mm", "cm", "m"];
    if (unit === "ft" || unit === "feet" || unit === "foot") return ["ft", "inch", "m", "cm"];
    if (unit === "l" || unit === "liter" || unit === "liters" || unit === "litre") return ["l", "ml", "cft", "cum"];
    if (unit === "ml" || unit === "milliliter") return ["ml", "l"];
    if (unit === "cft") return ["cft", "cum", "l"];
    if (unit === "cum") return ["cum", "cft", "l"];
    if (unit === "sqft") return ["sqft", "sqm", "acre"];
    if (unit === "sqm") return ["sqm", "sqft", "acre"];
    if (unit === "nos" || unit === "number" || unit === "numbers") return ["nos", "pcs", "pieces", "units"];
    if (unit === "pcs" || unit === "pieces" || unit === "piece") return ["pcs", "pieces", "nos", "units"];
    if (unit === "units" || unit === "unit") return ["units", "nos", "pcs", "pieces"];
    if (unit === "bags" || unit === "bag") return ["bags", "kg", "ton"];
    if (unit === "boxes" || unit === "box") return ["boxes", "cartons", "nos", "pcs"];
    if (unit === "cartons" || unit === "carton") return ["cartons", "boxes", "nos"];
    if (unit === "bundles" || unit === "bundle") return ["bundles", "nos", "pcs"];
    if (unit === "rolls" || unit === "roll") return ["rolls", "nos", "m", "ft"];
    if (unit === "sheets" || unit === "sheet") return ["sheets", "nos", "sqft", "sqm"];

    return [unit, ...COMMON_UNITS.filter(u => u !== unit).slice(0, 5)];
  };




  // Edit vendor quote - populate form with existing data
  const handleEditQuote = (index: number) => {
    const quote = vendorQuotes[index];
    if (!quote) return;

    setEditingQuoteIndex(index);
    setSelectedVendorId(quote.vendorId);
    setVendorSearchTerm(getVendorName(quote.vendorId));
    setPerUnitBasis((quote.perUnitBasis || 1).toString());
    setUnitPrice((quote.unitPrice * (quote.perUnitBasis || 1)).toString());
    setQuoteAmount((quote.amount || 1).toString());
    setQuoteUnit(quote.unit || "");
    setQuoteDiscount(quote.discountPercent?.toString() || "");
    const totalGst = quote.gstPercent || 0;
    setQuoteCgst((totalGst / 2).toString());
    setQuoteSgst((totalGst / 2).toString());
    setQuoteContact(quote.contact || "");
    setQuoteReference(quote.reference || "");
    setQuoteDate(quote.date || new Date().toISOString().slice(0, 10));
    setQuoteDeliveryPeriod(quote.deliveryPeriod || "");
    setQuotePaymentTerms(quote.paymentTerms || "");
    setQuotePastPerformance(quote.pastPerformance || "");
    setQuoteFreight(quote.freight || "");
    setQuoteSpecification(quote.specification || "");
    setVendorDialogOpen(true);
  };

  // Remove vendor quote
  const handleRemoveVendor = (vendorId: Id<"vendors">) => {
    const newQuotes = vendorQuotes.filter((q) => q.vendorId !== vendorId);
    setVendorQuotes(newQuotes);
    toast.success("Quote removed");
    // Save immediately if there are still quotes
    handleSave(true, newQuotes);
  };

  // Save cost comparison (silent mode for auto-save, accepts quotes parameter for immediate save)
  const handleSave = async (silent: boolean = false, quotesToSave?: VendorQuote[], purchaseQuantityOverride?: number) => {
    if (!activeRequestId) {
      if (!silent) toast.error("No request selected");
      return;
    }
    const quotes = quotesToSave || vendorQuotes;
    const qtyToBuy = purchaseQuantityOverride !== undefined ? purchaseQuantityOverride : quantityToBuy;

    setIsSaving(true);
    try {
      await upsertCC({
        requestId: activeRequestId,
        vendorQuotes: quotes,
        isDirectDelivery,
        purchaseQuantity: qtyToBuy,
        inventoryFulfillmentQuantity: quantityFromInventory,
      });
      if (!silent) toast.success("Cost comparison saved");
    } catch (error: any) {
      if (!silent) toast.error(error.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  // Reset initial load flag when dialog closes
  useEffect(() => {
    if (!open) {
      setIsInitialLoad(true);
    }
  }, [open]);

  // Submit for approval — handles both single and multi-item CC
  const handleSubmit = async () => {
    if (!activeRequestId) return;

    // For multi-item CC: check all items have at least one quote
    if (hasMultipleCCs) {
      const itemsWithNoQuotes = allItemCCs.filter((cc, idx) => {
        // If CC exists, check it has quotes; if no CC yet, check current vendorQuotes
        if (idx === currentCCIndex) return vendorQuotes.length === 0;
        return !cc || (cc.vendorQuotes?.length ?? 0) === 0;
      });
      if (itemsWithNoQuotes.length > 0) {
        toast.error(`Add at least one vendor quote for each item before submitting`);
        return;
      }
    } else {
      if (vendorQuotes.length === 0) {
        toast.error("Please add at least one vendor quote");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (hasMultipleCCs) {
        // Save current item's quotes first
        await handleSave(true);
        // Submit ALL items' CCs
        for (let i = 0; i < ccRequestIds.length; i++) {
          const rid = ccRequestIds[i];
          if (!rid) continue;
          const cc = allItemCCs[i];
          if (!cc) continue;
          if (cc.status === "cc_rejected") {
            await resubmitCC({ requestId: rid, vendorQuotes: cc.vendorQuotes, isDirectDelivery: false });
          } else if (cc.status === "draft") {
            await submitCC({ requestId: rid });
          }
          // Already pending/approved — skip
        }
        toast.success(`${ccRequestIds.length} items submitted for approval`);
      } else {
        if (existingCC?.status === "cc_rejected") {
          await resubmitCC({ requestId: activeRequestId, vendorQuotes, isDirectDelivery });
          toast.success("Cost comparison resubmitted");
        } else {
          await handleSave();
          await submitCC({ requestId: activeRequestId });
          toast.success("Cost comparison submitted");
        }
      }
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to submit");
    } finally {
      setIsSubmitting(false);
    }
  };




  // Calculate price after discount
  const calculatePriceAfterDiscount = (unitPrice: number, discountPercent?: number) => {
    if (!discountPercent || discountPercent <= 0) return unitPrice;
    return unitPrice * (1 - discountPercent / 100);
  };

  // Calculate GST amount
  const calculateGstAmount = (priceAfterDiscount: number, gstPercent?: number) => {
    if (!gstPercent || gstPercent <= 0) return 0;
    return priceAfterDiscount * (gstPercent / 100);
  };

  const calculateFinalPrice = (unitPrice: number, discountPercent?: number, gstPercent?: number) => {
    const priceAfterDiscount = calculatePriceAfterDiscount(unitPrice, discountPercent);
    const gstAmount = calculateGstAmount(priceAfterDiscount, gstPercent);
    return priceAfterDiscount + gstAmount;
  };

  // Calculate total with discount and GST for a quote
  const calculateQuoteTotal = (quote: VendorQuote, quantity: number) => {
    const finalUnitPrice = calculateFinalPrice(quote.unitPrice, quote.discountPercent, quote.gstPercent);
    const freightAmt = parseFloat(quote.freight || "0") || 0;
    return finalUnitPrice * quantity + freightAmt;
  };


  // Item edit handlers
  const handleStartEditItem = () => {
    setIsEditingItem(true);
    setEditQuantity(request?.quantity.toString() || "");
    setEditUnit(request?.unit || itemInInventory?.unit || "");
    setEditDescription(request?.description || "");
    setEditSpecification(request?.specsBrand || (itemInInventory as any)?.specification || "");
    setEditItemName(request?.itemName || "");
  };

  const handleCancelEditItem = () => {
    setIsEditingItem(false);
    setEditQuantity(request?.quantity.toString() || "");
    setEditUnit(request?.unit || "");
    setEditDescription(request?.description || "");
    setEditSpecification(request?.specsBrand || (itemInInventory as any)?.specification || "");
    setEditItemName(request?.itemName || "");
  };

  const handleSaveItemDetails = async () => {
    if (!request || !activeRequestId) return;

    const quantity = parseFloat(editQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    if (!editItemName.trim()) {
      toast.error("Please enter an item name");
      return;
    }

    setIsUpdatingItem(true);
    try {
      await updateRequestDetails({
        requestId: activeRequestId,
        quantity,
        unit: editUnit.trim() || undefined,
        description: editDescription.trim() || undefined,
        specsBrand: editSpecification.trim() || undefined,
        itemName: editItemName.trim(),
      });
      toast.success("Item details updated successfully");
      setIsEditingItem(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update item details");
    } finally {
      setIsUpdatingItem(false);
    }
  };

  // Unit autocomplete handlers
  /* Unit autocomplete handlers */
  const getFilteredUnitSuggestions = (input: string) => {
    // If we have a current unit, try to suggest related units first
    const currentUnit = request?.unit || itemInInventory?.unit || "";
    if (currentUnit) {
      const related = getRelatedUnits(currentUnit);
      if (related.length > 0) {
        // If input is empty, show related units. If not, filter related units + common units
        if (!input.trim()) return related.slice(0, 8);
        return Array.from(new Set([...related, ...COMMON_UNITS])).filter(u =>
          u.toLowerCase().includes(input.toLowerCase())
        ).slice(0, 8);
      }
    }

    // Fallback if no specific context
    if (!input.trim()) return UNIT_SUGGESTIONS.slice(0, 8);
    return UNIT_SUGGESTIONS.filter(unit =>
      unit.toLowerCase().includes(input.toLowerCase())
    ).slice(0, 8);
  };

  const handleUnitInputChange = (value: string) => {
    setEditUnit(value);
    setShowUnitSuggestions(true);
    setSelectedUnitIndex(-1); // Reset selection when typing
  };

  const handleUnitKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const suggestions = getFilteredUnitSuggestions(editUnit);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedUnitIndex(prev =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedUnitIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedUnitIndex >= 0) {
      e.preventDefault();
      setEditUnit(suggestions[selectedUnitIndex] || editUnit);
      setShowUnitSuggestions(false);
      setSelectedUnitIndex(-1);
    } else if (e.key === 'Escape') {
      setShowUnitSuggestions(false);
      setSelectedUnitIndex(-1);
    }
  };

  const handleUnitSuggestionClick = (suggestion: string) => {
    setEditUnit(suggestion);
    setShowUnitSuggestions(false);
    setSelectedUnitIndex(-1);
  };

  const handleUnitFocus = () => {
    setShowUnitSuggestions(true);
  };

  const handleUnitBlur = () => {
    // Delay hiding to allow click on suggestions
    setTimeout(() => setShowUnitSuggestions(false), 150);
  };

  // Item name autocomplete handlers
  const getFilteredItemNameSuggestions = (input: string) => {
    if (!inventoryItems) return [];
    if (!input.trim()) return inventoryItems.slice(0, 8); // Show first 8 when empty
    return inventoryItems.filter(item =>
      item.itemName.toLowerCase().includes(input.toLowerCase())
    ).slice(0, 8); // Limit to 8 suggestions
  };

  const handleItemNameInputChange = (value: string) => {
    setEditItemName(value);
    setShowItemNameSuggestions(true);
    setSelectedItemNameIndex(-1); // Reset selection when typing
  };

  const handleItemNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const suggestions = getFilteredItemNameSuggestions(editItemName);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedItemNameIndex(prev =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedItemNameIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedItemNameIndex >= 0) {
      e.preventDefault();
      setEditItemName(suggestions[selectedItemNameIndex].itemName);
      setShowItemNameSuggestions(false);
      setSelectedItemNameIndex(-1);
    } else if (e.key === 'Escape') {
      setShowItemNameSuggestions(false);
      setSelectedItemNameIndex(-1);
    }
  };

  const handleItemNameSuggestionClick = (suggestion: string) => {
    setEditItemName(suggestion);
    setShowItemNameSuggestions(false);
    setSelectedItemNameIndex(-1);
  };

  const handleItemNameFocus = () => {
    setShowItemNameSuggestions(true);
  };

  const handleItemNameBlur = () => {
    // Delay hiding to allow click on suggestions
    setTimeout(() => setShowItemNameSuggestions(false), 150);
  };

  const canEdit = userRole === ROLES.PURCHASE_OFFICER && (existingCC?.status === "draft" || existingCC?.status === "cc_rejected" || !existingCC);
  // While role is loading (null), treat as potentially editable for UI rendering
  const canEditUI = canEdit || (userRole === null && (existingCC?.status === "draft" || existingCC?.status === "cc_rejected" || !existingCC));
  const isSubmitted = existingCC?.status === "cc_pending";
  const isManagerReview = isManager && isSubmitted;

  // Check if inventory data is still loading
  const isInventoryLoading = inventoryItems === undefined;

  // Filter vendors based on search term
  const filteredVendors = vendors?.filter(vendor =>
    vendor.companyName.toLowerCase().includes(vendorSearchTerm.toLowerCase())
  ) || [];

  // Filter units based on input for quote
  const getFilteredUnitSuggestionsForQuote = (input: string) => {
    if (!input.trim()) return UNIT_SUGGESTIONS.slice(0, 8); // Show first 8 when empty
    return UNIT_SUGGESTIONS.filter(unit =>
      unit.toLowerCase().includes(input.toLowerCase())
    ).slice(0, 8); // Limit to 8 suggestions
  };

  // Unit suggestion handlers for quote
  const handleQuoteUnitInputChange = (value: string) => {
    setQuoteUnit(value);
    setShowUnitSuggestions(true);
    setSelectedUnitIndex(-1); // Reset selection when typing
  };

  const handleQuoteUnitKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const suggestions = getFilteredUnitSuggestionsForQuote(quoteUnit);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedUnitIndex(prev =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedUnitIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedUnitIndex >= 0) {
      e.preventDefault();
      setQuoteUnit(suggestions[selectedUnitIndex]);
      setShowUnitSuggestions(false);
      setSelectedUnitIndex(-1);
    } else if (e.key === 'Escape') {
      setShowUnitSuggestions(false);
      setSelectedUnitIndex(-1);
    }
  };

  const handleQuoteUnitSuggestionClick = (suggestion: string) => {
    setQuoteUnit(suggestion);
    setShowUnitSuggestions(false);
    setSelectedUnitIndex(-1);
    // Auto-focus back to the input or next field for better UX
  };

  const handleQuoteUnitFocus = () => {
    setShowUnitSuggestions(true);
  };

  const handleQuoteUnitBlur = () => {
    // Delay hiding to allow click on suggestions
    setTimeout(() => setShowUnitSuggestions(false), 150);
  };

  const handleDirectDelivery = async () => {
    if (!request || !activeRequestId) return;

    // Determine quantity to take from inventory
    const deliveryQuantity = hasSufficientInventory
      ? (request.quantity || 0)  // Full fulfillment from inventory
      : quantityFromInventory;   // Partial fulfillment

    if (deliveryQuantity <= 0) {
      toast.error("Please specify a quantity to deliver from inventory");
      return;
    }

    setIsCreatingDirectPO(true);
    try {
      // Deduct stock from inventory
      const result = await deductInventoryStock({
        itemName: request.itemName,
        quantity: deliveryQuantity,
        reason: `Direct delivery for request ${request.requestNumber}`,
      });

      // If full fulfillment (all from inventory), update request to delivery stage
      if (hasSufficientInventory || quantityFromVendor === 0) {
        await updatePurchaseRequestStatus({
          requestId: activeRequestId,
          status: "ready_for_delivery",
        });
        toast.success(
          `Request moved to Ready for Delivery! ${deliveryQuantity} ${request.unit || 'units'} deducted from inventory. ` +
          `Remaining stock: ${result.newStock} ${itemInInventory?.unit || 'units'}`
        );
      } else {
        // Partial fulfillment - still need vendor quotes for remaining quantity
        toast.success(
          `${deliveryQuantity} ${request.unit || 'units'} taken from inventory. ` +
          `Remaining stock: ${result.newStock}. ` +
          `Please add vendor quotes for remaining ${quantityFromVendor} ${request.unit || 'units'}.`
        );
      }

      setShowDirectDeliveryConfirm(false);

      // Only close dialog if full fulfillment
      if (hasSufficientInventory || quantityFromVendor === 0) {
        onOpenChange(false);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create Direct PO");
    } finally {
      setIsCreatingDirectPO(false);
    }
  };

  const openImageSlider = (images: Array<{ imageUrl: string; imageKey: string }>, itemName: string, initialIndex: number = 0) => {
    setImageSliderImages(images);
    setImageSliderItemName(itemName);
    setImageSliderInitialIndex(initialIndex);
    setImageSliderOpen(true);
  };

  // Load selected vendor if CC is approved (for manager view)
  useEffect(() => {
    if (existingCC?.selectedVendorId && open && isManager) {
      setSelectedFinalVendor(existingCC.selectedVendorId);
    } else if (open && isManager && !existingCC?.selectedVendorId) {
      setSelectedFinalVendor("");
    }
  }, [existingCC, open, isManager]);

  // Reset CC index and per-item vendor selections when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentCCIndex(0);
      setSelectedVendorPerItem({});
    }
  }, [open]);
  // ── Shared style objects for CC preview table (forced light mode) ──────────
  const excelThStyle: React.CSSProperties = {
    border: "1px solid #000",
    padding: "5px 4px",
    textAlign: "center",
    fontWeight: "normal",
    fontSize: "10px",
    color: "#000",
    background: "#dee5ed",
  };
  const excelTdStyle: React.CSSProperties = {
    border: "1px solid #000",
    padding: "5px 4px",
    textAlign: "center",
    fontWeight: "normal",
    fontSize: "11px",
    color: "#000",
    background: "#fff",
  };
  const actionBtnOutline: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "7px 14px",
    borderRadius: "6px",
    border: "1.5px solid #bbb",
    background: "#fff",
    color: "#333",
    fontWeight: 600,
    fontSize: "12px",
    cursor: "pointer",
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={`${ccViewMode === "preview" && vendorQuotes.length > 0 ? "max-w-[98vw] sm:max-w-[95vw] md:max-w-6xl lg:max-w-7xl xl:max-w-[1400px]" : "max-w-[98vw] sm:max-w-3xl"} max-h-[92vh] flex flex-col overflow-hidden transition-all duration-300`}>
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">Cost Comparison</DialogTitle>
                <DialogDescription className="text-sm mt-1 flex items-center gap-2 flex-wrap">
                  {/* Request number */}
                  <span className="font-mono font-bold text-foreground">#{req0?.requestNumber ?? request?.requestNumber}</span>
                  {/* CC ID badge - single badge for merged CC, per-item badge for single */}
                  {hasMultipleCCs ? (
                    // Merged CC: show one badge covering all items
                    allItemCCs.some(cc => cc) && (
                      <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[11px] font-mono font-bold">
                        {req0?.requestNumber ?? request?.requestNumber}-CC-1
                      </span>
                    )
                  ) : (
                    // Single item CC: show per-item badge
                    ccRequestIds.map((rid, idx) => {
                      const cc = allItemCCs[idx];
                      const ccSeq = cc ? `CC-${String(idx + 1).padStart(1, "0")}` : null;
                      return ccSeq ? (
                        <span key={rid} className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[11px] font-mono font-bold">
                          {request?.requestNumber}-{ccSeq}
                        </span>
                      ) : null;
                    })
                  )}
                  <span className="text-muted-foreground">•</span>
                  {/* Site name */}
                  {(request as any)?.site?.name && (
                    <span className="text-muted-foreground text-xs">{(request as any).site.name}</span>
                  )}
                  {/* Project name */}
                  {(request as any)?.project?.name && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground text-xs">{(request as any).project.name}</span>
                    </>
                  )}
                  {/* Item count for merged CC, item name for single */}
                  {hasMultipleCCs ? (
                    <span className="text-muted-foreground text-xs">{allCCRequests.length} items</span>
                  ) : (
                    <span>{request?.itemName}</span>
                  )}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={
                  request?.status === "delivered" ? "default" :
                    (request?.status === "rejected" || request?.status === "rejected_po" || request?.status === "cc_rejected") ? "destructive" :
                      "outline"
                }>
                  {request?.status?.replace("_", " ") || "Pending"}
                </Badge>
                {/* Toggle View Mode Button */}
                {(vendorQuotes.length > 0 || (hasMultipleCCs && allItemCCs.some(cc => (cc?.vendorQuotes?.length ?? 0) > 0))) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCCViewMode(prev => prev === "form" ? "preview" : "form")}
                    className="h-7 text-xs gap-1.5 border-dashed border-2 hover:border-primary hover:text-primary hover:bg-primary/5"
                  >
                    {ccViewMode === "preview" ? (
                      <><Edit className="h-3 w-3" /> Edit CC</>
                    ) : (
                      <><FileText className="h-3 w-3" /> View CC Format</>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* CC Navigation Tabs - shown when there are multiple CCs */}
            {hasMultipleCCs && (
              <div className="flex items-center gap-2 pt-3 mt-1">
                <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
                  {ccRequestIds.map((_, index) => (
                    <Button
                      key={index}
                      variant={currentCCIndex === index ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCurrentCCIndex(index)}
                      className={`h-7 px-3 text-xs font-medium rounded-md transition-all ${currentCCIndex === index
                        ? "shadow-sm"
                        : "hover:bg-background/50"
                        }`}
                    >
                      Item {index + 1}
                    </Button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground ml-2">
                  Viewing {currentCCIndex + 1} of {ccRequestIds.length} items
                </span>
              </div>
            )}
          </DialogHeader>

          <div className={`flex-1 overflow-y-auto ${ccViewMode === "preview" && vendorQuotes.length > 0 ? "overflow-x-auto" : "overflow-x-hidden space-y-3 pr-1"}`}>

            {/* ── MERGED MULTI-ITEM CC PREVIEW ─────────────────────── */}
            {ccViewMode === "preview" && hasMultipleCCs && allCCRequests.length > 1 && (() => {
              // Collect all unique vendor IDs across all items' CCs
              const allVendorIds: Id<"vendors">[] = [];
              const seenVendors = new Set<string>();
              allItemCCs.forEach((cc) => {
                (cc?.vendorQuotes ?? []).forEach((q: any) => {
                  if (!seenVendors.has(q.vendorId)) {
                    seenVendors.add(q.vendorId);
                    allVendorIds.push(q.vendorId);
                  }
                });
              });

              if (allVendorIds.length === 0) return null;

              const totalColumnsCount = 5 + allVendorIds.length * 3;

              // Per-item, per-vendor quote lookup
              const getQuote = (ccIdx: number, vendorId: Id<"vendors">) =>
                (allItemCCs[ccIdx]?.vendorQuotes ?? []).find((q: any) => q.vendorId === vendorId);

              // Lowest vendor per item
              const getLowestVendorId = (ccIdx: number, req: any) => {
                const quotes = allItemCCs[ccIdx]?.vendorQuotes ?? [];
                if (!quotes.length) return null;
                return [...quotes].sort((a: any, b: any) =>
                  calculateQuoteTotal(a, req.quantity) - calculateQuoteTotal(b, req.quantity)
                )[0]?.vendorId;
              };

              const counterOfferMultiplier = 1 - (counterOfferPercent / 100);

              // Use first available quote for header info (contact, reference, date)
              const getHeaderQuote = (vendorId: Id<"vendors">) => {
                for (const cc of allItemCCs) {
                  const q = (cc?.vendorQuotes ?? []).find((q: any) => q.vendorId === vendorId);
                  if (q) return q;
                }
                return null;
              };

              return (
                <div style={{ fontFamily: "Arial, sans-serif", color: "#000", background: "#fff", width: "100%", paddingBottom: "12px" }}>
                  {/* Toolbar */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 4px 8px", borderBottom: "1px solid #e5e7eb", marginBottom: "6px", flexWrap: "wrap" }}>
                    {/* Zoom controls */}
                    <span style={{ fontSize: "10px", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginRight: "2px" }}>Zoom</span>
                    <button onClick={() => setCcZoom(z => Math.max(0.5, parseFloat((z - 0.1).toFixed(1))))} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "6px", border: "1.5px solid #ddd", background: "#f5f5f5", cursor: "pointer", color: "#444", fontSize: "16px", fontWeight: "bold" }}>−</button>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#555", minWidth: "38px", textAlign: "center", background: "#f0f0f0", borderRadius: "4px", padding: "2px 4px" }}>{Math.round(ccZoom * 100)}%</span>
                    <button onClick={() => setCcZoom(z => Math.min(1.5, parseFloat((z + 0.1).toFixed(1))))} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "6px", border: "1.5px solid #ddd", background: "#f5f5f5", cursor: "pointer", color: "#444", fontSize: "16px", fontWeight: "bold" }}>+</button>
                    <button onClick={() => setCcZoom(1.0)} style={{ fontSize: "10px", padding: "4px 8px", borderRadius: "5px", border: "1.5px solid #ddd", background: "#f5f5f5", cursor: "pointer", color: "#666", marginLeft: "2px" }}>Reset</button>
                    {/* Divider */}
                    <div style={{ width: "1px", height: "20px", background: "#e5e7eb", margin: "0 4px" }} />
                    {/* Excel download */}
                    <button
                      onClick={() => {
                        try {
                          const table = document.getElementById('cc-export-table');
                          if (!table) return;
                          const clone = table.cloneNode(true) as HTMLElement;
                          clone.querySelectorAll('.no-export').forEach(el => el.remove());
                          const wb = XLSX.utils.table_to_book(clone, { sheet: "Sheet1" });
                          XLSX.writeFile(wb, `Cost_Comparison_${allCCRequests[0]?.requestNumber || 'Export'}.xlsx`);
                          toast.success("Excel downloaded!");
                        } catch (err) { console.error(err); toast.error("Failed to download Excel"); }
                      }}
                      style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", borderRadius: "6px", border: "1.5px solid #217346", background: "#fff", color: "#217346", fontWeight: 600, fontSize: "11px", cursor: "pointer" }}
                    >
                      <Download style={{ width: "12px", height: "12px" }} /> Excel
                    </button>
                    {/* PDF download */}
                    <button
                      onClick={async () => {
                        const table = document.getElementById('cc-export-table');
                        if (!table) return;
                        try {
                          const canvas = await html2canvas(table, { scale: 2 } as any);
                          const imgData = canvas.toDataURL("image/png");
                          const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [canvas.width * 0.75, canvas.height * 0.75] });
                          pdf.addImage(imgData, "PNG", 0, 0, canvas.width * 0.75, canvas.height * 0.75);
                          pdf.save(`Cost_Comparison_${allCCRequests[0]?.requestNumber || 'Export'}.pdf`);
                          toast.success("PDF downloaded!");
                        } catch (err) { console.error(err); toast.error("Failed to download PDF"); }
                      }}
                      style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", borderRadius: "6px", border: "1.5px solid #d9534f", background: "#fff", color: "#d9534f", fontWeight: 600, fontSize: "11px", cursor: "pointer" }}
                    >
                      <Printer style={{ width: "12px", height: "12px" }} /> PDF
                    </button>
                    {/* Submit button for purchase officer */}
                    {canEdit && !isManager && !isSubmitted && (
                      <>
                        <div style={{ width: "1px", height: "20px", background: "#e5e7eb", margin: "0 4px" }} />
                        <button
                          onClick={() => setShowSubmitConfirm(true)}
                          disabled={isSaving || isSubmitting || allItemCCs.every(cc => (cc?.vendorQuotes?.length ?? 0) === 0)}
                          style={{
                            display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px",
                            borderRadius: "6px", border: "none",
                            background: allItemCCs.every(cc => (cc?.vendorQuotes?.length ?? 0) === 0) ? "#c8c8c8" : "linear-gradient(135deg, #1565c0 0%, #1976d2 100%)",
                            color: "#fff", fontWeight: 700, fontSize: "11px",
                            cursor: allItemCCs.every(cc => (cc?.vendorQuotes?.length ?? 0) === 0) ? "not-allowed" : "pointer",
                            boxShadow: "0 1px 4px rgba(21,101,192,0.25)",
                          }}
                        >
                          <Send style={{ width: "12px", height: "12px" }} />
                          Submit All ({ccRequestIds.length} items)
                        </button>
                      </>
                    )}
                    {isSubmitted && !isManager && (
                      <span style={{ fontSize: "10px", color: "#7c3aed", fontWeight: 600, marginLeft: "4px" }}>● Submitted for approval</span>
                    )}
                  </div>

                  <div style={{ position: "relative", width: "100%" }}>
                    <button onClick={() => ccScrollRef.current?.scrollBy({ left: -250, behavior: "smooth" })} style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "48px", borderRadius: "0 8px 8px 0", border: "1.5px solid #ddd", borderLeft: "none", background: "rgba(255,255,255,0.95)", cursor: "pointer", color: "#555", boxShadow: "2px 0 8px rgba(0,0,0,0.10)" }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 10L3.5 6l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <div ref={ccScrollRef} style={{ overflowX: "auto", width: "100%" }}>
                      <div style={{ minWidth: `${800 + allVendorIds.length * 180}px`, transform: `scale(${ccZoom})`, transformOrigin: "top left", width: `${100 / ccZoom}%` }}>
                        <table id="cc-export-table" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                          <colgroup>
                            <col style={{ width: "40px" }} />
                            <col style={{ width: "200px" }} />
                            <col style={{ width: "160px" }} />
                            <col style={{ width: "55px" }} />
                            <col style={{ width: "55px" }} />
                            {allVendorIds.map((_, i) => (
                              <React.Fragment key={i}>
                                <col style={{ width: "70px" }} />
                                <col style={{ width: "50px" }} />
                                <col style={{ width: "75px" }} />
                              </React.Fragment>
                            ))}
                          </colgroup>
                          <tbody>
                            {/* Company header */}
                            <tr>
                              <th colSpan={totalColumnsCount} style={{ ...excelThStyle, background: "#cbe4f9", color: "#1a4670", fontSize: "15px", padding: "8px", border: "1px solid #7a7a7a" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 10px" }}>
                                  <span style={{ visibility: "hidden" }}>NOTION</span>
                                  <span style={{ textAlign: "center", letterSpacing: "1px" }}>NOTION ELECTRONICS PVT. LTD. ( AN ISO 9001: 2015 COMPANY )</span>
                                  <img src="/images/logos/Notion_Logo-removebg-preview.png" alt="Notion Logo" style={{ height: "22px", objectFit: "contain" }} />
                                </div>
                              </th>
                            </tr>
                            {/* Project / Form title */}
                            <tr>
                              <th colSpan={3} style={{ ...excelThStyle, background: "#e8acd1", color: "#61224d", textAlign: "left", fontSize: "11px", paddingLeft: "10px", border: "1px solid #7a7a7a" }}>
                                {(allCCRequests[0] as any)?.project?.name
                                  ? `PROJECT: ${(allCCRequests[0] as any).project.name}`
                                  : (allCCRequests[0] as any)?.site?.name
                                    ? `SITE: ${(allCCRequests[0] as any).site.name}`
                                    : `REQ: ${allCCRequests[0]?.requestNumber}`}
                                {" ("}
                                {`${allCCRequests[0]?.requestNumber}-CC-1`}
                                {allItemCCs.filter(Boolean).length > 1 ? ` · ${allItemCCs.filter(Boolean).length} items` : ""}
                                {")"}
                              </th>
                              <th colSpan={totalColumnsCount - 3} style={{ ...excelThStyle, background: "#e8acd1", color: "#61224d", fontSize: "13px", border: "1px solid #7a7a7a" }}>
                                VENDOR COMPARISON FORM
                              </th>
                            </tr>
                            {/* Vendor name header */}
                            <tr>
                              <th rowSpan={4} style={{ ...excelThStyle, background: "#dee5ed" }}>SR NO.</th>
                              <th rowSpan={4} style={{ ...excelThStyle, background: "#dee5ed" }}>ITEM DESCRIPTION</th>
                              <th rowSpan={4} style={{ ...excelThStyle, background: "#dee5ed" }}>SPECIFICATION / MODEL NO</th>
                              <th rowSpan={4} style={{ ...excelThStyle, background: "#dee5ed" }}>Unit</th>
                              <th rowSpan={4} style={{ ...excelThStyle, background: "#dee5ed" }}>Qty</th>
                              {allVendorIds.map((vid, i) => {
                                // Count how many items have this vendor selected (during review)
                                const selectedCount = ccRequestIds.filter(rid => rid && selectedVendorPerItem[rid] === vid).length;
                                const isAnySelected = selectedCount > 0;
                                // Count how many items have this vendor approved (after approval)
                                const approvedCount = allItemCCs.filter(cc => cc?.selectedVendorId === vid).length;
                                const isApproved = approvedCount > 0;
                                const headerBg = isApproved ? "#86efac" : isAnySelected ? "#c7f0d8" : "#dee5ed";
                                const headerBorder = isApproved ? "2px solid #166534" : isAnySelected ? "2px solid #22c55e" : "1px solid #7a7a7a";
                                const headerColor = (isApproved || isAnySelected) ? "#14532d" : "#000";
                                return (
                                  <th key={i} colSpan={3}
                                    style={{ ...excelThStyle, background: headerBg, textTransform: "uppercase", cursor: "default", border: headerBorder, color: headerColor }}>
                                    {getVendorName(vid)}
                                    {isApproved && (
                                      <div style={{ fontSize: "8px", fontWeight: "bold", opacity: 0.9 }}>✓ APPROVED · {approvedCount} item{approvedCount > 1 ? "s" : ""}</div>
                                    )}
                                    {!isApproved && isManagerReview && isAnySelected && (
                                      <div style={{ fontSize: "8px", opacity: 0.8 }}>✓ {selectedCount} of {ccRequestIds.length} item{selectedCount > 1 ? "s" : ""}</div>
                                    )}
                                    {!isApproved && isManagerReview && !isAnySelected && (
                                      <div style={{ fontSize: "8px", opacity: 0.5 }}>click SELECT per row</div>
                                    )}
                                  </th>
                                );
                              })}
                            </tr>
                            {/* Contact */}
                            <tr>
                              {allVendorIds.map((vid, i) => {
                                const q = getHeaderQuote(vid);
                                return <th key={i} colSpan={3} style={{ ...excelThStyle, background: "#dee5ed", fontSize: "9px", fontWeight: "normal" }}>{q?.contact || ""}</th>;
                              })}
                            </tr>
                            {/* Reference */}
                            <tr>
                              {allVendorIds.map((vid, i) => {
                                const q = getHeaderQuote(vid);
                                return <th key={i} colSpan={3} style={{ ...excelThStyle, background: "#dee5ed", fontSize: "9px", fontWeight: "normal" }}>{q?.reference || ""}</th>;
                              })}
                            </tr>
                            {/* Sub-headers: RATE / DISC / TOTAL per vendor */}
                            <tr>
                              {allVendorIds.map((_, i) => (
                                <React.Fragment key={i}>
                                  <th style={{ ...excelThStyle, background: "#dee5ed" }}>RATE</th>
                                  <th style={{ ...excelThStyle, background: "#dee5ed" }}>DISC.</th>
                                  <th style={{ ...excelThStyle, background: "#dee5ed" }}>TOTAL</th>
                                </React.Fragment>
                              ))}
                            </tr>

                            {/* ── Item rows ── */}
                            {allCCRequests.map((req, rowIdx) => {
                              if (!req) return null;
                              const lowestVid = getLowestVendorId(rowIdx, req);
                              const rid = ccRequestIds[rowIdx];
                              const approvedVid = allItemCCs[rowIdx]?.selectedVendorId;
                              return (
                                <tr key={req._id}>
                                  <td style={{ ...excelTdStyle }}>{rowIdx + 1}</td>
                                  <td style={{ ...excelTdStyle, textAlign: "left" }}>
                                    {req.itemName?.toUpperCase()}
                                    {approvedVid && (
                                      <div style={{ fontSize: "8px", color: "#166534", fontWeight: "bold", marginTop: "2px" }}>
                                        ✓ {getVendorName(approvedVid)}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ ...excelTdStyle, textAlign: "left", fontSize: "9px" }}>{req.specsBrand || ""}</td>
                                  <td style={{ ...excelTdStyle }}>{req.unit || ""}</td>
                                  <td style={{ ...excelTdStyle }}>{req.quantity}</td>
                                  {allVendorIds.map((vid, vIdx) => {
                                    const q = getQuote(rowIdx, vid);
                                    const isLowest = vid === lowestVid;
                                    const isItemSelected = rid ? selectedVendorPerItem[rid] === vid : false;
                                    const isItemApproved = approvedVid === vid;
                                    if (!q) {
                                      return (
                                        <React.Fragment key={vIdx}>
                                          <td style={{ ...excelTdStyle, background: "#f9f9f9", color: "#bbb" }}>—</td>
                                          <td style={{ ...excelTdStyle, background: "#f9f9f9", color: "#bbb" }}>—</td>
                                          <td style={{ ...excelTdStyle, background: "#f9f9f9", color: "#bbb" }}>—</td>
                                        </React.Fragment>
                                      );
                                    }
                                    const baseRate = calculatePriceAfterDiscount(q.unitPrice * (q.perUnitBasis || 1), q.discountPercent);
                                    const baseTotal = baseRate * req.quantity;
                                    const cellBg = isItemApproved ? "#bbf7d0" : isItemSelected ? "#d1fae5" : isLowest ? "#ebfbee" : "transparent";
                                    const selectedBorder = isItemSelected ? "2px solid #16a34a" : undefined;
                                    return (
                                      <React.Fragment key={vIdx}>
                                        <td style={{ ...excelTdStyle, background: cellBg }}>{parseFloat((q.unitPrice * (q.perUnitBasis || 1)).toFixed(3))}</td>
                                        <td style={{ ...excelTdStyle, background: cellBg }}>{q.discountPercent ? q.discountPercent + "%" : ""}</td>
                                        <td style={{ ...excelTdStyle, background: cellBg, fontWeight: "bold", padding: "2px 4px" }}>
                                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                            <span>{parseFloat(baseTotal.toFixed(3))}</span>
                                            {isItemApproved && (
                                              <div style={{ fontSize: "7px", fontWeight: "bold", color: "#166534", background: "#bbf7d0", borderRadius: "3px", padding: "1px 4px", border: "1px solid #16a34a", whiteSpace: "nowrap" }}>
                                                ✓ APPROVED
                                              </div>
                                            )}
                                            {!isItemApproved && isManagerReview && rid && (
                                              <div
                                                className="no-export"
                                                data-html2canvas-ignore="true"
                                                onClick={() => setSelectedVendorPerItem(prev => ({
                                                  ...prev,
                                                  [rid]: isItemSelected ? "" as any : vid
                                                }))}
                                                style={{ fontSize: "7px", fontWeight: "bold", cursor: "pointer", color: isItemSelected ? "#166534" : "#6b7280", textAlign: "center", background: isItemSelected ? "#bbf7d0" : "#e5e7eb", borderRadius: "3px", padding: "1px 4px", whiteSpace: "nowrap", userSelect: "none", border: isItemSelected ? "1px solid #16a34a" : "1px solid #d1d5db" }}
                                              >
                                                {isItemSelected ? "✓ SELECTED" : "SELECT"}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      </React.Fragment>
                                    );
                                  })}
                                </tr>
                              );
                            })}

                            {/* Freight row */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#dee5ed", textAlign: "right", paddingRight: "8px" }}>Freight</th>
                              {allVendorIds.map((vid, i) => {
                                const q = getHeaderQuote(vid);
                                return <td key={i} colSpan={3} style={{ ...excelTdStyle, textAlign: "center", fontSize: "9px" }}>{q?.freight || ""}</td>;
                              })}
                            </tr>

                            {/* TOTAL row */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#9bc2e6", textAlign: "right", paddingRight: "8px", fontWeight: "bold", border: "1px solid #7a7a7a" }}>TOTAL</th>
                              {allVendorIds.map((vid, i) => {
                                const total = allCCRequests.reduce((sum, req, rowIdx) => {
                                  if (!req) return sum;
                                  const q = getQuote(rowIdx, vid);
                                  if (!q) return sum;
                                  return sum + calculatePriceAfterDiscount(q.unitPrice * (q.perUnitBasis || 1), q.discountPercent) * req.quantity;
                                }, 0);
                                return (
                                  <React.Fragment key={i}>
                                    <td style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                                    <td style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                                    <td style={{ ...excelTdStyle, background: "#9bc2e6", fontWeight: "bold" }}>{parseFloat(total.toFixed(3))}</td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>

                            {/* GST row */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#9bc2e6", textAlign: "right", paddingRight: "8px", fontWeight: "bold", border: "1px solid #7a7a7a" }}>GST</th>
                              {allVendorIds.map((vid, i) => {
                                const gstTotal = allCCRequests.reduce((sum, req, rowIdx) => {
                                  if (!req) return sum;
                                  const q = getQuote(rowIdx, vid);
                                  if (!q) return sum;
                                  const base = calculatePriceAfterDiscount(q.unitPrice * (q.perUnitBasis || 1), q.discountPercent);
                                  return sum + calculateGstAmount(base, q.gstPercent) * req.quantity;
                                }, 0);
                                const firstQ = getHeaderQuote(vid);
                                return (
                                  <React.Fragment key={i}>
                                    <td style={{ ...excelTdStyle, background: "#9bc2e6", fontSize: "9px" }}>{firstQ?.gstPercent ? `${firstQ.gstPercent}%` : ""}</td>
                                    <td style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                                    <td style={{ ...excelTdStyle, background: "#9bc2e6", fontWeight: "bold" }}>{parseFloat(gstTotal.toFixed(3))}</td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>

                            {/* TOTAL AMOUNT */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#9bc2e6", textAlign: "right", paddingRight: "8px", fontWeight: "bold", border: "1px solid #7a7a7a" }}>TOTAL AMOUNT</th>
                              {allVendorIds.map((vid, i) => {
                                const grandTotal = allCCRequests.reduce((sum, req, rowIdx) => {
                                  if (!req) return sum;
                                  const q = getQuote(rowIdx, vid);
                                  if (!q) return sum;
                                  return sum + calculateQuoteTotal(q, req.quantity);
                                }, 0);
                                return (
                                  <React.Fragment key={i}>
                                    <td style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                                    <td style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                                    <td style={{ ...excelTdStyle, background: "#9bc2e6", fontWeight: "bold" }}>{parseFloat(grandTotal.toFixed(3))}</td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>

                            {/* Delivery Period */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#e8acd1", textAlign: "right", paddingRight: "8px", color: "#61224d", fontWeight: "bold", border: "1px solid #7a7a7a" }}>DELIVERY PERIOD</th>
                              {allVendorIds.map((vid, i) => {
                                const q = getHeaderQuote(vid);
                                return <td key={i} colSpan={3} style={{ ...excelTdStyle, background: "#e8acd1", fontSize: "9px", textAlign: "center" }}>{q?.deliveryPeriod || ""}</td>;
                              })}
                            </tr>

                            {/* Payment Terms */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#9bc2e6", textAlign: "right", paddingRight: "8px", color: "#61224d", fontWeight: "bold", border: "1px solid #7a7a7a" }}>PAYMENT TERMS</th>
                              {allVendorIds.map((vid, i) => {
                                const q = getHeaderQuote(vid);
                                return <td key={i} colSpan={3} style={{ ...excelTdStyle, background: "#9bc2e6", fontSize: "9px", textAlign: "center" }}>{q?.paymentTerms || ""}</td>;
                              })}
                            </tr>

                            {/* Past Performance */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#e8acd1", textAlign: "right", paddingRight: "8px", color: "#61224d", fontWeight: "bold", border: "1px solid #7a7a7a" }}>PAST PERFORMANCE</th>
                              {allVendorIds.map((vid, i) => {
                                const q = getHeaderQuote(vid);
                                return <td key={i} colSpan={3} style={{ ...excelTdStyle, background: "#e8acd1", fontSize: "9px", textAlign: "center" }}>{q?.pastPerformance || ""}</td>;
                              })}
                            </tr>

                            {/* Signature */}
                            <tr>
                              <td colSpan={Math.ceil(totalColumnsCount / 3)} style={{ ...excelTdStyle, borderTop: "2px solid #000", height: "80px", verticalAlign: "top", padding: "10px", textAlign: "center" }}>
                                <div style={{ fontWeight: "bold", marginBottom: "36px" }}>PREPARED BY</div>
                                <div style={{ fontWeight: "bold" }}>PURCHASE</div>
                              </td>
                              <td colSpan={Math.ceil(totalColumnsCount / 3)} style={{ ...excelTdStyle, borderTop: "2px solid #000", height: "80px", verticalAlign: "top", padding: "10px", textAlign: "center" }}>
                                <div style={{ fontWeight: "bold", marginBottom: "36px" }}>VERIFIED BY</div>
                                <div style={{ fontWeight: "bold" }}>PURCHASE</div>
                              </td>
                              <td colSpan={totalColumnsCount - 2 * Math.ceil(totalColumnsCount / 3)} style={{ ...excelTdStyle, borderTop: "2px solid #000", height: "80px", verticalAlign: "top", padding: "10px", textAlign: "center" }}>
                                <div style={{ fontWeight: "bold", marginBottom: "36px" }}>APPROVED BY</div>
                                <div style={{ fontWeight: "bold", color: existingCC?.status === "cc_approved" ? "#16a34a" : "#f59e0b" }}>
                                  {existingCC?.status === "cc_approved" ? "APPROVED" : "PENDING"}
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <button onClick={() => ccScrollRef.current?.scrollBy({ left: 250, behavior: "smooth" })} style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "48px", borderRadius: "8px 0 0 8px", border: "1.5px solid #ddd", borderRight: "none", background: "rgba(255,255,255,0.95)", cursor: "pointer", color: "#555", boxShadow: "-2px 0 8px rgba(0,0,0,0.10)" }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ── CC FORMATTED PREVIEW ─── Excel Match ─────────────── */}
            {ccViewMode === "preview" && vendorQuotes.length > 0 && request && !hasMultipleCCs && (() => {
              // Calculate values
              const sortedQuotes = [...vendorQuotes].sort((a, b) =>
                calculateQuoteTotal(a, request.quantity) - calculateQuoteTotal(b, request.quantity)
              );
              const lowestQuote = sortedQuotes[0];
              const getBaseRate = (q: typeof vendorQuotes[0]) => calculatePriceAfterDiscount(q.unitPrice * (q.perUnitBasis || 1), q.discountPercent);
              const getBaseTotal = (q: typeof vendorQuotes[0]) => getBaseRate(q) * request.quantity;
              const getGstAmountTotal = (q: typeof vendorQuotes[0]) => calculateGstAmount(getBaseRate(q), q.gstPercent) * request.quantity;
              const getGrandTotal = (q: typeof vendorQuotes[0]) => calculateQuoteTotal(q, request.quantity);

              const lowestBaseRate = getBaseRate(lowestQuote);
              const lowestBaseTotal = getBaseTotal(lowestQuote);

              const counterOfferMultiplier = 1 - (counterOfferPercent / 100);
              const counterBaseRate = lowestBaseRate * counterOfferMultiplier;
              const counterBaseTotal = lowestBaseTotal * counterOfferMultiplier;

              const lowestTotal = lowestQuote ? getGrandTotal(lowestQuote) : 0;
              const counterTotal = lowestTotal * counterOfferMultiplier;

              const totalColumnsCount = 10 + vendorQuotes.length * 3;

              return (
                <div style={{
                  fontFamily: "Arial, sans-serif",
                  color: "#000",
                  background: "#fff",
                  width: "100%",
                  paddingBottom: "12px"
                }}>

                  {/* ── TOOLBAR: Zoom only ── */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 4px 8px", borderBottom: "1px solid #e5e7eb", marginBottom: "6px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginRight: "2px" }}>Zoom</span>
                    <button
                      onClick={() => setCcZoom(z => Math.max(0.5, parseFloat((z - 0.1).toFixed(1))))}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "6px", border: "1.5px solid #ddd", background: "#f5f5f5", cursor: "pointer", color: "#444", fontSize: "16px", fontWeight: "bold", flexShrink: 0 }}
                      title="Zoom out"
                    >−</button>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#555", minWidth: "38px", textAlign: "center", background: "#f0f0f0", borderRadius: "4px", padding: "2px 4px" }}>{Math.round(ccZoom * 100)}%</span>
                    <button
                      onClick={() => setCcZoom(z => Math.min(1.5, parseFloat((z + 0.1).toFixed(1))))}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "6px", border: "1.5px solid #ddd", background: "#f5f5f5", cursor: "pointer", color: "#444", fontSize: "16px", fontWeight: "bold", flexShrink: 0 }}
                      title="Zoom in"
                    >+</button>
                    <button
                      onClick={() => setCcZoom(1.0)}
                      style={{ fontSize: "10px", padding: "4px 8px", borderRadius: "5px", border: "1.5px solid #ddd", background: "#f5f5f5", cursor: "pointer", color: "#666", marginLeft: "2px" }}
                      title="Reset zoom"
                    >Reset</button>
                  </div>

                  {/* Table with absolute side scroll arrows */}
                  <div style={{ position: "relative", width: "100%" }}>
                    {/* LEFT arrow — absolute, vertically centered */}
                    <button
                      onClick={() => ccScrollRef.current?.scrollBy({ left: -250, behavior: "smooth" })}
                      style={{
                        position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                        zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center",
                        width: "26px", height: "48px", borderRadius: "0 8px 8px 0",
                        border: "1.5px solid #ddd", borderLeft: "none",
                        background: "rgba(255,255,255,0.95)", cursor: "pointer", color: "#555",
                        boxShadow: "2px 0 8px rgba(0,0,0,0.10)",
                      }}
                      title="Scroll left"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 10L3.5 6l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>

                    {/* Scrollable zoomable table container — full width */}
                    <div ref={ccScrollRef} style={{ overflowX: "auto", width: "100%" }}>
                      {/* Ensure table doesn't squash too much */}
                      <div style={{ minWidth: `${1000 + vendorQuotes.length * 150}px`, transform: `scale(${ccZoom})`, transformOrigin: "top left", width: `${100 / ccZoom}%` }}>
                        <table id="cc-export-table" style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          tableLayout: "fixed",
                        }}>
                          {/* Define column widths generally: SR NO, Item Desc, Spec, Unit, Qty, Counter Rate, Counter Total, Lowest Rate, Lowest Total, then 3 cols per vendor */}
                          {/* Column widths: SR NO(40), ITEM DESC(220), SPEC(180), UNIT(60), QTY(60), COUNTER RATE(70), TOTAL(80), LOWEST RATE(70), DISC(55), TOTAL(80) */}
                          <colgroup>
                            <col style={{ width: "40px" }} />
                            <col style={{ width: "220px" }} />
                            <col style={{ width: "180px" }} />
                            <col style={{ width: "60px" }} />
                            <col style={{ width: "60px" }} />
                            <col style={{ width: "70px" }} />
                            <col style={{ width: "80px" }} />
                            <col style={{ width: "70px" }} />
                            <col style={{ width: "55px" }} />
                            <col style={{ width: "80px" }} />
                            {vendorQuotes.map((_, i) => (<React.Fragment key={i}><col style={{ width: "70px" }} /><col style={{ width: "55px" }} /><col style={{ width: "80px" }} /></React.Fragment>))}
                          </colgroup>
                          <tbody>
                            {/* Row Header 1: Company Name */}
                            <tr>
                              <th colSpan={totalColumnsCount} style={{ ...excelThStyle, background: "#cbe4f9", color: "#1a4670", fontSize: "16px", padding: "8px", border: "1px solid #7a7a7a" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 10px" }}>
                                  <span style={{ visibility: "hidden" }}>NOTION</span> {/* spacer for centering */}
                                  <span style={{ textAlign: "center", letterSpacing: "1px" }}>NOTION ELECTRONICS PVT. LTD. ( AN ISO 9001: 2015 COMPANY )</span>
                                  <img src="/images/logos/Notion_Logo-removebg-preview.png" alt="Notion Logo" style={{ height: "22px", objectFit: "contain" }} />
                                </div>
                              </th>
                            </tr>

                            {/* Row 2: Form Title */}
                            <tr>
                              <th colSpan={3} style={{ ...excelThStyle, background: "#e8acd1", color: "#61224d", textAlign: "left", fontSize: "12px", paddingLeft: "12px", border: "1px solid #7a7a7a" }}>
                                {(request as any)?.project?.name
                                  ? `PROJECT: ${(request as any).project.name}`
                                  : (request as any)?.site?.name
                                    ? `SITE: ${(request as any).site.name}`
                                    : `REQ: ${request.requestNumber}`}
                                {existingCC ? ` (${request.requestNumber}-CC-1)` : ""}
                              </th>
                              <th colSpan={totalColumnsCount - 3} style={{ ...excelThStyle, background: "#e8acd1", color: "#61224d", fontSize: "14px", border: "1px solid #7a7a7a" }}>
                                VENDOR COMPARISON FORM
                              </th>
                            </tr>

                            {/* Row 3: Super Headers */}
                            <tr>
                              <th rowSpan={5} style={{ ...excelThStyle, background: "#dee5ed" }}>SR NO.</th>
                              <th rowSpan={5} style={{ ...excelThStyle, background: "#dee5ed" }}>ITEM DESCRIPTION</th>
                              <th rowSpan={5} style={{ ...excelThStyle, background: "#dee5ed" }}>SPECIFICATION / MODEL NO</th>
                              <th colSpan={2} style={{ ...excelThStyle, background: "#dee5ed", textAlign: "left", paddingLeft: "8px" }}>VENDOR</th>
                              <th colSpan={2} style={{ ...excelThStyle, background: "#dee5ed" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                                  COUNTER OFFER {counterOfferPercent}%
                                </div>
                              </th>
                              <th colSpan={3} style={{ ...excelThStyle, background: "#dee5ed" }}>LOWEST RATE</th>
                              {vendorQuotes.map((q, i) => {
                                const isLowest = q.vendorId === lowestQuote?.vendorId;
                                const isSelected = selectedFinalVendor === q.vendorId;
                                return (
                                  <th
                                    key={i}
                                    colSpan={3}
                                    onClick={() => isManagerReview && setSelectedFinalVendor(isSelected ? "" : q.vendorId)}
                                    title={isManagerReview ? "Click to select this vendor" : undefined}
                                    style={{
                                      ...excelThStyle,
                                      background: isSelected ? "#86efac" : (isLowest ? "#d8f3dc" : "#dee5ed"),
                                      textTransform: "uppercase",
                                      cursor: isManagerReview ? "pointer" : "default",
                                      border: isSelected ? "2px solid #166534" : "1px solid #7a7a7a",
                                      color: isSelected ? "#14532d" : "#000"
                                    }}
                                  >
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                      <span>{getVendorName(q.vendorId)}</span>
                                      {isManagerReview && (
                                        <span className="no-export" data-html2canvas-ignore="true" style={{ fontSize: "9px", fontWeight: "bold", opacity: isSelected ? 1 : 0.6, letterSpacing: "0.5px" }}>
                                          {isSelected ? "✓ SELECTED" : "CLICK TO SELECT"}
                                        </span>
                                      )}
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>

                            {/* Row 4: CONTACT */}
                            <tr>
                              <th colSpan={2} style={{ ...excelThStyle, background: "#dee5ed", textAlign: "left", paddingLeft: "8px" }}>CONTACT</th>
                              <th colSpan={2} style={{ ...excelThStyle, background: "#dee5ed" }}></th>
                              <th colSpan={3} style={{ ...excelThStyle, background: "#d8f3dc", fontSize: "9px", fontWeight: "normal" }}>{lowestQuote?.contact || ""}</th>
                              {vendorQuotes.map((q, i) => {
                                const isLowest = q.vendorId === lowestQuote?.vendorId;
                                return (
                                  <th key={i} colSpan={3} style={{ ...excelThStyle, background: isLowest ? "#d8f3dc" : "#dee5ed", fontSize: "9px", fontWeight: "normal" }}>{q.contact || ""}</th>
                                );
                              })}
                            </tr>

                            {/* Row 5: REFERENCE */}
                            <tr>
                              <th colSpan={2} style={{ ...excelThStyle, background: "#dee5ed", textAlign: "left", paddingLeft: "8px" }}>REFRENCE</th>
                              <th colSpan={2} style={{ ...excelThStyle, background: "#dee5ed" }}></th>
                              <th colSpan={3} style={{ ...excelThStyle, background: "#d8f3dc", fontSize: "9px", fontWeight: "normal" }}>{lowestQuote?.reference || ""}</th>
                              {vendorQuotes.map((q, i) => {
                                const isLowest = q.vendorId === lowestQuote?.vendorId;
                                return (
                                  <th key={i} colSpan={3} style={{ ...excelThStyle, background: isLowest ? "#d8f3dc" : "#dee5ed", fontSize: "9px", fontWeight: "normal" }}>{q.reference || ""}</th>
                                );
                              })}
                            </tr>

                            {/* Row 6: DATE */}
                            <tr>
                              <th colSpan={2} style={{ ...excelThStyle, background: "#dee5ed", textAlign: "left", paddingLeft: "8px" }}>DATE</th>
                              <th colSpan={2} style={{ ...excelThStyle, background: "#dee5ed" }}>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-')}</th>
                              <th colSpan={3} style={{ ...excelThStyle, background: "#d8f3dc", fontSize: "9px", fontWeight: "normal" }}>{lowestQuote?.date ? new Date(lowestQuote.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ""}</th>
                              {vendorQuotes.map((q, i) => {
                                const isLowest = q.vendorId === lowestQuote?.vendorId;
                                return (
                                  <th key={i} colSpan={3} style={{ ...excelThStyle, background: isLowest ? "#d8f3dc" : "#dee5ed", fontSize: "9px", fontWeight: "normal" }}>{q.date ? new Date(q.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}</th>
                                );
                              })}
                            </tr>

                            {/* Row 7: Sub headers (Unit, Qty, Rate, Total) */}
                            <tr>
                              <th style={{ ...excelThStyle, background: "#dee5ed" }}>Unit</th>
                              <th style={{ ...excelThStyle, background: "#dee5ed" }}>Qty</th>
                              <th style={{ ...excelThStyle, background: "#dee5ed" }}>RATE</th>
                              <th style={{ ...excelThStyle, background: "#dee5ed" }}>TOTAL</th>
                              <th style={{ ...excelThStyle, background: "#d8f3dc" }}>RATE</th>
                              <th style={{ ...excelThStyle, background: "#d8f3dc" }}>DISC.</th>
                              <th style={{ ...excelThStyle, background: "#d8f3dc" }}>TOTAL</th>
                              {vendorQuotes.map((q, i) => {
                                const isLowest = q.vendorId === lowestQuote?.vendorId;
                                return (
                                  <React.Fragment key={i}>
                                    <th style={{ ...excelThStyle, background: isLowest ? "#d8f3dc" : "#dee5ed" }}>RATE</th>
                                    <th style={{ ...excelThStyle, background: isLowest ? "#d8f3dc" : "#dee5ed" }}>DISC.</th>
                                    <th style={{ ...excelThStyle, background: isLowest ? "#d8f3dc" : "#dee5ed" }}>TOTAL</th>
                                  </React.Fragment>
                                );
                              })}
                            </tr>

                            {/* Data Row */}
                            <tr>
                              <td style={{ ...excelTdStyle }}>1</td>
                              <td style={{ ...excelTdStyle, textAlign: "left" }}>{request.itemName.toUpperCase()}</td>
                              <td style={{ ...excelTdStyle, textAlign: "left", fontSize: "10px" }}>{vendorQuotes[0]?.specification || request.specsBrand || (itemInInventory as any)?.specification || ""}</td>
                              <td style={{ ...excelTdStyle }}>{request.unit || vendorQuotes[0]?.unit || 'NOS.'}</td>
                              <td style={{ ...excelTdStyle }}>{request.quantity}</td>

                              {/* Counter Offer Base */}
                              <td style={{ ...excelTdStyle }}>{parseFloat(counterBaseRate.toFixed(3))}</td>
                              <td style={{ ...excelTdStyle }}>{parseFloat(counterBaseTotal.toFixed(3))}</td>

                              {/* Lowest Rate — RATE + DISC. + TOTAL */}
                              <td style={{ ...excelTdStyle, background: "#ebfbee" }}>{parseFloat(lowestBaseRate.toFixed(3))}</td>
                              <td style={{ ...excelTdStyle, background: "#ebfbee" }}>{lowestQuote?.discountPercent ? parseFloat(lowestQuote.discountPercent.toFixed(2)) + "%" : ""}</td>
                              <td style={{ ...excelTdStyle, background: "#ebfbee" }}>{parseFloat(lowestBaseTotal.toFixed(3))}</td>

                              {/* Vendors Base */}
                              {vendorQuotes.map((q, i) => {
                                const baseRateBeforeDiscount = q.unitPrice * (q.perUnitBasis || 1);
                                const isLowest = q.vendorId === lowestQuote?.vendorId;
                                return (
                                  <React.Fragment key={`data-v-${i}`}>
                                    <td style={{ ...excelTdStyle, background: isLowest ? "#ebfbee" : "transparent" }}>{parseFloat(baseRateBeforeDiscount.toFixed(3))}</td>
                                    <td style={{ ...excelTdStyle, background: isLowest ? "#ebfbee" : "transparent" }}>{q.discountPercent ? parseFloat(q.discountPercent.toFixed(2)) + "%" : ""}</td>
                                    <td style={{ ...excelTdStyle, background: isLowest ? "#ebfbee" : "transparent" }}>{parseFloat(getBaseTotal(q).toFixed(3))}</td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>

                            {/* Freight */}
                            <tr>
                              <td colSpan={3} style={{ ...excelTdStyle, borderRight: "none" }}></td>
                              <td colSpan={2} style={{ ...excelThStyle, background: "#dee5ed", borderLeft: "none", textAlign: "right", paddingRight: "8px" }}>Freight</td>
                              <td style={{ ...excelTdStyle }}></td>
                              <td style={{ ...excelTdStyle }}></td>
                              <td style={{ ...excelTdStyle, background: "#ebfbee" }}></td>
                              <td style={{ ...excelTdStyle, background: "#ebfbee" }}></td>
                              <td style={{ ...excelTdStyle, background: "#ebfbee" }}>{lowestQuote?.freight || ""}</td>
                              {vendorQuotes.map((q, i) => {
                                const isLowest = q.vendorId === lowestQuote?.vendorId;
                                return (
                                  <React.Fragment key={`fr-${i}`}>
                                    <td colSpan={3} style={{ ...excelTdStyle, background: isLowest ? "#ebfbee" : "transparent", textAlign: "center", fontSize: "9px" }}>{q.freight || ""}</td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>

                            {/* TOTAL (Base Amount without GST) */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#9bc2e6", textAlign: "right", paddingRight: "8px", fontWeight: "bold", border: "1px solid #7a7a7a" }}>TOTAL</th>
                              <td style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                              <td style={{ ...excelTdStyle, background: "#9bc2e6", fontWeight: "bold" }}>{parseFloat(counterBaseTotal.toFixed(3))}</td>
                              <td style={{ ...excelTdStyle, background: "#c3e6cb" }}></td>
                              <td style={{ ...excelTdStyle, background: "#c3e6cb" }}></td>
                              <td style={{ ...excelTdStyle, background: "#c3e6cb", fontWeight: "bold" }}>{parseFloat(lowestBaseTotal.toFixed(3))}</td>
                              {vendorQuotes.map((q, i) => {
                                const isLowest = q.vendorId === lowestQuote?.vendorId;
                                return (
                                  <React.Fragment key={`tot-${i}`}>
                                    <td style={{ ...excelTdStyle, background: isLowest ? "#c3e6cb" : "#9bc2e6" }}></td>
                                    <td style={{ ...excelTdStyle, background: isLowest ? "#c3e6cb" : "#9bc2e6" }}></td>
                                    <td style={{ ...excelTdStyle, background: isLowest ? "#c3e6cb" : "#9bc2e6", fontWeight: "bold" }}>{parseFloat(getBaseTotal(q).toFixed(3))}</td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>

                            {/* GST */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#9bc2e6", textAlign: "right", paddingRight: "8px", fontWeight: "bold", border: "1px solid #7a7a7a" }}>GST</th>
                              <td style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                              <td style={{ ...excelTdStyle, background: "#9bc2e6", fontWeight: "bold" }}>{parseFloat((getGstAmountTotal(lowestQuote) * counterOfferMultiplier).toFixed(3))}</td>
                              <td style={{ ...excelTdStyle, background: "#c3e6cb", fontWeight: "bold", fontSize: "10px" }}>{lowestQuote?.gstPercent ? `${lowestQuote.gstPercent}%` : ""}</td>
                              <td style={{ ...excelTdStyle, background: "#c3e6cb" }}></td>
                              <td style={{ ...excelTdStyle, background: "#c3e6cb", fontWeight: "bold" }}>{parseFloat(getGstAmountTotal(lowestQuote).toFixed(3))}</td>
                              {vendorQuotes.map((q, i) => (
                                <React.Fragment key={`gst-${i}`}>
                                  <td style={{ ...excelTdStyle, background: "#9bc2e6", fontWeight: "bold", fontSize: "10px" }}>{q.gstPercent ? `${q.gstPercent}%` : ""}</td>
                                  <td style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                                  <td style={{ ...excelTdStyle, background: "#9bc2e6", fontWeight: "bold" }}>{parseFloat(getGstAmountTotal(q).toFixed(3))}</td>
                                </React.Fragment>
                              ))}
                            </tr>

                            {/* TOTAL AMOUNT (With GST) */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#9bc2e6", textAlign: "right", paddingRight: "8px", fontWeight: "bold", border: "1px solid #7a7a7a" }}>TOTAL AMOUNT</th>
                              <td style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                              <td style={{ ...excelTdStyle, background: "#9bc2e6", fontWeight: "bold" }}>{parseFloat(counterTotal.toFixed(3))}</td>
                              <td style={{ ...excelTdStyle, background: "#c3e6cb" }}></td>
                              <td style={{ ...excelTdStyle, background: "#c3e6cb" }}></td>
                              <td style={{ ...excelTdStyle, background: "#c3e6cb", fontWeight: "bold" }}>{parseFloat(lowestTotal.toFixed(3))}</td>
                              {vendorQuotes.map((q, i) => (
                                <React.Fragment key={`grand-${i}`}>
                                  <td style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                                  <td style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                                  <td style={{ ...excelTdStyle, background: "#9bc2e6", fontWeight: "bold" }}>{parseFloat(getGrandTotal(q).toFixed(3))}</td>
                                </React.Fragment>
                              ))}
                            </tr>

                            {/* DELIVERY PERIOD */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#e8acd1", textAlign: "right", paddingRight: "8px", color: "#61224d", fontWeight: "bold", border: "1px solid #7a7a7a" }}>DELIVERY PERIOD</th>
                              <td colSpan={5} style={{ ...excelTdStyle, background: "#e8acd1" }}></td>
                              {vendorQuotes.map((q, i) => (
                                <td key={`del-${i}`} colSpan={3} style={{ ...excelTdStyle, background: "#e8acd1", fontSize: "10px", textAlign: "center" }}>{q.deliveryPeriod || ""}</td>
                              ))}
                            </tr>

                            {/* PAYMENT TERMS */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#9bc2e6", textAlign: "right", paddingRight: "8px", color: "#61224d", fontWeight: "bold", border: "1px solid #7a7a7a" }}>PAYMENT TERMS</th>
                              <td colSpan={5} style={{ ...excelTdStyle, background: "#9bc2e6" }}></td>
                              {vendorQuotes.map((q, i) => (
                                <td key={`pay-${i}`} colSpan={3} style={{ ...excelTdStyle, background: "#9bc2e6", fontSize: "10px", textAlign: "center" }}>{q.paymentTerms || ""}</td>
                              ))}
                            </tr>

                            {/* PAST PERFORMANCE */}
                            <tr>
                              <th colSpan={5} style={{ ...excelThStyle, background: "#e8acd1", textAlign: "right", paddingRight: "8px", color: "#61224d", fontWeight: "bold", border: "1px solid #7a7a7a" }}>PAST PERFORMANCE</th>
                              <td colSpan={5} style={{ ...excelTdStyle, background: "#e8acd1" }}></td>
                              {vendorQuotes.map((q, i) => (
                                <td key={`past-${i}`} colSpan={3} style={{ ...excelTdStyle, background: "#e8acd1", fontSize: "10px", textAlign: "center" }}>{q.pastPerformance || ""}</td>
                              ))}
                            </tr>

                            {/* Signature Row */}
                            <tr>
                              <td colSpan={4} style={{ ...excelTdStyle, borderTop: "2px solid #000", height: "90px", verticalAlign: "top", padding: "12px", textAlign: "center" }}>
                                <div style={{ fontWeight: "bold", marginBottom: "40px" }}>PREPARED BY</div>
                                <div style={{ fontSize: "12px", fontWeight: "bold", color: "#333", textTransform: "uppercase" }}>{currentUser?.fullName || currentUser?.username || ""}</div>
                              </td>
                              <td colSpan={totalColumnsCount > 10 ? 3 : 2} style={{ ...excelTdStyle, borderTop: "2px solid #000", height: "90px", verticalAlign: "top", padding: "12px", textAlign: "center" }}>
                                <div style={{ fontWeight: "bold", marginBottom: "40px" }}>VERIFIED BY</div>
                                <div style={{ fontSize: "12px", fontWeight: "bold", color: "#333", textTransform: "uppercase", minHeight: "15px" }}>{existingCC ? (currentUser?.fullName || currentUser?.username || "") : ""}</div>
                              </td>
                              <td colSpan={totalColumnsCount - (4 + (totalColumnsCount > 10 ? 3 : 2))} style={{ ...excelTdStyle, borderTop: "2px solid #000", height: "90px", verticalAlign: "top", padding: "12px", textAlign: "center" }}>
                                <div style={{ fontWeight: "bold", marginBottom: "40px" }}>APPROVED BY</div>
                                <div style={{ fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", color: existingCC?.status === "cc_approved" || request?.status === "ready_for_po" || request?.status === "pending_po" || request?.status === "delivered" ? "#217346" : existingCC?.status === "cc_rejected" ? "#d9534f" : "#f0ad4e" }}>
                                  {existingCC?.status === "cc_approved" || request?.status === "ready_for_po" || request?.status === "pending_po" || request?.status === "delivered" ? existingCC?.approver?.fullName || "MANAGER" : existingCC?.status === "cc_rejected" ? "REJECTED" : "PENDING"}
                                </div>
                              </td>
                            </tr>

                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* RIGHT arrow — absolute, vertically centered */}
                    <button
                      onClick={() => ccScrollRef.current?.scrollBy({ left: 250, behavior: "smooth" })}
                      style={{
                        position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
                        zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center",
                        width: "26px", height: "48px", borderRadius: "8px 0 0 8px",
                        border: "1.5px solid #ddd", borderRight: "none",
                        background: "rgba(255,255,255,0.95)", cursor: "pointer", color: "#555",
                        boxShadow: "-2px 0 8px rgba(0,0,0,0.10)",
                      }}
                      title="Scroll right"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>

                  {/* ── ACTION BUTTONS ── clean 2-row layout ── */}
                  <div style={{ marginTop: "14px", padding: "0 2px" }}>
                    {/* Row 1: utility buttons */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "8px", marginBottom: "8px" }}>
                      {/* Excel */}
                      <button
                        onClick={() => {
                          try {
                            const table = document.getElementById('cc-export-table');
                            if (!table) return;
                            const clone = table.cloneNode(true) as HTMLElement;
                            clone.querySelectorAll('.no-export').forEach(el => el.remove());
                            const wb = XLSX.utils.table_to_book(clone, { sheet: "Sheet1" });
                            XLSX.writeFile(wb, `Cost_Comparison_${request.requestNumber || 'Export'}.xlsx`);
                            toast.success("Excel downloaded!");
                          } catch (err) { console.error(err); toast.error("Failed to download Excel"); }
                        }}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "8px 10px", borderRadius: "7px", border: "1.5px solid #217346", background: "#fff", color: "#217346", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
                      >
                        <Download style={{ width: "13px", height: "13px" }} /> Excel
                      </button>
                      {/* PDF */}
                      <button
                        onClick={async () => {
                          const table = document.getElementById('cc-export-table');
                          if (!table) return;
                          try {
                            const canvas = await html2canvas(table, { scale: 2 } as any);
                            const imgData = canvas.toDataURL("image/png");
                            const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [canvas.width * 0.75, canvas.height * 0.75] });
                            pdf.addImage(imgData, "PNG", 0, 0, canvas.width * 0.75, canvas.height * 0.75);
                            pdf.save(`Cost_Comparison_${request.requestNumber || 'Export'}.pdf`);
                            toast.success("PDF downloaded!");
                          } catch (err) { console.error(err); toast.error("Failed to download PDF"); }
                        }}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "8px 10px", borderRadius: "7px", border: "1.5px solid #d9534f", background: "#fff", color: "#d9534f", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
                      >
                        <Printer style={{ width: "13px", height: "13px" }} /> PDF
                      </button>
                      {/* Add Quote */}
                      {canEdit && !isManagerReview && (
                        <button
                          onClick={() => {
                            setCCViewMode("form"); setVendorDialogOpen(true); setEditingQuoteIndex(-1);
                            setSelectedVendorId(""); setUnitPrice("");
                            setQuoteAmount((quantityToBuy || request?.quantity || 0).toString());
                            const bestUnit = itemInInventory?.unit || request?.unit || "";
                            if (bestUnit) setQuoteUnit(bestUnit);
                          }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "8px 10px", borderRadius: "7px", border: "1.5px solid #555", background: "#fff", color: "#333", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
                        >
                          <Plus style={{ width: "13px", height: "13px" }} /> Add Quote
                        </button>
                      )}
                      {/* Edit CC */}
                      {!isManagerReview && (
                        <button
                          onClick={() => setCCViewMode("form")}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "8px 10px", borderRadius: "7px", border: "1.5px solid #555", background: "#fff", color: "#333", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
                        >
                          <Edit style={{ width: "13px", height: "13px" }} /> Edit CC
                        </button>
                      )}
                    </div>

                    {/* Row 2: Submit / status */}
                    {canEdit && !isManager && (
                      <button
                        onClick={() => setShowSubmitConfirm(true)}
                        disabled={isSaving || isSubmitting || vendorQuotes.length < 2}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                          padding: "10px 20px", borderRadius: "8px", border: "none",
                          background: vendorQuotes.length < 2 ? "#c8c8c8" : "linear-gradient(135deg, #1565c0 0%, #1976d2 100%)",
                          color: "#fff", fontWeight: 700, fontSize: "13px",
                          cursor: vendorQuotes.length < 2 ? "not-allowed" : "pointer",
                          boxShadow: vendorQuotes.length < 2 ? "none" : "0 2px 8px rgba(21,101,192,0.35)",
                        }}
                      >
                        <Send style={{ width: "14px", height: "14px" }} />
                        {existingCC?.status === "cc_rejected" ? "Resubmit CC" : "Submit for Approval"}
                      </button>
                    )}
                    {/* Manager Review Actions IN PREVIEW (Compact) */}
                    {isManagerReview && (
                      <div className="flex flex-col gap-3 bg-card p-3 rounded-lg border border-border mt-2 shadow-sm">
                        {/* Per-item vendor selection summary for merged CC */}
                        {hasMultipleCCs ? (
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                              Selected Vendors <span className="text-destructive">*</span>
                            </Label>
                            {allCCRequests.map((req, idx) => {
                              const rid = ccRequestIds[idx];
                              const selected = rid ? selectedVendorPerItem[rid] : undefined;
                              return (
                                <div key={idx} className="flex items-center gap-2 text-xs">
                                  <span className="font-bold text-muted-foreground w-12 shrink-0">Item {idx + 1}</span>
                                  <span className="truncate flex-1 text-muted-foreground">{req?.itemName}</span>
                                  <span className={`font-semibold shrink-0 ${selected ? "text-primary" : "text-muted-foreground italic"}`}>
                                    {selected ? getVendorName(selected) : "— click SELECT in table —"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          vendorQuotes.length > 0 && (
                            <div className="flex flex-col items-start justify-center gap-1 w-full md:w-[180px] shrink-0 border-r border-border pr-2">
                              <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                Final Vendor <span className="text-destructive">*</span>
                              </Label>
                              <div className={`text-sm font-semibold truncate w-full ${selectedFinalVendor ? "text-primary" : "text-muted-foreground italic"}`}>
                                {selectedFinalVendor ? getVendorName(selectedFinalVendor as Id<"vendors">) : "None selected"}
                              </div>
                            </div>
                          )
                        )}
                        <Textarea
                          placeholder="Manager notes (Required for rejection)..."
                          value={managerNotes}
                          onChange={(e) => setManagerNotes(e.target.value)}
                          className="w-full h-9 min-h-[36px] resize-none text-xs bg-background text-foreground placeholder:text-muted-foreground border-input py-2 px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <div className="flex gap-2 w-full">
                          <Button
                            variant="outline"
                            onClick={async () => {
                              if (!managerNotes.trim()) {
                                toast.error("Please provide a reason for rejection");
                                return;
                              }
                              setIsReviewing(true);
                              try {
                                if (hasMultipleCCs) {
                                  for (const rid of ccRequestIds) {
                                    if (!rid) continue;
                                    await reviewCC({ requestId: rid, action: "reject", notes: managerNotes.trim() });
                                  }
                                  toast.success("All items rejected");
                                } else {
                                  await reviewCC({ requestId: activeRequestId!, action: "reject", notes: managerNotes.trim() });
                                  toast.success("Cost comparison rejected");
                                }
                                onOpenChange(false);
                              } catch (error: any) { toast.error(error.message || "Failed to reject"); }
                              finally { setIsReviewing(false); }
                            }}
                            disabled={isReviewing}
                            className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20 h-9 px-3 text-xs"
                          >
                            <X className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                          <Button
                            onClick={async () => {
                              if (hasMultipleCCs) {
                                const missing = ccRequestIds.filter(rid => rid && !selectedVendorPerItem[rid]);
                                if (missing.length > 0) {
                                  toast.error("Please select a vendor for each item (click SELECT in the table)");
                                  return;
                                }
                                setIsReviewing(true);
                                try {
                                  for (const rid of ccRequestIds) {
                                    if (!rid) continue;
                                    await reviewCC({ requestId: rid, action: "approve", selectedVendorId: selectedVendorPerItem[rid], notes: managerNotes.trim() || undefined });
                                  }
                                  toast.success("All items approved");
                                  onOpenChange(false);
                                } catch (error: any) { toast.error(error.message || "Failed to approve"); }
                                finally { setIsReviewing(false); }
                              } else {
                                if (!selectedFinalVendor) {
                                  toast.error("Please select a final vendor");
                                  return;
                                }
                                setIsReviewing(true);
                                try {
                                  await reviewCC({ requestId: activeRequestId!, action: "approve", selectedVendorId: selectedFinalVendor as Id<"vendors">, notes: managerNotes.trim() || undefined });
                                  toast.success("Cost comparison approved");
                                  onOpenChange(false);
                                } catch (error: any) { toast.error(error.message || "Failed to approve"); }
                                finally { setIsReviewing(false); }
                              }
                            }}
                            disabled={isReviewing || (hasMultipleCCs
                              ? ccRequestIds.some(rid => rid && !selectedVendorPerItem[rid])
                              : !selectedFinalVendor)}
                            className="flex-[2] bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-3 text-xs"
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            {hasMultipleCCs ? `Approve All (${ccRequestIds.length} items)` : "Approve"}
                          </Button>
                        </div>
                      </div>
                    )}
                    {isManager && isSubmitted && !isManagerReview && (
                      <div className="text-center text-xs text-muted-foreground italic py-2">
                        {existingCC?.status === "cc_approved" ? "Cost comparison approved" : "Cost comparison rejected"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* ── REGULAR FORM VIEW (only when not in preview mode) ─────────────── */}
            {ccViewMode !== "preview" && (
              <>{/* wrapper fragment start */}</>
            )}
            {/* Item Information Card - Compact & Clean */}
            {ccViewMode !== "preview" && request && (
              <div className="bg-muted/10 rounded-xl border border-border/50 overflow-hidden">
                <div className="bg-card px-5 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-sm flex items-center gap-2 text-primary">
                      <Package className="h-4 w-4" />
                      Item Details
                    </h4>
                    {canEdit && !isManager && !isEditingItem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleStartEditItem}
                        className="h-7 w-7 p-0 hover:bg-muted text-muted-foreground"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {isEditingItem && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSaveItemDetails}
                          disabled={isUpdatingItem}
                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelEditItem}
                          disabled={isUpdatingItem}
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    {/* Item Name */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Item Name</span>
                      {isEditingItem ? (
                        <div className="relative">
                          <Input
                            type="text"
                            value={editItemName}
                            onChange={(e) => handleItemNameInputChange(e.target.value)}
                            onKeyDown={handleItemNameKeyDown}
                            onFocus={handleItemNameFocus}
                            onBlur={handleItemNameBlur}
                            placeholder="Enter item name..."
                            className="text-sm h-8"
                            disabled={isUpdatingItem}
                          />
                          {showItemNameSuggestions && getFilteredItemNameSuggestions(editItemName).length > 0 && (
                            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                              {getFilteredItemNameSuggestions(editItemName).map((item, index) => (
                                <button
                                  key={item._id}
                                  type="button"
                                  onClick={() => handleItemNameSuggestionClick(item.itemName)}
                                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors ${index === selectedItemNameIndex ? 'bg-muted font-medium' : ''
                                    }`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <span>{item.itemName}</span>
                                    <span className="text-muted-foreground ml-2">
                                      ({item.centralStock || 0} {item.unit || 'units'})
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="font-medium text-base truncate pr-4" title={request.itemName}>{request.itemName}</p>
                      )}
                    </div>

                    {/* Quantity & Unit */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Quantity</span>
                      {isEditingItem ? (
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            min="1"
                            step="any"
                            value={editQuantity}
                            onChange={(e) => setEditQuantity(e.target.value)}
                            className="h-8 text-sm w-24"
                            disabled={isUpdatingItem}
                            placeholder="Qty"
                          />
                          <div className="relative flex-1">
                            <Input
                              type="text"
                              placeholder="Unit"
                              value={editUnit}
                              onChange={(e) => handleUnitInputChange(e.target.value)}
                              onKeyDown={handleUnitKeyDown}
                              onFocus={handleUnitFocus}
                              onBlur={handleUnitBlur}
                              className="h-8 text-sm"
                              disabled={isUpdatingItem}
                            />
                            {showUnitSuggestions && getFilteredUnitSuggestions(editUnit).length > 0 && (
                              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-md shadow-lg max-h-40 overflow-y-auto w-full min-w-[100px]">
                                {getFilteredUnitSuggestions(editUnit).map((suggestion, index) => (
                                  <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => handleUnitSuggestionClick(suggestion)}
                                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors ${index === selectedUnitIndex ? 'bg-muted font-medium' : ''
                                      }`}
                                  >
                                    {suggestion}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-1.5">
                          <p className="font-bold text-lg tabular-nums">{request.quantity}</p>
                          <p className="text-sm text-muted-foreground font-medium">{request.unit || itemInInventory?.unit || 'units'}</p>
                        </div>
                      )}
                    </div>

                    {/* Description - Full Grid Width */}
                    {(request.description || isEditingItem) && (
                      <div className="md:col-span-2 space-y-1.5 pt-2 border-t border-dashed">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Description</span>
                        {isEditingItem ? (
                          <Textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Enter item description..."
                            className="mt-1 text-sm min-h-[60px]"
                            disabled={isUpdatingItem}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground/90 leading-relaxed bg-muted/20 p-2.5 rounded-md border border-border/40 min-h-[40px]">
                            {request.description}
                          </p>
                        )}
                      </div>
                    )}

                    {(request.specsBrand || (itemInInventory as any)?.specification || isEditingItem) && (
                      <div className="md:col-span-2 space-y-1.5 pt-2 border-t border-dashed">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Specification / Model No</span>
                        {isEditingItem ? (
                          <Textarea
                            value={editSpecification}
                            onChange={(e) => setEditSpecification(e.target.value)}
                            placeholder="Enter specification or model no..."
                            className="mt-1 text-sm min-h-[60px]"
                            disabled={isUpdatingItem}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground/90 leading-relaxed bg-muted/20 p-2.5 rounded-md border border-border/40 min-h-[40px]">
                            {request.specsBrand || (itemInInventory as any)?.specification || ""}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {!isEditingItem && (
                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInventoryInfoOpen(true)}
                        className="text-xs h-7 gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                      >
                        <Info className="h-3.5 w-3.5" />
                        View Inventory Details
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}


            {/* Loading Indicator for Inventory Data */}
            {ccViewMode !== "preview" && isInventoryLoading && canEdit && !isSubmitted && !isManager && (
              <div className="p-4 bg-muted/50 border border-border/60 rounded-lg animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-muted rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Loading inventory status...</p>
              </div>
            )}



            {/* Rejection Notes */}
            {ccViewMode !== "preview" && existingCC?.status === "cc_rejected" && (
              <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <span className="font-semibold text-destructive">Rejected: </span>
                    <span className="text-muted-foreground">{existingCC.managerNotes || "No reason provided."}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Vendor Quotes - Show always to allow comparison even if stock exists */}
            {ccViewMode !== "preview" && (canEditUI || isManagerReview) && (
              <div className="space-y-4 pt-2 border-t mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Building className="h-4 w-4 text-primary" />
                    {isManagerReview ? "Select Final Vendor" : "Vendor Quotes"}
                  </h3>
                  {/* Create/Add Vendor Button and Counter */}
                  <div className="flex items-center gap-3">
                    {canEdit && !isManagerReview && vendorQuotes.length > 0 && (
                      <div className="flex items-center gap-2 border px-2 py-1 rounded-md bg-muted/20">
                        <label htmlFor="base-counter-offer" className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                          Counter Offer %
                        </label>
                        <input
                          id="base-counter-offer"
                          type="number"
                          min={0}
                          max={100}
                          value={counterOfferPercent}
                          onChange={(e) => setCounterOfferPercent(Number(e.target.value))}
                          className="w-16 h-7 text-xs text-center p-0 bg-transparent border rounded border-muted-foreground/30"
                        />
                      </div>
                    )}
                    {canEdit && !isManagerReview && vendorQuotes.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setQuoteAmount((quantityToBuy || request?.quantity || 0).toString());
                          const bestUnit = itemInInventory?.unit || request?.unit || "";
                          if (bestUnit) setQuoteUnit(bestUnit);
                          setVendorDialogOpen(true);
                        }}
                        className="h-8 gap-1 border-dashed border-2 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Quote
                      </Button>
                    )}
                  </div>
                </div>

                {/* Quantity Analysis Summary - Visible for Manager review OR when quotes exist */}
                {request && (isManagerReview || vendorQuotes.length > 0) && (
                  <div className="mb-4 p-3 bg-muted/40 border border-border/60 rounded-lg flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Requested</span>
                        <span className="font-medium">{request.quantity} {request.unit}</span>
                      </div>
                      <div className="h-8 w-px bg-border/60"></div>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">To Buy</span>
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {quantityToBuy || vendorQuotes[0]?.amount || request.quantity} {request.unit}
                        </span>
                      </div>
                      {((quantityToBuy || vendorQuotes[0]?.amount || 0) > request.quantity) && (
                        <>
                          <div className="h-8 w-px bg-border/60"></div>
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Extra → Inventory</span>
                            <span className="font-bold text-green-600 dark:text-green-400">
                              +{((quantityToBuy || vendorQuotes[0]?.amount || 0) - request.quantity).toFixed(2).replace(/\.00$/, '')} {request.unit}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Empty State / Add First Vendor Button */}
                {vendorQuotes.length === 0 && canEditUI && !isManagerReview && (
                  <button
                    onClick={() => {
                      setQuoteAmount((quantityToBuy || request?.quantity || 0).toString());
                      const bestUnit = itemInInventory?.unit || request?.unit || "";
                      if (bestUnit) setQuoteUnit(bestUnit);
                      setVendorDialogOpen(true);
                    }}
                    className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30 transition-all group cursor-pointer"
                  >
                    <div className="h-10 w-10 bg-muted rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform group-hover:bg-primary/10">
                      <Plus className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <h4 className="font-medium text-foreground group-hover:text-primary">Add Vendor Quote</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      No quotes added yet. Add at least 2 quotes for comparison.
                    </p>
                  </button>
                )}

                {/* Empty State Text for Viewers */}
                {vendorQuotes.length === 0 && (!canEdit || isManagerReview) && (
                  <div className="text-xs text-muted-foreground text-center py-6 border rounded-lg bg-muted/30">
                    <p>No vendor quotes available.</p>
                  </div>
                )}

                {vendorQuotes.length > 0 && (
                  <div className="space-y-4">


                    {/* Quotes Grid */}
                    <div className="grid grid-cols-1 gap-3">
                      {vendorQuotes.map((quote, index) => {
                        // Determine if this is the best price
                        const isBestPrice = index === 0 && vendorQuotes.length > 1 &&
                          (calculateQuoteTotal(vendorQuotes[0], request?.quantity || 0) < calculateQuoteTotal(vendorQuotes[1], request?.quantity || 0) ||
                            (vendorQuotes.every((q, i) => i === 0 || calculateQuoteTotal(q, request?.quantity || 0) >= calculateQuoteTotal(quote, request?.quantity || 0))));

                        const totalAmount = calculateQuoteTotal(quote, request?.quantity || 0);

                        return (
                          <div
                            key={quote.vendorId}
                            className={`relative group bg-card border rounded-lg p-4 transition-all duration-200 ${isManagerReview && (
                              hasMultipleCCs
                                ? activeRequestId && selectedVendorPerItem[activeRequestId] === quote.vendorId
                                : selectedFinalVendor === quote.vendorId
                            )
                              ? "border-primary ring-1 ring-primary shadow-md bg-primary/5"
                              : "hover:border-primary/50 hover:shadow-sm"
                              } ${isBestPrice && !isManagerReview ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10" : ""}`}
                            onClick={isManagerReview ? () => {
                              if (hasMultipleCCs && activeRequestId) {
                                setSelectedVendorPerItem(prev => ({
                                  ...prev,
                                  [activeRequestId]: prev[activeRequestId] === quote.vendorId ? "" as any : quote.vendorId
                                }));
                              } else {
                                setSelectedFinalVendor(prev => prev === quote.vendorId ? "" : quote.vendorId);
                              }
                            } : undefined}
                          >
                            {/* Best Price Badge */}
                            {isBestPrice && (
                              <div className="absolute -top-2.5 right-4 px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-[10px] font-bold uppercase tracking-wide rounded-full border border-green-200 dark:border-green-800 shadow-sm flex items-center gap-1">
                                <span className="text-xs">★</span> Best Price
                              </div>
                            )}

                            {/* Card Content */}
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                {/* Header */}
                                <div className="flex items-center gap-2 mb-2">
                                  {isManagerReview && (() => {
                                    const isCardSelected = hasMultipleCCs
                                      ? (activeRequestId ? selectedVendorPerItem[activeRequestId] === quote.vendorId : false)
                                      : selectedFinalVendor === quote.vendorId;
                                    return (
                                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isCardSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}>
                                        {isCardSelected && <Check className="w-2.5 h-2.5" />}
                                      </div>
                                    );
                                  })()}
                                  <h4 className="font-semibold text-lg truncate text-foreground">{getVendorName(quote.vendorId)}</h4>
                                </div>

                                {/* Details Stack - One item per row */}
                                <div className="space-y-1 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground w-20">Quantity:</span>
                                    <span className="font-medium text-foreground">{quote.amount || 1} {quote.unit || 'units'}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground w-20">Price:</span>
                                    <span className="font-medium">
                                      ₹{(quote.unitPrice * (quote.perUnitBasis || 1)).toFixed(2)} / {quote.perUnitBasis || 1} {quote.unit || 'unit'}
                                    </span>
                                  </div>

                                  {(quote.discountPercent || 0) > 0 && (
                                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                      <span className="w-20">Discount:</span>
                                      <span className="font-medium">-{quote.discountPercent}%</span>
                                    </div>
                                  )}

                                  {(quote.gstPercent || 0) > 0 && (
                                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                                      <span className="w-20">GST:</span>
                                      <span className="font-medium">+{quote.gstPercent}%</span>
                                    </div>
                                  )}

                                  {quote.freight && parseFloat(quote.freight) > 0 && (
                                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                      <span className="w-20">Freight:</span>
                                      <span className="font-medium">+₹{parseFloat(quote.freight).toFixed(2)} <span className="text-muted-foreground font-normal text-[10px] ml-1 uppercase tracking-wider">(Total)</span></span>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-2 pt-1 mt-1 border-t border-dashed border-muted-foreground/30">
                                    <span className="text-muted-foreground w-20 font-medium">Net Price:</span>
                                    <span className="font-semibold text-foreground">
                                      ₹{calculateFinalPrice(quote.unitPrice * (quote.perUnitBasis || 1), quote.discountPercent, quote.gstPercent).toFixed(2)} / {quote.perUnitBasis || 1} {quote.unit || 'unit'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Total & Actions */}
                              <div className="flex flex-col items-end justify-between h-full gap-4">
                                <div className="text-right bg-muted/30 p-2 rounded-lg border border-border/50">
                                  <p className="text-xs text-muted-foreground mb-0.5 font-medium uppercase tracking-wider">Total Amount</p>
                                  <p className="text-xl font-bold tracking-tight text-primary">₹{totalAmount.toFixed(2)}</p>
                                </div>

                                {canEdit && !isManagerReview && (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditQuote(index);
                                      }}
                                      className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                                      title="Edit quote"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveVendor(quote.vendorId);
                                      }}
                                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                      title="Remove quote"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Cost Savings Recommendation */}
                    {vendorQuotes.length >= 2 && (
                      <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg">
                        {(() => {
                          // Sort by final calculated price
                          const sortedQuotes = [...vendorQuotes].sort((a, b) =>
                            calculateQuoteTotal(a, request?.quantity || 0) - calculateQuoteTotal(b, request?.quantity || 0)
                          );
                          const bestQuote = sortedQuotes[0];
                          const nextBestQuote = sortedQuotes[1];
                          const bestVendor = getVendorName(bestQuote.vendorId);
                          const bestTotal = calculateQuoteTotal(bestQuote, request?.quantity || 0);
                          const nextTotal = calculateQuoteTotal(nextBestQuote, request?.quantity || 0);
                          const totalSavings = nextTotal - bestTotal;

                          // If difference is negligible
                          if (totalSavings < 0.01) {
                            return (
                              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span>Best vendors have similar pricing. Choose based on reliability.</span>
                              </div>
                            );
                          }

                          return (
                            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                              <span className="shrink-0 text-lg">💡</span>
                              <span>
                                <span className="font-bold">{bestVendor}</span> is best. Save <span className="font-bold">₹{totalSavings.toFixed(2)}</span>.
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Manager Review Actions (Form view) */}
            {ccViewMode !== "preview" && isManagerReview && (
              <div className="mt-4 pt-4 border-t border-border/60">
                <div className="space-y-4">
                  {/* For merged CC: per-item vendor selectors */}
                  {hasMultipleCCs ? (
                    <div className="space-y-3">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Select Final Vendor Per Item <span className="text-red-500">*</span>
                      </Label>
                      {allCCRequests.map((req, idx) => {
                        const cc = allItemCCs[idx];
                        const quotes = cc?.vendorQuotes ?? [];
                        const rid = ccRequestIds[idx];
                        if (!rid || quotes.length === 0) return null;
                        return (
                          <div key={rid} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/20">
                            <span className="text-xs font-bold text-muted-foreground w-14 shrink-0">Item {idx + 1}</span>
                            <span className="text-xs font-medium truncate flex-1">{req?.itemName}</span>
                            <select
                              className="h-9 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring flex-1 min-w-0"
                              value={selectedVendorPerItem[rid] ?? ""}
                              onChange={(e) => setSelectedVendorPerItem(prev => ({ ...prev, [rid]: e.target.value as Id<"vendors"> }))}
                            >
                              <option value="">-- Choose vendor --</option>
                              {quotes.map((q: any) => (
                                <option key={q.vendorId} value={q.vendorId}>
                                  {getVendorName(q.vendorId)} (₹{calculateQuoteTotal(q, req?.quantity || 0).toFixed(2)})
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Single item: original vendor selector */
                    vendorQuotes.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Select Final Vendor <span className="text-red-500">*</span>
                        </Label>
                        <select
                          className="w-full md:max-w-md h-10 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={selectedFinalVendor}
                          onChange={(e) => setSelectedFinalVendor(e.target.value as Id<"vendors">)}
                        >
                          <option value="">-- Choose winning vendor --</option>
                          {vendorQuotes.map((q) => (
                            <option key={q.vendorId} value={q.vendorId}>
                              {getVendorName(q.vendorId)} (₹{calculateQuoteTotal(q, request?.quantity || 0).toFixed(2)})
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Manager Decision Notes
                      </Label>
                      <span className="text-[10px] text-muted-foreground italic">
                        Required for rejection
                      </span>
                    </div>
                    <Textarea
                      placeholder="Add approval notes or rejection reason..."
                      value={managerNotes}
                      onChange={(e) => setManagerNotes(e.target.value)}
                      className="min-h-[80px] w-full text-sm resize-none bg-muted/20 focus:bg-background transition-all border-muted-foreground/20 focus:border-primary/50"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    {/* Excel + PDF download buttons */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        try {
                          const table = document.getElementById('cc-export-table');
                          if (!table) { toast.error("Open CC Format view first to export"); return; }
                          const clone = table.cloneNode(true) as HTMLElement;
                          clone.querySelectorAll('.no-export').forEach(el => el.remove());
                          const wb = XLSX.utils.table_to_book(clone, { sheet: "Sheet1" });
                          XLSX.writeFile(wb, `Cost_Comparison_${allCCRequests[0]?.requestNumber || 'Export'}.xlsx`);
                          toast.success("Excel downloaded!");
                        } catch (err) { toast.error("Switch to CC Format view first, then download"); }
                      }}
                      className="border-green-600 text-green-700 hover:bg-green-50 font-semibold"
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Excel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const table = document.getElementById('cc-export-table');
                        if (!table) { toast.error("Switch to CC Format view first to export PDF"); return; }
                        try {
                          const canvas = await html2canvas(table, { scale: 2 } as any);
                          const imgData = canvas.toDataURL("image/png");
                          const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [canvas.width * 0.75, canvas.height * 0.75] });
                          pdf.addImage(imgData, "PNG", 0, 0, canvas.width * 0.75, canvas.height * 0.75);
                          pdf.save(`Cost_Comparison_${allCCRequests[0]?.requestNumber || 'Export'}.pdf`);
                          toast.success("PDF downloaded!");
                        } catch (err) { toast.error("Switch to CC Format view first, then download"); }
                      }}
                      className="border-red-500 text-red-600 hover:bg-red-50 font-semibold"
                    >
                      <Printer className="h-3.5 w-3.5 mr-1.5" /> PDF
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        if (!managerNotes.trim()) {
                          toast.error("Please provide a reason for rejection");
                          return;
                        }
                        setIsReviewing(true);
                        try {
                          if (hasMultipleCCs) {
                            for (const rid of ccRequestIds) {
                              if (!rid) continue;
                              await reviewCC({ requestId: rid, action: "reject", notes: managerNotes.trim() });
                            }
                            toast.success("All items rejected");
                          } else {
                            await reviewCC({ requestId: activeRequestId!, action: "reject", notes: managerNotes.trim() });
                            toast.success("Cost comparison rejected");
                          }
                          onOpenChange(false);
                        } catch (error: any) {
                          toast.error(error.message || "Failed to reject");
                        } finally {
                          setIsReviewing(false);
                        }
                      }}
                      disabled={isReviewing}
                      size="sm"
                      className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive border border-transparent hover:border-destructive/20 transition-all font-medium"
                    >
                      <X className="h-4 w-4 mr-1.5" />
                      Reject
                    </Button>
                    <Button
                      onClick={async () => {
                        if (hasMultipleCCs) {
                          const missing = ccRequestIds.filter(rid => rid && !selectedVendorPerItem[rid]);
                          if (missing.length > 0) {
                            toast.error("Please select a vendor for each item");
                            return;
                          }
                          setIsReviewing(true);
                          try {
                            for (const rid of ccRequestIds) {
                              if (!rid) continue;
                              await reviewCC({ requestId: rid, action: "approve", selectedVendorId: selectedVendorPerItem[rid], notes: managerNotes.trim() || undefined });
                            }
                            toast.success("All items approved");
                            onOpenChange(false);
                          } catch (error: any) {
                            toast.error(error.message || "Failed to approve");
                          } finally {
                            setIsReviewing(false);
                          }
                        } else {
                          if (!selectedFinalVendor) {
                            toast.error("Please select a final vendor");
                            return;
                          }
                          setIsReviewing(true);
                          try {
                            await reviewCC({ requestId: activeRequestId!, action: "approve", selectedVendorId: selectedFinalVendor as Id<"vendors">, notes: managerNotes.trim() || undefined });
                            toast.success("Cost comparison approved");
                            onOpenChange(false);
                          } catch (error: any) {
                            toast.error(error.message || "Failed to approve");
                          } finally {
                            setIsReviewing(false);
                          }
                        }
                      }}
                      disabled={isReviewing || (hasMultipleCCs
                        ? ccRequestIds.some(rid => rid && !selectedVendorPerItem[rid])
                        : !selectedFinalVendor)}
                      size="sm"
                      className="flex-[2] bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow transition-all font-medium"
                    >
                      <CheckCircle className="h-4 w-4 mr-1.5" />
                      {hasMultipleCCs ? `Approve All (${ccRequestIds.length} items)` : "Approve & Select Vendor"}
                    </Button>
                  </div>
                </div>
              </div>
            )
            }

            {/* Purchase Officer Actions - Only show vendor workflow when insufficient inventory */}
            {
              ccViewMode !== "preview" && canEdit && !isSubmitted && !isManager && (
                <div className="space-y-2 pt-4 border-t mt-2">
                  {/* Auto-save indicator */}
                  {isSaving && (
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-2">
                      <div className="h-3 w-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      Auto-saving...
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      className="flex-1"
                      size="sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleSave(false)}
                      disabled={isSaving || vendorQuotes.length === 0}
                      size="sm"
                      className="flex-1"
                    >
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                      Save Draft
                    </Button>
                    <Button
                      onClick={() => setShowSubmitConfirm(true)}
                      disabled={isSaving || isSubmitting || (hasMultipleCCs
                        ? allItemCCs.every(cc => (cc?.vendorQuotes?.length ?? 0) === 0)
                        : vendorQuotes.length < 2)}
                      size="sm"
                      className="flex-1"
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      {hasMultipleCCs
                        ? `Submit All (${ccRequestIds.length} items)`
                        : existingCC?.status === "cc_rejected" ? "Resubmit" : "Submit for Approval"}
                    </Button>
                  </div>
                </div>
              )
            }

            {
              ccViewMode !== "preview" && isSubmitted && !isManagerReview && (
                <p className="text-xs text-muted-foreground text-center py-4 border-t mt-2">
                  Submitted for manager approval
                </p>
              )
            }

            {/* Submit button visible in preview mode too */}
            {ccViewMode === "preview" && canEdit && !isSubmitted && !isManager && (
              <div className="pt-3 border-t mt-2 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  size="sm"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => setShowSubmitConfirm(true)}
                  disabled={isSaving || isSubmitting || (hasMultipleCCs
                    ? allItemCCs.every(cc => (cc?.vendorQuotes?.length ?? 0) === 0)
                    : vendorQuotes.length < 2)}
                  size="sm"
                  className="flex-[2]"
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {hasMultipleCCs
                    ? `Submit All (${ccRequestIds.length} items)`
                    : existingCC?.status === "cc_rejected" ? "Resubmit" : "Submit for Approval"}
                </Button>
              </div>
            )}

            {/* Removed duplicate manager review actions */}

            {ccViewMode === "preview" && isSubmitted && !isManagerReview && (
              <p className="text-xs text-muted-foreground text-center py-3 border-t mt-2">
                Submitted for manager approval
              </p>
            )}

          </div></DialogContent>
      </Dialog>

      {/* Simplified Vendor Selection Dialog */}
      <Dialog open={vendorDialogOpen} onOpenChange={(open) => {
        if (canEdit) {
          setVendorDialogOpen(open);
          // Reset form when closing
          if (!open) {
            setSelectedVendorId("");
            setUnitPrice("");
            setQuoteAmount("1");
            const defaultUnit = request?.unit || itemInInventory?.unit || "";
            setQuoteUnit(defaultUnit);
            setPerUnitBasis("1");

            setShowVendorDetails(null);
            setShowCreateVendorDialog(false);
            setVendorSearchTerm("");
            setShowVendorDropdown(false);
            setSelectedVendorIndex(-1);
            setShowUnitSuggestions(false);
            setSelectedUnitIndex(-1);
          }
        }
      }}>
        <DialogContent className="sm:max-w-2xl md:max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQuoteIndex >= 0 ? 'Edit Vendor Quote' : 'Add Vendor Quote'}</DialogTitle>

          </DialogHeader>

          {/* Auto-fill quote amount from quantityToBuy when adding new quote */}
          {useEffect(() => {
            if (vendorDialogOpen && editingQuoteIndex === -1) {
              setQuoteAmount(quantityToBuy.toString());
              // Also ensure unit is synced with current preference
              const bestUnit = itemInInventory?.unit || request?.unit || "";
              if (bestUnit) setQuoteUnit(bestUnit);
            }
          }, [vendorDialogOpen, editingQuoteIndex, quantityToBuy, itemInInventory, request]) as unknown as React.ReactNode}

          <div className="space-y-3">
            {/* Vendor Selection Row */}
            <div className="space-y-1">
              <Label className="text-sm font-medium">Vendor<span className="text-red-500">*</span></Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Search and select vendor..."
                      value={vendorSearchTerm}
                      onChange={(e) => {
                        setVendorSearchTerm(e.target.value);
                        setShowVendorDropdown(true);
                      }}
                      onKeyDown={(e) => {
                        const suggestions = vendorSearchTerm.trim() ? [
                          ...filteredVendors,
                          { _id: 'create', companyName: `Create "${vendorSearchTerm}" as new vendor` }
                        ] : filteredVendors;

                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSelectedVendorIndex(prev =>
                            prev < suggestions.length - 1 ? prev + 1 : prev
                          );
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSelectedVendorIndex(prev => prev > 0 ? prev - 1 : -1);
                        } else if (e.key === 'Enter' && selectedVendorIndex >= 0) {
                          e.preventDefault();
                          const selected = suggestions[selectedVendorIndex];
                          if (selected._id === 'create') {
                            setShowCreateVendorDialog(true);
                            setShowVendorDropdown(false);
                          } else {
                            setSelectedVendorId(selected._id as Id<"vendors">);
                            setVendorSearchTerm(selected.companyName);
                            // Auto-fill contact if blank
                            if (!quoteContact && (selected as any).phone) {
                              setQuoteContact((selected as any).phone);
                            }
                            setShowVendorDropdown(false);
                          }
                          setSelectedVendorIndex(-1);
                        } else if (e.key === 'Escape') {
                          setShowVendorDropdown(false);
                          setSelectedVendorIndex(-1);
                        }
                      }}
                      className="text-sm pr-9"
                      onFocus={() => setShowVendorDropdown(true)}
                      onBlur={() => setTimeout(() => setShowVendorDropdown(false), 200)}
                      required
                      autoFocus={editingQuoteIndex === -1}
                    />
                    {vendorSearchTerm && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setVendorSearchTerm("");
                          setSelectedVendorId("");
                        }}
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent text-muted-foreground hover:text-foreground"
                        title="Clear vendor selection"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {showVendorDropdown && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {/* Suggested vendors from inventory item — shown when no search term */}
                      {!vendorSearchTerm.trim() && suggestedVendors.length > 0 && (
                        <>
                          <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/50 border-b border-border">
                            Linked to this item
                          </div>
                          {suggestedVendors.map((vendor, index) => (
                            <div
                              key={vendor._id}
                              onClick={() => {
                                setSelectedVendorId(vendor._id);
                                setVendorSearchTerm(vendor.companyName);
                                if (!quoteContact && vendor.phone) setQuoteContact(vendor.phone);
                                setShowVendorDropdown(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors flex items-center justify-between cursor-pointer"
                            >
                              <span className="font-medium text-violet-700 dark:text-violet-300">{vendor.companyName}</span>
                              <span className="text-[10px] text-violet-500 bg-violet-100 dark:bg-violet-900/30 px-1.5 py-0.5 rounded">linked</span>
                            </div>
                          ))}
                          {otherVendors.length > 0 && (
                            <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/50 border-y border-border">
                              All vendors
                            </div>
                          )}
                        </>
                      )}
                      {filteredVendors.length > 0 ? (
                        filteredVendors.map((vendor, index) => (
                          <div
                            key={vendor._id}
                            onClick={() => {
                              setSelectedVendorId(vendor._id);
                              setVendorSearchTerm(vendor.companyName);
                              // Auto-fill contact from vendor phone if not already set
                              if (!quoteContact && vendor.phone) {
                                setQuoteContact(vendor.phone);
                              }
                              setShowVendorDropdown(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between cursor-pointer ${index === selectedVendorIndex ? 'bg-muted' : ''
                              }`}
                          >
                            <span>{vendor.companyName}</span>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowVendorDetails(vendor._id);
                              }}
                              className="opacity-60 hover:opacity-100 p-1 rounded"
                            >
                              <Info className="h-3 w-3" />
                            </div>
                          </div>
                        ))
                      ) : vendorSearchTerm.trim() ? (
                        <div
                          onClick={() => {
                            setShowCreateVendorDialog(true);
                            setShowVendorDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors cursor-pointer ${filteredVendors.length === selectedVendorIndex ? 'bg-blue-50 dark:bg-blue-950/50' : ''
                            }`}
                        >
                          <Plus className="h-3 w-3 inline mr-1" />
                          Create &quot;{vendorSearchTerm}&quot; as new vendor
                        </div>
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No vendors available
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowCreateVendorDialog(true)}
                  className="h-9 w-9 shrink-0"
                  title="Add new vendor"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Three-column form on desktop: Price/Qty/Unit | Discount/GST | Live Total */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
            {/* COL 1: Price / Qty / Unit */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Price (₹/unit) <span className="text-red-500">*</span></Label>
                <Input
                  type="number" step="0.01" min="0" value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="0.00"
                  className="text-sm font-semibold border-2 hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                  required autoFocus={editingQuoteIndex >= 0}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium">Total Quantity <span className="text-red-500">*</span></Label>
                <Input
                  type="number" min="0" step="any" value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                  placeholder="Qty"
                  className="text-sm border-2 hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium">Unit <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    type="text" value={quoteUnit}
                    onChange={(e) => handleQuoteUnitInputChange(e.target.value)}
                    onKeyDown={handleQuoteUnitKeyDown}
                    onFocus={handleQuoteUnitFocus}
                    onBlur={handleQuoteUnitBlur}
                    placeholder="e.g. kg" autoComplete="off"
                    className="text-sm border-2 hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                    required
                  />
                  {showUnitSuggestions && (
                    <div className="absolute top-full left-0 right-0 z-[100] mt-1 bg-popover text-popover-foreground shadow-xl rounded-md border ring-1 ring-border/50 max-h-[200px] overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-100">
                      {getFilteredUnitSuggestionsForQuote(quoteUnit).length > 0 ? (
                        <div className="p-1">
                          {getFilteredUnitSuggestionsForQuote(quoteUnit).map((suggestion, index) => (
                            <div key={suggestion}
                              onMouseDown={(e) => { e.preventDefault(); handleQuoteUnitSuggestionClick(suggestion); }}
                              className={`px-3 py-2 text-sm rounded-sm cursor-pointer transition-colors flex items-center justify-between ${selectedUnitIndex === index ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted/80 text-foreground/80"
                                }`}
                            >
                              <span>{suggestion}</span>
                              {selectedUnitIndex === index && <Check className="h-3.5 w-3.5 opacity-70" />}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 text-xs text-muted-foreground text-center italic">Use &quot;{quoteUnit}&quot; as custom unit</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* COL 2: Discount / GST */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Discount %</Label>
                <Input type="number" step="0.01" min="0" max="100" value={quoteDiscount} onChange={(e) => setQuoteDiscount(e.target.value)} placeholder="0" className="text-sm border-2 hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox
                    id="gst-toggle"
                    checked={parseFloat(quoteCgst || "0") === 9 && parseFloat(quoteSgst || "0") === 9}
                    onCheckedChange={(checked) => { if (checked) { setQuoteCgst("9"); setQuoteSgst("9"); } else { setQuoteCgst("0"); setQuoteSgst("0"); } }}
                  />
                  <Label htmlFor="gst-toggle" className="text-xs font-medium cursor-pointer">Auto Apply 18% GST</Label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">CGST %</Label>
                    <Input type="number" step="0.01" min="0" value={quoteCgst} onChange={(e) => setQuoteCgst(e.target.value)} placeholder="0" className="text-sm h-9 border-2 hover:border-primary/30 focus:border-primary transition-all duration-200" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">SGST %</Label>
                    <Input type="number" step="0.01" min="0" value={quoteSgst} onChange={(e) => setQuoteSgst(e.target.value)} placeholder="0" className="text-sm h-9 border-2 hover:border-primary/30 focus:border-primary transition-all duration-200" />
                  </div>
                </div>
              </div>
            </div>

            {/* COL 3: Live Total */}
            <div className="space-y-3">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2 h-full">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Live Total</p>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Price/unit:</span>
                  <span className="font-medium text-foreground">₹{(parseFloat(unitPrice || "0") / parseFloat(perUnitBasis || "1")).toFixed(2)}</span>
                </div>
                {parseFloat(quoteDiscount || "0") > 0 && (
                  <div className="flex justify-between text-xs text-green-600">
                    <span>After Disc.:</span>
                    <span>₹{calculatePriceAfterDiscount(parseFloat(unitPrice || "0") / parseFloat(perUnitBasis || "1"), parseFloat(quoteDiscount || "0")).toFixed(2)}</span>
                  </div>
                )}
                {(parseFloat(quoteCgst || "0") + parseFloat(quoteSgst || "0")) > 0 && (
                  <div className="flex justify-between text-xs text-amber-600">
                    <span>GST ({parseFloat(quoteCgst || "0") + parseFloat(quoteSgst || "0")}%):</span>
                    <span>+₹{calculateGstAmount(calculatePriceAfterDiscount(parseFloat(unitPrice || "0") / parseFloat(perUnitBasis || "1"), parseFloat(quoteDiscount || "0")), parseFloat(quoteCgst || "0") + parseFloat(quoteSgst || "0")).toFixed(2)}</span>
                  </div>
                )}
                {parseFloat(quoteFreight || "0") > 0 && (
                  <div className="flex justify-between text-xs text-blue-600">
                    <span>Freight:</span>
                    <span>+₹{parseFloat(quoteFreight || "0").toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-primary/20 flex justify-between items-center">
                  <span className="text-xs font-semibold">Total ({quoteAmount || "0"} {quoteUnit || "unit"}):</span>
                  <span className="text-lg font-bold text-primary">₹{((calculateFinalPrice(parseFloat(unitPrice || "0") / parseFloat(perUnitBasis || "1"), parseFloat(quoteDiscount || "0"), parseFloat(quoteCgst || "0") + parseFloat(quoteSgst || "0")) * (parseFloat(quoteAmount) || 0)) + (parseFloat(quoteFreight || "0") || 0)).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>


          {/* Extra Quote Fields — Additional Details */}
          <div className="mt-4 pt-4 border-t border-border/60">
            <h4 className="flex items-center gap-2 w-full text-left mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Additional Details
                <span className="font-normal normal-case ml-1">(optional)</span>
              </span>
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Contact</Label>
                <Input type="text" value={quoteContact} onChange={(e) => setQuoteContact(e.target.value)} placeholder="Phone / email" className="text-sm h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Reference</Label>
                <Input type="text" value={quoteReference} onChange={(e) => setQuoteReference(e.target.value)} placeholder="Quote ref. no." className="text-sm h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Date</Label>
                <div className="relative flex items-center">
                  <Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} className="text-sm h-9 pr-9" />
                  {quoteDate && (
                    <button
                      type="button"
                      onClick={() => setQuoteDate("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      title="Clear date"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Freight (₹)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none">₹</span>
                  <Input type="number" min="0" step="0.01" value={quoteFreight} onChange={(e) => setQuoteFreight(e.target.value)} placeholder="0.00" className="text-sm h-9 pl-7" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Delivery Period</Label>
                <Input type="text" value={quoteDeliveryPeriod} onChange={(e) => setQuoteDeliveryPeriod(e.target.value)} placeholder="e.g. 7 days" className="text-sm h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Payment Terms</Label>
                <Input type="text" value={quotePaymentTerms} onChange={(e) => setQuotePaymentTerms(e.target.value)} placeholder="e.g. 30 days credit" className="text-sm h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Specification / Model No</Label>
                <Input type="text" value={quoteSpecification} onChange={(e) => setQuoteSpecification(e.target.value)} placeholder={request?.specsBrand || (itemInInventory as any)?.specification || "e.g. Brand / Model No"} className="text-sm h-9" />
              </div>
              <div className="col-span-2 md:col-span-2 space-y-1">
                <Label className="text-xs font-medium">Past Performance</Label>
                <Input type="text" value={quotePastPerformance} onChange={(e) => setQuotePastPerformance(e.target.value)} placeholder="e.g. Good / Reliable / On-time delivery" className="text-sm h-9" />
              </div>
            </div>
          </div>




          {/* Action buttons */}
          <div className="flex justify-between items-center gap-2 pt-4 border-t mt-4">
            <div className="text-sm text-muted-foreground">
              {unitPrice && quoteAmount ? (
                <span>Est. Total: <strong className="text-foreground text-base">₹{((calculateFinalPrice(parseFloat(unitPrice || "0") / parseFloat(perUnitBasis || "1"), parseFloat(quoteDiscount || "0"), parseFloat(quoteCgst || "0") + parseFloat(quoteSgst || "0")) * (parseFloat(quoteAmount) || 0)) + (parseFloat(quoteFreight || "0") || 0)).toFixed(2)}</strong></span>
              ) : <span className="text-xs italic">Fill price &amp; qty to see total</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => {
                setVendorDialogOpen(false);
                setEditingQuoteIndex(-1);
                setSelectedVendorId("");
                setUnitPrice("");
                setQuoteAmount("1");
                setQuoteUnit("");
                setQuoteDiscount("");
                setQuoteCgst("9");
                setQuoteSgst("9");
                setQuoteContact("");
                setQuoteReference("");
                setQuoteDate(new Date().toISOString().slice(0, 10));
                setQuoteDeliveryPeriod("");
                setQuotePaymentTerms("");
                setQuotePastPerformance("");
                setQuoteFreight("");
                setQuoteSpecification("");
                setVendorSearchTerm("");
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleAddVendor}
                disabled={!selectedVendorId || !unitPrice}
              >
                {editingQuoteIndex >= 0 ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Update Quote
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Quote
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Vendor Dialog */}
      <Dialog open={showCreateVendorDialog} onOpenChange={setShowCreateVendorDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Vendor</DialogTitle>
            <DialogDescription>
              Add a new vendor for this quote.
            </DialogDescription>
          </DialogHeader>

          <VendorCreationForm
            onVendorCreated={(vendorId) => {
              const newVendor = vendors?.find(v => v._id === vendorId);
              if (newVendor) {
                setSelectedVendorId(vendorId);
                setVendorSearchTerm(newVendor.companyName);
                setShowCreateVendorDialog(false);
                toast.success("Vendor created! You can now add the quote details.");
              }
            }}
            onCancel={() => setShowCreateVendorDialog(false)}
            itemName={request?.itemName}
            initialCompanyName={vendorSearchTerm}
          />
        </DialogContent>
      </Dialog >

      {/* Inventory Information Dialog */}
      < Dialog open={inventoryInfoOpen} onOpenChange={setInventoryInfoOpen} >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Inventory Information
            </DialogTitle>
            <DialogDescription>
              Details for &quot;{request?.itemName}&quot;
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {itemInInventory ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-medium">Item exists in inventory</span>
                </div>

                <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Central Stock:</span>
                      <p className="font-medium">{itemInInventory.centralStock || 0} {itemInInventory.unit || 'units'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Unit:</span>
                      <p className="font-medium">{itemInInventory.unit || 'Not specified'}</p>
                    </div>
                  </div>

                  {itemInInventory.vendorIds && itemInInventory.vendorIds.length > 0 && (
                    <div>
                      <span className="text-muted-foreground text-sm">Associated Vendors:</span>
                      <div className="mt-1 space-y-1">
                        {itemInInventory.vendorIds.map((vendorId) => {
                          const vendor = vendors?.find(v => v._id === vendorId);
                          return vendor ? (
                            <div key={vendorId} className="flex items-center gap-2 text-sm">
                              <Building className="h-3 w-3 text-muted-foreground" />
                              <span>{vendor.companyName}</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}

                  {itemInInventory.images && itemInInventory.images.length > 0 && (
                    <div>
                      <span className="text-muted-foreground text-sm">Images:</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {itemInInventory.images.slice(0, 4).map((image, index) => (
                          <div key={image.imageKey} className="relative group">
                            <button
                              type="button"
                              onClick={() => openImageSlider(itemInInventory.images || [], request?.itemName || 'Item', index)}
                              className="block"
                            >
                              <LazyImage
                                src={image.imageUrl}
                                alt={`Image ${index + 1}`}
                                width={60}
                                height={45}
                                className="rounded border hover:border-primary transition-colors object-cover"
                              />
                            </button>
                            {index === 3 && itemInInventory.images && itemInInventory.images.length > 4 && (
                              <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
                                <span className="text-white text-xs font-medium">
                                  +{itemInInventory.images.length - 4}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {itemInInventory.images.length} image{itemInInventory.images.length !== 1 ? 's' : ''} • Click to view
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="text-sm">
                    <p className="font-medium text-blue-700 dark:text-blue-300">Stock Status</p>
                    <p className="text-blue-600 dark:text-blue-400">
                      {(itemInInventory.centralStock || 0) >= (request?.quantity || 0)
                        ? 'Sufficient stock available'
                        : 'Insufficient stock - may need to reorder'
                      }
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {(itemInInventory.centralStock || 0)} / {request?.quantity || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Available / Required</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Item not found in inventory</span>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-3">
                    This item is not currently in your inventory system.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You may want to add this item to inventory or check if it exists under a different name.
                  </p>
                </div>

                <Button
                  onClick={() => {
                    // Navigate to inventory page
                    window.location.href = '/dashboard/inventory';
                  }}
                  className="w-full"
                  variant="outline"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Check Inventory
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInventoryInfoOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >



      {/* Image Slider */}
      < ImageSlider
        images={imageSliderImages}
        initialIndex={imageSliderInitialIndex}
        open={imageSliderOpen}
        onOpenChange={setImageSliderOpen}
        itemName={imageSliderItemName}
      />

      {/* Direct Delivery Confirmation Dialog */}
      < AlertDialog open={showDirectDeliveryConfirm} onOpenChange={setShowDirectDeliveryConfirm} >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-green-600" />
              Confirm Direct Delivery from Inventory
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will deduct stock from inventory and {hasSufficientInventory || quantityFromVendor === 0 ? 'move to delivery stage' : 'prepare for vendor orders'}.</p>

                <div className="bg-green-50 dark:bg-green-950/30 p-3 rounded-lg border border-green-200 dark:border-green-800 space-y-2">
                  <p className="font-semibold text-green-700 dark:text-green-300">{request?.itemName}</p>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-white dark:bg-gray-900 p-2 rounded">
                      <span className="text-muted-foreground block text-xs">Deducting from Inventory</span>
                      <span className="font-bold text-green-600 text-lg">
                        {hasSufficientInventory ? (request?.quantity || 0) : quantityFromInventory}
                      </span>
                      <span className="text-muted-foreground ml-1">{request?.unit || 'units'}</span>
                    </div>
                    <div className="bg-white dark:bg-gray-900 p-2 rounded">
                      <span className="text-muted-foreground block text-xs">Stock After Deduction</span>
                      <span className="font-bold text-blue-600 text-lg">
                        {Math.max(0, (itemInInventory?.centralStock || 0) - (hasSufficientInventory ? (request?.quantity || 0) : quantityFromInventory))}
                      </span>
                      <span className="text-muted-foreground ml-1">{itemInInventory?.unit || 'units'}</span>
                    </div>
                  </div>

                  {!hasSufficientInventory && quantityFromVendor > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 p-2 rounded border border-amber-200 dark:border-amber-800">
                      <span className="text-amber-700 dark:text-amber-300 text-xs font-medium">
                        ⚠ Remaining {quantityFromVendor} {request?.unit || 'units'} will need vendor quotes
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">
                  {hasSufficientInventory || quantityFromVendor === 0
                    ? 'The request will move directly to delivery stage. No vendor comparison needed.'
                    : 'After this, please add vendor quotes for the remaining quantity.'}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreatingDirectPO}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDirectDelivery}
              disabled={isCreatingDirectPO}
              className="bg-green-600 hover:bg-green-700"
            >
              {isCreatingDirectPO ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <Package className="h-4 w-4 mr-2" />
                  Confirm Delivery ({hasSufficientInventory ? (request?.quantity || 0) : quantityFromInventory} {request?.unit || 'units'})
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog >

      {/* Vendor Details Dialog */}
      < Dialog open={!!showVendorDetails
      } onOpenChange={() => setShowVendorDetails(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="h-5 w-5 text-blue-600" />
              Vendor Details
            </DialogTitle>
          </DialogHeader>

          {showVendorDetails && (() => {
            const vendor = vendors?.find(v => v._id === showVendorDetails);
            if (!vendor) return null;

            return (
              <div className="space-y-4">
                <div className="text-center pb-4 border-b">
                  <h3 className="font-semibold text-lg">{vendor.companyName}</h3>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-sm text-muted-foreground">{vendor.email}</p>
                    </div>
                  </div>

                  {vendor.phone && (
                    <div className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-sm font-medium">Phone</p>
                        <p className="text-sm text-muted-foreground">{vendor.phone}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <Hash className="h-4 w-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-sm font-medium">GST Number</p>
                      <p className="text-sm text-muted-foreground">{vendor.gstNumber}</p>
                    </div>
                  </div>

                  {vendor.address && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-sm font-medium">Address</p>
                        <p className="text-sm text-muted-foreground">{vendor.address}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVendorDetails(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* ── Submit Confirmation Dialog ── */}
      < Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm} >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              {existingCC?.status === "cc_rejected" ? "Resubmit Cost Comparison" : "Submit for Approval"}
            </DialogTitle>
            <DialogDescription>
              {existingCC?.status === "cc_rejected"
                ? "Are you sure you want to resubmit this cost comparison for manager review?"
                : "Are you sure you want to submit this cost comparison for manager approval? You won\'t be able to edit it until the manager reviews it."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setShowSubmitConfirm(false)}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setShowSubmitConfirm(false);
                await handleSubmit();
              }}
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting...</span>
              ) : (
                <span className="flex items-center gap-1.5"><Send className="h-3.5 w-3.5" />{existingCC?.status === "cc_rejected" ? "Resubmit" : "Confirm Submit"}</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >
    </>
  );
}

