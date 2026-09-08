#Requires -Version 5.1
<#
.SYNOPSIS
  Remove the Netvan local Windows service; keep ProgramData / SQLite.

.DESCRIPTION
  Stops/uninstalls the single WinSW service Netvan (and legacy netvan-api /
  netvan-webui), clears install markers, removes winsw/Netvan wrappers. Does
  NOT delete %ProgramData%\Netvan\NetvanApi.
#>
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path,
  [string]$StackName = 'netvan',
  [string]$ServiceName = 'Netvan'
)

$ErrorActionPreference = 'Stop'

$DeployDir = $PSScriptRoot
$StatePath = Join-Path $DeployDir 'state.json'
$XmlPath = Join-Path $DeployDir 'Netvan.xml'
$WinswDownloadPath = Join-Path $DeployDir 'winsw.exe'
$WinswPath = Join-Path $DeployDir "$ServiceName.exe"
$ApiRoot = Join-Path $ProjectRoot 'netvan-api'
$DataDir = Join-Path $env:ProgramData 'Netvan\NetvanApi'
$LegacyServiceNames = @($ServiceName, 'netvan-api', 'netvan-webui')
$ApiPort = 8000
$WebUiPort = 8001

function Test-IsElevated {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Read-State {
  if (-not (Test-Path -LiteralPath $StatePath)) { return $null }
  return (Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json)
}

function Invoke-WinswSafe([string]$Exe, [string[]]$WinArgs) {
  if (-not $Exe -or -not (Test-Path -LiteralPath $Exe)) { return }
  $base = [IO.Path]::GetFileNameWithoutExtension($Exe)
  $cfg = Join-Path (Split-Path -Parent $Exe) "$base.xml"
  if (-not (Test-Path -LiteralPath $cfg)) { return }
  try {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $Exe @WinArgs 2>&1 | Out-Null
  } catch {
  } finally {
    $ErrorActionPreference = $prev
  }
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

Write-Host "==> removing stack $StackName (service $ServiceName); keeping data"

Invoke-WinswSafe -Exe $WinswPath -WinArgs @('stop')
Invoke-WinswSafe -Exe $WinswPath -WinArgs @('uninstall')

foreach ($extra in @(
    (Join-Path $DeployDir 'winsw.exe'),
    (Join-Path $DeployDir 'netvan-api.exe'),
    (Join-Path $env:ProgramFiles 'Netvan\netvan-api.exe'),
    (Join-Path $env:ProgramFiles 'Netvan\netvan-webui.exe'),
    (Join-Path $env:ProgramFiles 'Netvan\Netvan.exe')
  )) {
  Invoke-WinswSafe -Exe $extra -WinArgs @('stop')
  Invoke-WinswSafe -Exe $extra -WinArgs @('uninstall')
}

$nativeCandidates = @(
  (Join-Path $ApiRoot 'target\release\netvan-api.exe'),
  (Join-Path $ApiRoot 'target\x86_64-pc-windows-gnu\release\netvan-api.exe'),
  (Join-Path $ApiRoot 'target\x86_64-pc-windows-msvc\release\netvan-api.exe')
)
$exe = $nativeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($exe) {
  Write-Host "==> native stop/uninstall via $exe"
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

foreach ($name in $LegacyServiceNames) {
  $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if ($svc) {
    Write-Host "==> sc.exe delete $name"
    sc.exe stop $name 2>$null | Out-Null
    Start-Sleep -Milliseconds 500
    sc.exe delete $name 2>$null | Out-Null
  }
}

foreach ($port in @($ApiPort, $WebUiPort)) {
  try {
    Import-Module NetTCPIP -ErrorAction SilentlyContinue | Out-Null
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
      }
  } catch {
  }
}

if (Test-Path -LiteralPath $DataDir) {
  Write-Host "==> keeping data dir $DataDir"
} else {
  Write-Host "==> data dir absent (nothing to keep): $DataDir"
}

@{
  stack_name   = $StackName
  service_name = $ServiceName
  installed    = $false
  ports        = @{ api = $ApiPort; webui = $WebUiPort }
  binary_path  = ''
  webui_dist   = ''
  data_dir     = $DataDir
  mode         = 'removed'
  updated_at   = (Get-Date).ToString('s')
  notes        = 'Service removed; ProgramData / SQLite kept. install.ps1 regenerates helpers + WinSW.'
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding UTF8

foreach ($bin in @($WinswPath, $WinswDownloadPath)) {
  if (Test-Path -LiteralPath $bin) {
    Write-Host "==> removing $([IO.Path]::GetFileName($bin))"
    Remove-Item -LiteralPath $bin -Force -ErrorAction SilentlyContinue
  }
}

foreach ($gen in @($XmlPath, (Join-Path $DeployDir 'Start-Netvan.ps1'), (Join-Path $DeployDir 'Serve-WebUi.ps1'), (Join-Path $DeployDir 'netvan-api.xml'))) {
  if (Test-Path -LiteralPath $gen) {
    Write-Host "==> removing generated $([IO.Path]::GetFileName($gen))"
    Remove-Item -LiteralPath $gen -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Done: service '$ServiceName' (and legacy split services) removed; data kept at $DataDir"
# Native sc.exe/winsw may leave a non-zero LASTEXITCODE (e.g. 1060 = service gone).
$global:LASTEXITCODE = 0
