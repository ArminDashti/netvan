#Requires -Version 5.1
<#
.SYNOPSIS
  Install or update netvan API as a local Windows service (WinSW).
.DESCRIPTION
  Fresh: assign/reuse ports, ensure data dir, build API, ensure WinSW, install+start.
  Update (service/state already present): stop, rebuild, start; keep DB/data; reuse ports.
  Does not drop existing SQLite under ProgramData. Does not register/start unless you run this script.
  Optional WebUI: cold build + vite preview (not a Windows service).
#>
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
  [string]$StackName = 'netvan',
  [string]$ServiceName = 'netvan-api',
  [int]$ApiPort = 8000,
  [int]$WebUiPort = 8001,
  [switch]$SkipWebUi
)

$ErrorActionPreference = 'Stop'

$DeployDir = $PSScriptRoot
$StatePath = Join-Path $DeployDir 'state.json'
$XmlPath = Join-Path $DeployDir 'netvan-api.xml'
$WinswPath = Join-Path $DeployDir 'winsw.exe'
$ApiRoot = Join-Path $ProjectRoot 'netvan-api'
$WebUiRoot = Join-Path $ProjectRoot 'netvan-webui'
$DataDir = Join-Path $env:ProgramData 'Netvan\NetvanApi'
$Bind = "127.0.0.1:$ApiPort"

function Test-IsElevated {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Read-State {
  if (-not (Test-Path $StatePath)) { return $null }
  return (Get-Content -Raw -Path $StatePath | ConvertFrom-Json)
}

function Write-State([hashtable]$Values) {
  $Values | ConvertTo-Json -Depth 6 | Set-Content -Path $StatePath -Encoding UTF8
}

function Test-ServiceInstalled {
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($svc) { return $true }
  $st = Read-State
  if ($st -and $st.installed -eq $true) { return $true }
  if (Test-Path $WinswPath) {
    $out = & $WinswPath status $XmlPath 2>&1 | Out-String
    if ($out -match 'Installed|Running|Stopped') { return $true }
  }
  return $false
}

function Stop-NativeServiceIfPresent {
  $nativeExeCandidates = @(
    (Join-Path $ApiRoot 'target\release\netvan-api.exe'),
    (Join-Path $ApiRoot 'target\x86_64-pc-windows-gnu\release\netvan-api.exe'),
    (Join-Path $ApiRoot 'target\x86_64-pc-windows-msvc\release\netvan-api.exe')
  )
  $exe = $nativeExeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($exe) {
    & $exe stop 2>$null | Out-Null
  }
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($svc -and -not (Test-Path $WinswPath)) {
    # Legacy native SCM install (netvan-api.exe install) — remove so WinSW can own the name.
    if ($exe) {
      & $exe uninstall 2>$null | Out-Null
    } else {
      sc.exe stop $ServiceName 2>$null | Out-Null
      sc.exe delete $ServiceName 2>$null | Out-Null
    }
  }
}

function Find-ApiBinary {
  $candidates = @(
    (Join-Path $ApiRoot 'target\release\netvan-api.exe'),
    (Join-Path $ApiRoot 'target\x86_64-pc-windows-gnu\release\netvan-api.exe'),
    (Join-Path $ApiRoot 'target\x86_64-pc-windows-msvc\release\netvan-api.exe')
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return (Resolve-Path $c).Path }
  }
  return $null
}

