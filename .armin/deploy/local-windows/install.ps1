#Requires -Version 5.1
<#
.SYNOPSIS
  Install or update Netvan as one local Windows service (WinSW): API + WebUI.

.DESCRIPTION
  Fresh install: assign/reuse ports, ensure data dir, build API + WebUI, ensure
  WinSW, write service XML, install and start a single service named Netvan.

  Already installed (Get-Service Netvan / legacy names, WinSW status, or
  state.json installed=true): UPDATE path — stop service, rebuild, rewrite XML,
  reinstall+start. Keeps %ProgramData%\Netvan\NetvanApi (SQLite) and reuses
  ports from state.json. Never drops the database on install or update.

  Migrates away from split services netvan-api / netvan-webui when present.

.NOTES
  Requires Administrator. This script does not run itself; invoke manually.
#>
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path,
  [string]$StackName = 'netvan',
  [string]$ServiceName = 'Netvan',
  [int]$ApiPort = 8000,
  [int]$WebUiPort = 8001
)

$ErrorActionPreference = 'Stop'

$DeployDir = $PSScriptRoot
$StatePath = Join-Path $DeployDir 'state.json'
$XmlPath = Join-Path $DeployDir 'Netvan.xml'
$LegacyXmlPath = Join-Path $DeployDir 'netvan-api.xml'
$WinswPath = Join-Path $DeployDir 'winsw.exe'
$StartScript = Join-Path $DeployDir 'Start-Netvan.ps1'
$ServeScript = Join-Path $DeployDir 'Serve-WebUi.ps1'
$ApiRoot = Join-Path $ProjectRoot 'netvan-api'
$WebUiRoot = Join-Path $ProjectRoot 'netvan-webui'
$WebUiDist = Join-Path $WebUiRoot 'dist'
$DataDir = Join-Path $env:ProgramData 'Netvan\NetvanApi'
$Bind = "127.0.0.1:$ApiPort"
$LegacyServiceNames = @('netvan-api', 'netvan-webui', 'Netvan')

