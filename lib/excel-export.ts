/**
 * Excel Export Utility
 *
 * Centralized helper using ExcelJS to produce professionally styled .xlsx files.
 * Features:
 *  - Themed header rows (gradient brand colors, white bold text)
 *  - Auto-filters on every column
 *  - Auto-sized columns based on content
 *  - Alternating row stripes for readability
 *  - Frozen header row
 *  - Optional per-cell background color overrides (for CC-style coloring)
 */

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

/* ─────────── Theme Palette ─────────── */
export const EXCEL_THEME = {
  // Primary header — matches the app's orange-red gradient
  headerFill: "E8562A",          // warm brand orange
  headerFont: "FFFFFF",          // white
  headerBorder: "C04A23",

  // Alternating row stripes
  stripeFill: "FFF7F2",          // very light warm tint
  stripeAltFill: "FFFFFF",       // white

  // Status colors (used for CC / task coloring)
  colors: {
    green:   { bg: "DCFCE7", font: "166534" },
    red:     { bg: "FEE2E2", font: "991B1B" },
    amber:   { bg: "FEF3C7", font: "92400E" },
    blue:    { bg: "DBEAFE", font: "1E40AF" },
    purple:  { bg: "EDE9FE", font: "5B21B6" },
    orange:  { bg: "FFEDD5", font: "9A3412" },
    emerald: { bg: "D1FAE5", font: "065F46" },
    indigo:  { bg: "E0E7FF", font: "3730A3" },
    teal:    { bg: "CCFBF1", font: "134E4A" },
    gray:    { bg: "F3F4F6", font: "374151" },
    rose:    { bg: "FFE4E6", font: "9F1239" },
    sky:     { bg: "E0F2FE", font: "075985" },
  } as Record<string, { bg: string; font: string }>,
} as const;

/* ─────────── Column Definition ─────────── */
export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;           // fixed width override
  /** "number" | "currency" | "date" | "text" (default "text") */
  type?: "number" | "currency" | "date" | "text";
}

/* ─────────── Cell Color Override ─────────── */
export interface CellColorOverride {
  row: number;    // 1-indexed data row (header = row 1, first data = row 2)
  col: number;    // 1-indexed column
  bgColor: string; // ARGB hex without #
  fontColor?: string;
}

/* ─────────── Main Export Function ─────────── */
export async function exportToExcel({
  fileName,
  sheetName,
  columns,
  data,
  cellColors,
  chartImageBase64,
}: {
  fileName: string;
  sheetName: string;
  columns: ExcelColumn[];
  data: Record<string, any>[];
  cellColors?: CellColorOverride[];
  /** Optional Base64 PNG to embed as a chart image */
  chartImageBase64?: string;
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Notion ERP";
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  /* ── Columns ── */
  ws.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? Math.max(col.header.length + 4, 14),
  }));

  /* ── Header Row Styling ── */
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: EXCEL_THEME.headerFill },
    };
    cell.font = {
      bold: true,
      color: { argb: EXCEL_THEME.headerFont },
      size: 11,
      name: "Calibri",
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: { argb: EXCEL_THEME.headerBorder } },
    };
  });

  /* ── Data Rows ── */
  data.forEach((row, idx) => {
    const excelRow = ws.addRow(row);
    const isStripe = idx % 2 === 0;

    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      // Alternating fill
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isStripe ? EXCEL_THEME.stripeFill : EXCEL_THEME.stripeAltFill },
      };
      cell.font = { size: 10, name: "Calibri", color: { argb: "333333" } };
      cell.alignment = { vertical: "middle", wrapText: false };

      // Type-based formatting
      const colDef = columns[colNumber - 1];
      if (colDef?.type === "currency") {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { ...cell.alignment, horizontal: "right" };
      } else if (colDef?.type === "number") {
        cell.numFmt = '#,##0';
        cell.alignment = { ...cell.alignment, horizontal: "right" };
      } else if (colDef?.type === "date") {
        cell.alignment = { ...cell.alignment, horizontal: "center" };
      }

      // Light border
      cell.border = {
        bottom: { style: "thin", color: { argb: "E5E7EB" } },
        right: { style: "thin", color: { argb: "E5E7EB" } },
      };
    });
  });

  /* ── Cell Color Overrides (e.g., CC colors) ── */
  if (cellColors) {
    cellColors.forEach(({ row, col, bgColor, fontColor }) => {
      const cell = ws.getCell(row, col);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bgColor },
      };
      if (fontColor) {
        cell.font = { ...cell.font, color: { argb: fontColor } };
      }
    });
  }

  /* ── Auto-Filters ── */
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: data.length + 1, column: columns.length },
  };

  /* ── Auto-size columns based on content ── */
  columns.forEach((col, colIndex) => {
    if (col.width) return; // skip if manually set
    let maxLen = col.header.length;
    data.forEach((row) => {
      const val = row[col.key];
      const len = val != null ? String(val).length : 0;
      if (len > maxLen) maxLen = len;
    });
    const colObj = ws.getColumn(colIndex + 1);
    colObj.width = Math.min(Math.max(maxLen + 3, 12), 50);
  });

  /* ── Chart Image (if provided) ── */
  if (chartImageBase64) {
    const chartSheet = wb.addWorksheet("Chart");
    const imageId = wb.addImage({
      base64: chartImageBase64,
      extension: "png",
    });
    chartSheet.addImage(imageId, {
      tl: { col: 0.5, row: 0.5 },
      ext: { width: 800, height: 400 },
    });
  }

  /* ── Download ── */
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const today = new Date();
  const dateStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
  saveAs(blob, `${fileName}_${dateStr}.xlsx`);

  return data.length;
}

/* ─────────── Helper: Format Date ─────────── */
export function fmtExcelDate(ts: number | undefined | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

/* ─────────── Helper: Format Currency ─────────── */
export function fmtExcelCurrency(amount: number | undefined | null): number {
  return amount || 0;
}
