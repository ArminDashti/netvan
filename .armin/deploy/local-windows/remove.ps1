#Requires -Version 5.1
<#
.SYNOPSIS
  Remove netvan local Windows service and drop this stack's data/DB.
.DESCRIPTION
  Stops/uninstalls WinSW (or legacy native) service netvan-api, stops optional WebUI,
  removes deploy artifacts markers, and deletes %ProgramData%\Netvan\NetvanApi.
#>
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
  [string]$StackName = 'netvan',
  [string]$ServiceName = 'netvan-api',
  [int]$ApiPort = 8000,
  [int]$WebUiPort = 8001
)

$ErrorActionPreference = 'Stop'

$DeployDir = $PSScriptRoot
$StatePath = Join-Path $DeployDir 'state.json'
$XmlPath = Join-Path $DeployDir 'netvan-api.xml'
$WinswPath = Join-Path $DeployDir 'winsw.exe'
$ApiRoot = Join-Path $ProjectRoot 'netvan-api'
$DataDir = Join-Path $env:ProgramData 'Netvan\NetvanApi'

function Test-IsElevated {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Read-State {
  if (-not (Test-Path $StatePath)) { return $null }
  return (Get-Content -Raw -Path $StatePath | ConvertFrom-Json)
}

if (-not (Test-IsElevated)) {
  throw 'Administrator elevation required to uninstall the Windows service. Re-run from an elevated PowerShell.'
}

$st = Read-State
if ($st -and $st.ports) {
  if ($st.ports.api) { $ApiPort = [int]$st.ports.api }
  if ($st.ports.webui) { $WebUiPort = [int]$st.ports.webui }
}
if ($st -and $st.data_dir) {
  $DataDir = [string]$st.data_dir
}

Write-Host "==> removing stack $StackName ($ServiceName)"

# Optional WebUI process
if ($st -and $st.webui_pid) {
  Write-Host "==> stop WebUI pid $($st.webui_pid)"
  Stop-Process -Id ([int]$st.webui_pid) -Force -ErrorAction SilentlyContinue
}

# WinSW uninstall
if (Test-Path $WinswPath) {
  Write-Host '==> WinSW stop/uninstall'
  try { & $WinswPath stop $XmlPath 2>$null | Out-Null } catch {}
  try { & $WinswPath uninstall $XmlPath 2>$null | Out-Null } catch {}
}

# Legacy native SCM (netvan-api.exe uninstall)
$nativeCandidates = @(
  (Join-Path $ApiRoot 'target\release\netvan-api.exe'),
  (Join-Path $ApiRoot 'target\x86_64-pc-windows-gnu\release\netvan-api.exe'),
  (Join-Path $ApiRoot 'target\x86_64-pc-windows-msvc\release\netvan-api.exe')
)
$exe = $nativeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($exe) {
  Write-Host "==> native stop/uninstall via $exe"
  & $exe stop 2>$null | Out-Null
  & $exe uninstall 2>$null | Out-Null
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host "==> sc.exe delete $ServiceName (fallback)"
  sc.exe stop $ServiceName 2>$null | Out-Null
  sc.exe delete $ServiceName 2>$null | Out-Null
}

# Drop stack data/DB only for this stack
if (Test-Path $DataDir) {
  Write-Host "==> removing data dir $DataDir"
  Remove-Item -LiteralPath $DataDir -Recurse -Force
} else {
  Write-Host "==> data dir already absent: $DataDir"
}

# Clear install markers; keep scripts/XML templates
if (Test-Path $StatePath) {
  @{
    stack_name   = $StackName
    service_name = $ServiceName
    installed    = $false
    ports        = @{ api = $ApiPort; webui = $WebUiPort }
    binary_path  = ''
    data_dir     = $DataDir
    webui_pid    = $null
  } | ConvertTo-Json -Depth 6 | Set-Content -Path $StatePath -Encoding UTF8
}

if (Test-Path $WinswPath) {
  Write-Host '==> removing winsw.exe'
  Remove-Item -LiteralPath $WinswPath -Force -ErrorAction SilentlyContinue
}

Write-Host "Done: $ServiceName removed; stack data dropped."
