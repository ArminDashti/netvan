/**
 * Runtime detection: browser PWA vs Electron desktop wrapper.
 *
 * The React app itself is unchanged — this module just tells it where to
 * find netvan-api and whether the desktop bridge (`window.netvan`) is
 * available so Settings can use native helpers.
 */

export type Runtime = "browser" | "electron";

export function isElectronRuntime(): boolean {
  if (typeof navigator === "undefined") return false;
  return /electron/i.test(navigator.userAgent || "");
}

export function runtime(): Runtime {
  return isElectronRuntime() ? "electron" : "browser";
}