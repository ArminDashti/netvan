# netvan-webui

Display-only **PWA** for Netvan. Inspired by the desktop Netvan UI, rebuilt with React + Tailwind + Shadcn-style components.

**Does not** run collectors, ping, traceroute, or speedtest in the browser. All work happens in **[netvan-api](https://github.com/ArminDashti/netvan-api)** (`127.0.0.1:8000`).

## Requirements

- Node.js 20+
- Running `netvan-api` (`netvan-api.exe run` or Windows service `netvan-api`)

## Setup

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:8001`.

Dev proxies `/api` (and `/api/ws/tools`) to `http://127.0.0.1:8000`, so the UI works over a single forwarded port.

Optional absolute API origin: `VITE_NETVAN_API_URL=http://127.0.0.1:8000`

## PWA

Production build registers a service worker that **heavily precaches** the app shell and static assets. API / WebSocket traffic to localhost is **NetworkOnly** (never stale metrics).

```powershell
npm run build
npm run preview
```

Install from the browser (“Install Netvan”) when served over localhost/HTTPS.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite on `127.0.0.1:8001` |
| `npm run build` | Typecheck + production PWA build |
| `npm run preview` | Preview production build |

## Architecture

```
Browser (this repo)  --POST /api/rpc-->  netvan-api service
                     --WS /api/ws/tools-->  (live tool streams)
```
