#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Rebuild netvan-api release binary, remove the old Windows service, install and start the new one.

.DESCRIPTION
  Run this after any code change that affects the installed netvan-api Windows service.
  Must be elevated (Administrator).
#>
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Get-InstalledRustTargets {
  $raw = & rustup target list --installed 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $raw) { return @() }
  return @($raw | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
}

function Resolve-ApiCargoTarget {
  $installed = Get-InstalledRustTargets
  $gnu = 'x86_64-pc-windows-gnu'
  $msvc = 'x86_64-pc-windows-msvc'
  if ($installed -contains $gnu) { return $gnu }
  if ($installed -contains $msvc) { return $msvc }
  return $msvc
}

function Find-ApiBinary {
  $candidates = @(
    (Join-Path $RepoRoot 'target\release\netvan-api.exe'),
    (Join-Path $RepoRoot 'target\x86_64-pc-windows-gnu\release\netvan-api.exe'),
    (Join-Path $RepoRoot 'target\x86_64-pc-windows-msvc\release\netvan-api.exe')
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return (Resolve-Path -LiteralPath $c).Path }
  }
  return $null
}

$target = Resolve-ApiCargoTarget
Write-Host "==> cargo build -p netvan-api --release --target $target"
cargo build -p netvan-api --release --target $target
if ($LASTEXITCODE -ne 0) {
  throw "cargo build failed with exit code $LASTEXITCODE"
}

$Exe = Find-ApiBinary
if (-not $Exe) {
  throw "Missing binary under target/*/release/netvan-api.exe"
}

Write-Host "==> stop (ignore if not running)"
& $Exe stop 2>$null

Write-Host "==> uninstall old service"
& $Exe uninstall
if ($LASTEXITCODE -ne 0) {
  # Not installed yet is OK on first install
  Write-Host "uninstall exited $LASTEXITCODE (continuing if service was absent)"
}

Write-Host "==> install new service from $Exe"
& $Exe install
if ($LASTEXITCODE -ne 0) {
  throw "install failed with exit code $LASTEXITCODE"
}

Write-Host "==> start"
& $Exe start
if ($LASTEXITCODE -ne 0) {
  throw "start failed with exit code $LASTEXITCODE"
}

Write-Host "==> status"
& $Exe status

Write-Host "Done: old service removed, new release installed and started."
