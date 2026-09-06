# Fix Cargo Windows-gnu Build

Date and time: 2026-09-06 09:20:00

## Prompt

PS C:\Users\armin> powershell -ExecutionPolicy Bypass -File C:\Users\armin\GitHub\netvan\scripts\export-exe-and-install.ps1
ProjectRoot : C:\Users\armin\GitHub\netvan
ReleaseDir  : C:\Users\armin\GitHub\netvan\release
Ports       : API 9050 / WebUI 9051
==> cargo build -p netvan-api --release
...
error[E0463]: can't find crate for `core`
  = note: the `x86_64-pc-windows-gnu` target may not be installed
cargo build failed (101)
