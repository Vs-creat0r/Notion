"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";

function fmtDate(ts: number | undefined | null): string {
    if (!ts) return "—";
    return format(new Date(ts), "dd MMM yy");
}

export function EditableTalk({
    dateValue,
    textValue,
    onDateChange,
    onTextChange,
    dateLabel = "Set date",
}: {
    dateValue: number | undefined | null;
    textValue: string | undefined | null;
    onDateChange: (ts: number | null) => void;
    onTextChange: (text: string) => void;
    dateLabel?: string;
}) {
    const dateStr = dateValue ? new Date(dateValue).toISOString().split("T")[0] : "";
    const [localText, setLocalText] = useState(textValue || "");
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        setLocalText(textValue || "");
    }, [textValue]);

    return (
        <div className="flex flex-col gap-1.5 w-full">
            <div className="flex items-center gap-1.5 mb-0.5">
                <label className="group relative inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <CalendarIcon className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    <span className={cn("text-[11px] font-medium transition-colors group-hover:text-primary", dateValue ? "text-foreground" : "text-muted-foreground italic")}>
                        {dateValue ? fmtDate(dateValue) : dateLabel}
                    </span>
                    <input
                        type="date"
                        value={dateStr}
                        onChange={(e) => {
                            if (e.target.value) {
                                onDateChange(new Date(e.target.value).getTime());
                            } else {
                                onDateChange(null);
                            }
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                </label>
                {dateValue && (
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDateChange(null); }}
                        className="text-muted-foreground hover:text-red-500 rounded p-0.5 z-10"
                        title="Clear date"
                    >
                        <X className="h-3 w-3" />
                    </button>
                )}
            </div>
            <div className="flex items-start w-full mt-1">
                {isEditing ? (
                    <textarea
                        autoFocus
                        value={localText}
                        onChange={(e) => setLocalText(e.target.value)}
                        onBlur={() => {
                            setIsEditing(false);
                            if (localText !== (textValue || "")) onTextChange(localText);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                setIsEditing(false);
                                if (localText !== (textValue || "")) onTextChange(localText);
                            }
                        }}
                        className="min-h-[60px] text-[11px] px-2 py-1.5 w-full rounded-md border border-input bg-background shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                        placeholder="Write notes here..."
                    />
                ) : (
                    <div
                        onClick={() => setIsEditing(true)}
                        className={cn("text-[11px] cursor-text min-h-[24px] w-full rounded px-1.5 py-0.5 border border-transparent hover:border-border hover:bg-muted/50 transition-colors empty:before:content-['Write_anything...'] empty:before:text-muted-foreground/50 line-clamp-2", !localText && "italic")}
                    >
                        {localText}
                    </div>
                )}
            </div>
        </div>
    );
}
