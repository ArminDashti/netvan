import { type HistoryRange } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const RANGES: { id: HistoryRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Week" },
  { id: "months", label: "Months" },
  { id: "custom", label: "Custom" },
];

export function HistoryFilter({
  value,
  onChange,
  customStart,
  customEnd,
  onCustomStart,
  onCustomEnd,
}: {
  value: HistoryRange;
  onChange: (v: HistoryRange) => void;
  customStart?: string;
  customEnd?: string;
  onCustomStart?: (v: string) => void;
  onCustomEnd?: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGES.map((r) => (
        <Button
          key={r.id}
          size="sm"
          variant={value === r.id ? "default" : "outline"}
          onClick={() => onChange(r.id)}
          className={cn(value === r.id && "shadow")}
        >
          {r.label}
        </Button>
      ))}
      {value === "custom" && (
        <>
          <Input
            type="datetime-local"
            className="w-auto"
            value={customStart ?? ""}
            onChange={(e) => onCustomStart?.(e.target.value)}
          />
          <span className="text-[var(--color-muted-foreground)] text-sm">to</span>
          <Input
            type="datetime-local"
            className="w-auto"
            value={customEnd ?? ""}
            onChange={(e) => onCustomEnd?.(e.target.value)}
          />
        </>
      )}
    </div>
  );
}

export function customToTs(local: string): number | null {
  if (!local) return null;
  const t = new Date(local).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}
