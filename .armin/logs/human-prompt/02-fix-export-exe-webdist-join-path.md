# Fix Export Exe Webdist Join Path

Date and time: 2026-09-06 09:25:00

## Prompt

PS C:\Users\armin> powershell -ExecutionPolicy Bypass -File C:\Users\armin\GitHub\netvan\scripts\export-exe-and-install.ps1
ProjectRoot : C:\Users\armin\GitHub\netvan
ReleaseDir  : C:\Users\armin\GitHub\netvan\release
Ports       : API 9050 / WebUI 9051
==> cargo build -p netvan-api --release --target x86_64-pc-windows-msvc
    Finished `release` profile [optimized] target(s) in 0.32s
==> npm run build (VITE_NETVAN_API_URL=http://127.0.0.1:9050)
==> staging payload â†’ C:\Users\armin\GitHub\netvan\release\staging
Join-Path : Cannot find drive. A drive with the name ' > netvan-webui@0.1.0 build > tsc && vite build  vite v7.3.6 building client environment for production... transforming... Γ£ô 2369 modules transformed.
rendering chunks... computing gzip size... dist/manifest.webmanifest                            0.45 kB dist/index.html                                      1.12 kB Γöé gzip' does not exist.
At C:\Users\armin\GitHub\netvan\scripts\export-exe-and-install.ps1:133 char:20
+   Copy-Item -Path (Join-Path $WebDist '*') -Destination (Join-Path $S ...
+                    ~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: ( > netvan-webui...2m Γöé gzip:String) [Join-Path], DriveNotFoundException
    + FullyQualifiedErrorId : DriveNotFound,Microsoft.PowerShell.Commands.JoinPathCommand

Test it after any edit
