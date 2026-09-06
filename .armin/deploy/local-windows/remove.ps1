#Requires -Version 5.1
<#
.SYNOPSIS
  Remove the Netvan local Windows service and drop this stack's data/DB.

.DESCRIPTION
  Stops/uninstalls the single WinSW service Netvan (and legacy netvan-api /
  netvan-webui), clears install markers, removes winsw.exe, and deletes
  %ProgramData%\Netvan\NetvanApi for this stack only.
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
$ApiRoot = Join-Path $ProjectRoot 'netvan-api'
$DataDir = Join-Path $env:ProgramData 'Netvan\NetvanApi'
$LegacyServiceNames = @($ServiceName, 'netvan-api', 'netvan-webui')

function Test-IsElevated {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Read-State {
  if (-not (Test-Path -LiteralPath $StatePath)) { return $null }
  return (Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json)
}

function Invoke-WinswSafe([string]$Xml, [string[]]$WinArgs) {
  if (-not (Test-Path -LiteralPath $WinswPath)) { return }
  if (-not (Test-Path -LiteralPath $Xml)) { return }
  try {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $WinswPath @WinArgs $Xml 2>&1 | Out-Null
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

Write-Host "==> removing stack $StackName (service $ServiceName)"

Invoke-WinswSafe -Xml $XmlPath -WinArgs @('stop')
Invoke-WinswSafe -Xml $XmlPath -WinArgs @('uninstall')
Invoke-WinswSafe -Xml $LegacyXmlPath -WinArgs @('stop')
Invoke-WinswSafe -Xml $LegacyXmlPath -WinArgs @('uninstall')

foreach ($extra in @(
    (Join-Path $env:ProgramFiles 'Netvan\netvan-api.xml'),
    (Join-Path $env:ProgramFiles 'Netvan\netvan-webui.xml')
  )) {
  Invoke-WinswSafe -Xml $extra -WinArgs @('stop')
  Invoke-WinswSafe -Xml $extra -WinArgs @('uninstall')
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
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

if (Test-Path -LiteralPath $DataDir) {
  Write-Host "==> removing data dir $DataDir"
  Remove-Item -LiteralPath $DataDir -Recurse -Force
} else {
  Write-Host "==> data dir already absent: $DataDir"
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
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding UTF8

if (Test-Path -LiteralPath $WinswPath) {
  Write-Host '==> removing winsw.exe'
  Remove-Item -LiteralPath $WinswPath -Force -ErrorAction SilentlyContinue
}

Write-Host "Done: service '$ServiceName' (and legacy split services) removed; stack data dropped."
