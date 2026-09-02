import { countryToIso2 } from "@/lib/ipInfo";
import { cn } from "@/lib/utils";

type Props = {
  country: string | null | undefined;
  className?: string;
  /** Shown when country is missing. */
  empty?: string;
};

export function CountryBadge({ country, className, empty = "—" }: Props) {
  if (!country?.trim()) {
    return <span className={cn("text-[var(--color-muted-foreground)]", className)}>{empty}</span>;
  }

  const name = country.trim();
  const cc = countryToIso2(name);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      {cc && (
        <span
          className={cn("fi", `fi-${cc}`, "shrink-0 text-[11px]")}
          title={name}
          aria-hidden
        />
      )}
      <span>{name}</span>
    </span>
  );
}