function Test-IsElevated {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Read-State {
  if (-not (Test-Path -LiteralPath $StatePath)) { return $null }
  return (Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json)
}

function Write-State([hashtable]$Values) {
  $Values | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

function Test-AlreadyInstalled {
  foreach ($name in $LegacyServiceNames) {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($svc) { return $true }
  }

  $st = Read-State
  if ($st -and $st.installed -eq $true) { return $true }

  if ((Test-Path -LiteralPath $WinswPath) -and (Test-Path -LiteralPath $XmlPath)) {
    $out = & $WinswPath status $XmlPath 2>&1 | Out-String
    if ($out -match 'Installed|Running|Stopped') { return $true }
  }

  return $false
}

function Get-NativeApiExe {
  $candidates = @(
    (Join-Path $ApiRoot 'target\release\netvan-api.exe'),
    (Join-Path $ApiRoot 'target\x86_64-pc-windows-gnu\release\netvan-api.exe'),
    (Join-Path $ApiRoot 'target\x86_64-pc-windows-msvc\release\netvan-api.exe')
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return (Resolve-Path -LiteralPath $c).Path }
  }
  return $null
}

function Invoke-WinswSafe([string]$Xml, [string[]]$WinArgs) {
  if (-not (Test-Path -LiteralPath $WinswPath)) { return }
  if (-not (Test-Path -LiteralPath $Xml)) { return }
  try {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $WinswPath @WinArgs $Xml 2>&1 | Out-Null
  } catch {
    # best-effort cleanup / stop
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Stop-NativeApiService {
  $exe = Get-NativeApiExe
  if (-not $exe) { return }
  try {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $exe stop 2>&1 | Out-Null
    & $exe uninstall 2>&1 | Out-Null
  } catch {
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Remove-ScService([string]$Name) {
  $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $svc) { return }
  Write-Host "==> removing legacy/sc service $Name"
  sc.exe stop $Name 2>$null | Out-Null
  Start-Sleep -Milliseconds 500
  sc.exe delete $Name 2>$null | Out-Null
}

function Clear-PriorServices {
  # Stop WinSW registrations (current + legacy XML)
  Invoke-WinswSafe -Xml $XmlPath -WinArgs @('stop')
  Invoke-WinswSafe -Xml $XmlPath -WinArgs @('uninstall')
  Invoke-WinswSafe -Xml $LegacyXmlPath -WinArgs @('stop')
  Invoke-WinswSafe -Xml $LegacyXmlPath -WinArgs @('uninstall')

  # Packaged dual-service XMLs (if present under Program Files / prior installs)
  foreach ($extra in @(
      (Join-Path $env:ProgramFiles 'Netvan\netvan-api.xml'),
      (Join-Path $env:ProgramFiles 'Netvan\netvan-webui.xml')
    )) {
    Invoke-WinswSafe -Xml $extra -WinArgs @('stop')
    Invoke-WinswSafe -Xml $extra -WinArgs @('uninstall')
  }

  Stop-NativeApiService

  foreach ($name in $LegacyServiceNames) {
    Remove-ScService $name
  }

  # Free listen ports from any leftover preview / static hosts
  foreach ($port in @($ApiPort, $WebUiPort)) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
      }
  }
}

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

function Build-Api {
  if (-not (Test-Path -LiteralPath $ApiRoot)) { throw "Missing API root: $ApiRoot" }
  $target = Resolve-ApiCargoTarget
  Push-Location $ApiRoot
  try {
    Write-Host "==> cargo build -p netvan-api --release --target $target"
    cargo build -p netvan-api --release --target $target
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed ($LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
  $bin = Get-NativeApiExe
  if (-not $bin) { throw 'netvan-api.exe not found under target/*/release' }
  return $bin
}

function Build-WebUi {
  if (-not (Test-Path -LiteralPath $WebUiRoot)) {
    throw "Missing WebUI root: $WebUiRoot"
  }
  Push-Location $WebUiRoot
  try {
    Write-Host '==> npm run build (webui)'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed ($LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
  if (-not (Test-Path -LiteralPath $WebUiDist)) {
    throw "WebUI dist missing after build: $WebUiDist"
  }
  return (Resolve-Path -LiteralPath $WebUiDist).Path
}

function Ensure-Winsw {
  if (Test-Path -LiteralPath $WinswPath) {
    $existing = Get-Item -LiteralPath $WinswPath
    if ($existing.Length -gt 1MB) { return }
    Remove-Item -LiteralPath $WinswPath -Force
  }
  # Latest stable release (v3.0.0 does not exist on GitHub; 404 returns HTML).
  $url = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe'
  Write-Host "==> downloading WinSW to $WinswPath"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $url -OutFile $WinswPath -UseBasicParsing
  if (-not (Test-Path -LiteralPath $WinswPath)) { throw 'WinSW download failed' }
  $bytes = [System.IO.File]::ReadAllBytes($WinswPath)
  if ($bytes.Length -lt 2 -or $bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) {
    Remove-Item -LiteralPath $WinswPath -Force -ErrorAction SilentlyContinue
    throw "WinSW download is not a Windows PE binary (bad URL or HTML 404). Tried: $url"
  }
}

function Write-ServiceXml([string]$BinaryPath, [string]$DistPath) {
  $psEsc = [System.Security.SecurityElement]::Escape((Get-Command powershell.exe).Source)
  $dataEsc = [System.Security.SecurityElement]::Escape($DataDir)
  $wdEsc = [System.Security.SecurityElement]::Escape($DeployDir)
  $args = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`" -ApiExe `"$BinaryPath`" -ApiWorkingDir `"$ApiRoot`" -WebUiRoot `"$DistPath`" -ServeScript `"$ServeScript`" -DataDir `"$DataDir`" -ApiPort $ApiPort -WebUiPort $WebUiPort -BindHost 127.0.0.1"
  $argsEsc = [System.Security.SecurityElement]::Escape($args)

  $xml = @"
<?xml version="1.0" encoding="UTF-8"?>
<service>
  <id>$ServiceName</id>
  <name>$ServiceName</name>
  <description>$StackName API + WebUI (local Windows)</description>
  <executable>$psEsc</executable>
  <arguments>$argsEsc</arguments>
  <workingdirectory>$wdEsc</workingdirectory>
  <env name="NETVAN_API_BIND" value="$Bind"/>
  <env name="NETVAN_API_DATA_DIR" value="$dataEsc"/>
  <logpath>$dataEsc</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
  <onfailure action="restart" delay="10 sec"/>
  <stoptimeout>20 sec</stoptimeout>
</service>
"@
  Set-Content -LiteralPath $XmlPath -Value $xml -Encoding UTF8
}

function Invoke-Winsw([string[]]$WinArgs) {
  & $WinswPath @WinArgs
  if ($LASTEXITCODE -ne 0) {
    throw "winsw $($WinArgs -join ' ') failed ($LASTEXITCODE)"
  }
}

function Ensure-DataDir {
  if (-not (Test-Path -LiteralPath $DataDir)) {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    Write-Host "==> created data dir $DataDir (schema applies on first API open; no DROP)"
  } else {
    Write-Host "==> keeping existing data dir $DataDir"
  }
}

# --- main ---
if (-not (Test-IsElevated)) {
  throw 'Administrator elevation required to install/update the Windows service. Re-run from an elevated PowerShell.'
}

if (-not (Test-Path -LiteralPath $ApiRoot)) {
  throw "Expected API at $ApiRoot"
}
if (-not (Test-Path -LiteralPath $WebUiRoot)) {
  throw "Expected WebUI at $WebUiRoot"
}
if (-not (Test-Path -LiteralPath $StartScript)) {
  throw "Expected launcher at $StartScript"
}
if (-not (Test-Path -LiteralPath $ServeScript)) {
  throw "Expected Serve-WebUi at $ServeScript"
}

$already = Test-AlreadyInstalled
if ($already) {
  Write-Host '==> UPDATE path (already installed); keeping DB/data and reusing ports'
} else {
  Write-Host '==> FRESH install path'
}

$prior = Read-State
if ($already -and $prior -and $prior.ports) {
  if ($prior.ports.api) {
    $ApiPort = [int]$prior.ports.api
    $Bind = "127.0.0.1:$ApiPort"
  }
  if ($prior.ports.webui) {
    $WebUiPort = [int]$prior.ports.webui
  }
}
if ($already -and $prior -and $prior.data_dir) {
  $DataDir = [string]$prior.data_dir
}

Ensure-DataDir
Clear-PriorServices

$binary = Build-Api
$dist = Build-WebUi
Ensure-Winsw
Write-ServiceXml -BinaryPath $binary -DistPath $dist

# Always uninstall then install so an existing registration becomes an in-place update
Invoke-WinswSafe -Xml $XmlPath -WinArgs @('stop')
Invoke-WinswSafe -Xml $XmlPath -WinArgs @('uninstall')

Invoke-Winsw @('install', $XmlPath)
Invoke-Winsw @('start', $XmlPath)

Write-State @{
  stack_name   = $StackName
  service_name = $ServiceName
  installed    = $true
  ports        = @{ api = $ApiPort; webui = $WebUiPort }
  binary_path  = $binary
  webui_dist   = $dist
  data_dir     = $DataDir
  mode         = $(if ($already) { 'update' } else { 'fresh' })
  updated_at   = (Get-Date).ToString('s')
}

Write-Host "Done ($($(if ($already) { 'update' } else { 'fresh' }))): single service '$ServiceName'"
Write-Host "  API   http://$Bind"
Write-Host "  WebUI http://127.0.0.1:$WebUiPort"
Write-Host "  data  $DataDir"