function Build-Api {
  if (-not (Test-Path $ApiRoot)) { throw "Missing API root: $ApiRoot" }
  Push-Location $ApiRoot
  try {
    Write-Host "==> cargo build -p netvan-api --release"
    cargo build -p netvan-api --release
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed ($LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
  $bin = Find-ApiBinary
  if (-not $bin) { throw 'netvan-api.exe not found under target/*/release' }
  return $bin
}

function Ensure-Winsw {
  if (Test-Path $WinswPath) { return }
  $url = 'https://github.com/winsw/winsw/releases/download/v3.0.0/WinSW-x64.exe'
  Write-Host "==> downloading WinSW to $WinswPath"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $url -OutFile $WinswPath -UseBasicParsing
  if (-not (Test-Path $WinswPath)) { throw 'WinSW download failed' }
}

function Write-ServiceXml([string]$BinaryPath) {
  $dataEsc = [System.Security.SecurityElement]::Escape($DataDir)
  $binEsc = [System.Security.SecurityElement]::Escape($BinaryPath)
  $wdEsc = [System.Security.SecurityElement]::Escape($ApiRoot)
  $xml = @"
<?xml version="1.0" encoding="UTF-8"?>
<service>
  <id>$ServiceName</id>
  <name>$ServiceName</name>
  <description>$StackName API (local Windows)</description>
  <executable>$binEsc</executable>
  <arguments>run</arguments>
  <workingdirectory>$wdEsc</workingdirectory>
  <env name="NETVAN_API_BIND" value="$Bind"/>
  <env name="NETVAN_API_DATA_DIR" value="$dataEsc"/>
  <logpath>$dataEsc</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
  <onfailure action="restart" delay="10 sec"/>
</service>
"@
  Set-Content -Path $XmlPath -Value $xml -Encoding UTF8
}

function Invoke-Winsw([string[]]$Args) {
  & $WinswPath @Args
  if ($LASTEXITCODE -ne 0) {
    throw "winsw $($Args -join ' ') failed ($LASTEXITCODE)"
  }
}

function Ensure-DataDir {
  if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    Write-Host "==> created data dir $DataDir (SQLite schema applies on first API open; no DROP)"
  } else {
    Write-Host "==> keeping existing data dir $DataDir"
  }
}

function Start-WebUiIfRequested {
  if ($SkipWebUi) { return $null }
  if (-not (Test-Path $WebUiRoot)) {
    Write-Host "==> webui folder missing; skipping WebUI"
    return $null
  }
  Push-Location $WebUiRoot
  try {
    Write-Host "==> npm run build (webui)"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed ($LASTEXITCODE)" }
    # Stop prior preview on this port if we tracked a pid
    $st = Read-State
    if ($st -and $st.webui_pid) {
      Stop-Process -Id ([int]$st.webui_pid) -Force -ErrorAction SilentlyContinue
    }
    Write-Host "==> vite preview on 127.0.0.1:$WebUiPort"
    $p = Start-Process -FilePath 'npx' -ArgumentList @(
      'vite', 'preview', '--host', '127.0.0.1', '--port', "$WebUiPort"
    ) -WorkingDirectory $WebUiRoot -PassThru -WindowStyle Hidden
    return $p.Id
  } finally {
    Pop-Location
  }
}

# --- main ---
if (-not (Test-IsElevated)) {
  throw 'Administrator elevation required to install/update the Windows service. Re-run from an elevated PowerShell.'
}

if (-not (Test-Path $ApiRoot)) {
  throw "Expected API at $ApiRoot"
}

$already = Test-ServiceInstalled
if ($already) {
  Write-Host "==> update path (service/state present); keeping DB/data"
} else {
  Write-Host "==> fresh install path"
}

# Reuse ports from prior state when updating
$prior = Read-State
if ($already -and $prior -and $prior.ports) {
  if ($prior.ports.api) { $ApiPort = [int]$prior.ports.api; $Bind = "127.0.0.1:$ApiPort" }
  if ($prior.ports.webui) { $WebUiPort = [int]$prior.ports.webui }
}

Ensure-DataDir

if ($already) {
  if (Test-Path $WinswPath) {
    try { & $WinswPath stop $XmlPath 2>$null | Out-Null } catch {}
  }
  Stop-NativeServiceIfPresent
} else {
  Stop-NativeServiceIfPresent
}

$binary = Build-Api
Ensure-Winsw
Write-ServiceXml -BinaryPath $binary

if ($already -and (Test-Path $WinswPath)) {
  # refresh binary path in XML already done; restart
  try { Invoke-Winsw @('stop', $XmlPath) } catch { Write-Host "stop: $_" }
  # reinstall if XML/id already registered
  try { & $WinswPath uninstall $XmlPath 2>$null | Out-Null } catch {}
  Invoke-Winsw @('install', $XmlPath)
  Invoke-Winsw @('start', $XmlPath)
} else {
  Invoke-Winsw @('install', $XmlPath)
  Invoke-Winsw @('start', $XmlPath)
}

$webPid = Start-WebUiIfRequested

Write-State @{
  stack_name   = $StackName
  service_name = $ServiceName
  installed    = $true
  ports        = @{ api = $ApiPort; webui = $WebUiPort }
  binary_path  = $binary
  data_dir     = $DataDir
  webui_pid    = $webPid
}

Write-Host "Done: $ServiceName listening http://$Bind ; data $DataDir"
if ($webPid) {
  Write-Host "WebUI pid $webPid on http://127.0.0.1:$WebUiPort"
}
