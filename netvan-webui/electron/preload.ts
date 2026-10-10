/**
 * Netvan Electron preload (contextIsolation-safe bridge).
 *
 * Exposes a minimal `window.netvan` API to the renderer so the existing
 * PWA code can call into Electron without changing the HTTP/WebSocket
 * client code in src/lib/api.ts.
 *
 * The API URL is resolved synchronously here (argv/env) so the renderer can
 * read it at module-init time without awaiting an IPC round-trip.
 */

import { contextBridge, ipcRenderer } from "electron";

function resolveApiUrlSync(): string {
  const argv = process.argv.filter((a) => a.startsWith("--api-url="));
  if (argv.length) {
    const v = argv[argv.length - 1].split("=", 2)[1];
    if (v) return v.replace(/\/$/, "");
  }
  const env = process.env.NETVAN_API_URL || process.env.NETVAN_API_BASE;
  if (env && env.trim()) return env.trim().replace(/\/$/, "");
  return "http://127.0.0.1:8000";
}

contextBridge.exposeInMainWorld("netvan", {
  /** Synchronous API base URL (argv/env resolved in the preload). */
  getApiUrlSync: () => resolveApiUrlSync(),

  /** Async API base URL (re-queries the main process, useful after a restart). */
  getApiUrl: () => ipcRenderer.invoke("netvan:get-api-url"),

  /** Open the API data directory in the OS file manager. */
  openDataDir: () => ipcRenderer.invoke("netvan:open-data-dir"),

  /** Open an external URL in the system browser. */
  openExternal: (url: string) => ipcRenderer.send("netvan:open-external", url),

  /** Quit the desktop app. */
  quit: () => ipcRenderer.send("netvan:quit"),
});