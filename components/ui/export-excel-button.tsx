"use client";

/**
 * Export Excel Button
 *
 * Reusable download button styled to match the existing "Download XL" button
 * in the Pending PO section. Drop-in component for any page.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ExportExcelButtonProps {
  /** Called when the button is clicked. Must handle the actual export logic. */
  onExport: () => Promise<number | void>;
  /** Label displayed on the button */
  label?: string;
  /** Toast message after success. Use {count} as placeholder for row count */
  successMessage?: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  /** Tooltip title */
  title?: string;
}

export function ExportExcelButton({
  onExport,
  label = "Download XL",
  successMessage = "Downloaded {count} row(s) as Excel",
  className,
  size = "default",
  title = "Download data as Excel spreadsheet",
}: ExportExcelButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleClick = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const count = await onExport();
      const msg = successMessage.replace("{count}", String(count ?? 0));
      toast.success(msg);
    } catch (err: any) {
      console.error("Excel export failed:", err);
      toast.error("Failed to download Excel");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size={size}
      onClick={handleClick}
      disabled={isExporting}
      className={cn(
        "gap-1.5 border-emerald-500/50 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-500",
        "dark:text-emerald-400 dark:border-emerald-500/40 dark:hover:bg-emerald-900/20",
        "transition-all duration-200",
        className
      )}
      title={title}
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
