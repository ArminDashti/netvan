import type { AppTheme } from "@/lib/api";

export function applyTheme(theme: AppTheme | string | null | undefined) {
  const id = theme || "midnight";
  document.documentElement.setAttribute("data-theme", id);
}
