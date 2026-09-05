#Requires -Version 5.1
<#
.SYNOPSIS
  Run Netvan API + WebUI hot-reload on this machine (API 4000, WebUI 4001).
.DESCRIPTION
  Frees TCP/UDP 4000 and 4001 by stopping every occupant, then starts the API
  (cargo-watch when available) on 127.0.0.1:4000 and Vite HMR on
  127.0.0.1:4001 (strict port). Vite proxies /api to the API port.
  Does not drop SQLite / ProgramData. Does not register a Windows service.
#>
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path,
  [string]$StackName = 'netvan',
  [int]$WebUiPort = 4001,
  [int]$ApiPort = 4000,
  [string]$BindHost = '127.0.0.1',
  [int]$PortFreeTimeoutSec = 20
)

$ErrorActionPreference = 'Stop'

$DeployDir = $PSScriptRoot
$StatePath = Join-Path $DeployDir 'state.json'
$ApiRoot = Join-Path $ProjectRoot 'netvan-api'
$WebUiRoot = Join-Path $ProjectRoot 'netvan-webui'
$DataDir = Join-Path $env:ProgramData 'Netvan\NetvanApi'

function Get-PidsOnPort([int]$Port) {
  $ids = New-Object 'System.Collections.Generic.HashSet[int]'

  $tcp = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  foreach ($c in @($tcp)) {
    $pidVal = [int]$c.OwningProcess
    if ($pidVal -gt 0) { [void]$ids.Add($pidVal) }
  }

  $udp = Get-NetUDPEndpoint -LocalPort $Port -ErrorAction SilentlyContinue
  foreach ($c in @($udp)) {
    $pidVal = [int]$c.OwningProcess
    if ($pidVal -gt 0) { [void]$ids.Add($pidVal) }
  }

  $netstat = & netstat.exe -ano 2>$null
  foreach ($line in @($netstat)) {
    if ($line -notmatch (":" + $Port + "\s")) { continue }
    if ($line -notmatch '\s+(\d+)\s*$') { continue }
    $pidVal = [int]$Matches[1]
    if ($pidVal -gt 0) { [void]$ids.Add($pidVal) }
  }

  return @($ids)
}

function Test-PortInUse([int]$Port) {
  $listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listen) { return $true }
  $bound = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.State -in @('Listen', 'Bound', 'Established') }
  return [bool]$bound
}

function Stop-EveryProcessOnPort([int]$Port) {
  Write-Host "==> releasing TCP/UDP $Port (kill every occupant)"
  $deadline = (Get-Date).AddSeconds($PortFreeTimeoutSec)
  $killed = New-Object 'System.Collections.Generic.HashSet[int]'

  while ((Get-Date) -lt $deadline) {
    $pids = Get-PidsOnPort $Port
    if (-not $pids -or $pids.Count -eq 0) {
      if (-not (Test-PortInUse $Port)) { break }
      Start-Sleep -Milliseconds 300
      continue
    }

    foreach ($pidVal in $pids) {
      if ($pidVal -le 0) { continue }
      $proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
      $name = if ($proc) { $proc.ProcessName } else { '?' }
      Write-Host "    taskkill /F /T PID $pidVal ($name)"
      & taskkill.exe /F /T /PID $pidVal 2>$null | Out-Null
      Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
      [void]$killed.Add($pidVal)
    }

    Start-Sleep -Milliseconds 400
  }

  if (Test-PortInUse $Port) {
    throw "Port $Port is still occupied after killing occupants. Close the holder and retry."
  }

  if ($killed.Count -eq 0) {
    Write-Host "    port $Port was already free"
  } else {
    Write-Host "    killed $($killed.Count) process tree(s); port $Port is free"
  }
}

function Require-Command([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Missing '$Name' on PATH. Install it, then re-run this script."
  }
  return $cmd.Source
}

function Read-State {
  if (-not (Test-Path $StatePath)) { return $null }
  return (Get-Content -Raw -Path $StatePath | ConvertFrom-Json)
}

function Write-State([hashtable]$Values) {
  $Values | ConvertTo-Json -Depth 6 | Set-Content -Path $StatePath -Encoding UTF8
}

function Stop-TrackedPids {
  $st = Read-State
  if (-not $st -or -not $st.pids) { return }
  foreach ($key in @('webui', 'api')) {
    $pidVal = 0
    try { $pidVal = [int]$st.pids.$key } catch { $pidVal = 0 }
    if ($pidVal -le 0) { continue }
    Write-Host "==> stopping prior $key pid $pidVal"
    & taskkill.exe /F /T /PID $pidVal 2>$null | Out-Null
    Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
  }
}

function Start-LoggedProcess {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory,
    [hashtable]$Environment,
    [string]$LogStem
  )

  $saved = @{}
  foreach ($k in $Environment.Keys) {
    $saved[$k] = [Environment]::GetEnvironmentVariable($k, 'Process')
    Set-Item -Path "Env:$k" -Value ([string]$Environment[$k])
  }
  try {
    $proc = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList `
      -WorkingDirectory $WorkingDirectory -PassThru -WindowStyle Hidden
    if (-not $proc) { throw "Failed to start $LogStem ($FilePath)" }
    return $proc.Id
  } finally {
    foreach ($k in $saved.Keys) {
      $prev = $saved[$k]
      if ($null -eq $prev -or $prev -eq '') {
        Remove-Item -Path "Env:$k" -ErrorAction SilentlyContinue
      } else {
        Set-Item -Path "Env:$k" -Value $prev
      }
    }
  }
}

# --- main ---
if ($WebUiPort -lt 1024) { throw "Web UI port must be >= 1024 (got $WebUiPort)." }
if ($ApiPort -lt 1024) { throw "API port must be >= 1024 (got $ApiPort)." }
if (-not (Test-Path $ApiRoot)) { throw "Missing API root: $ApiRoot" }
if (-not (Test-Path $WebUiRoot)) { throw "Missing WebUI root: $WebUiRoot" }

Require-Command 'node' | Out-Null
$npm = Require-Command 'npm.cmd'
$cargo = Require-Command 'cargo'

Stop-TrackedPids
Stop-EveryProcessOnPort -Port $ApiPort
Stop-EveryProcessOnPort -Port $WebUiPort

if (-not (Test-Path $DataDir)) {
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  Write-Host "==> created data dir $DataDir (schema applies on API open; no DROP)"
} else {
  Write-Host "==> keeping existing data dir $DataDir"
}

Push-Location $WebUiRoot
try {
  if (-not (Test-Path (Join-Path $WebUiRoot 'node_modules'))) {
    Write-Host "==> npm install (webui)"
    & $npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
  }
} finally {
  Pop-Location
}

$cargoWatchOk = $false
& $cargo watch --version 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { $cargoWatchOk = $true }
$envMap = @{
  NETVAN_API_BIND     = "${BindHost}:$ApiPort"
  NETVAN_API_DATA_DIR = $DataDir
  RUST_LOG            = 'info'
}
if ($cargoWatchOk) {
  Write-Host "==> cargo watch API on ${BindHost}:$ApiPort"
  $apiPid = Start-LoggedProcess -FilePath $cargo -ArgumentList @(
    'watch', '-w', 'crates', '-x', 'run -p netvan-api -- run'
  ) -WorkingDirectory $ApiRoot -Environment $envMap -LogStem 'api-hmr'
  $apiCmd = 'cargo watch -x run -p netvan-api -- run'
} else {
  Write-Host "==> cargo-watch missing; API without file-watch: cargo run -p netvan-api -- run"
  $apiPid = Start-LoggedProcess -FilePath $cargo -ArgumentList @(
    'run', '-p', 'netvan-api', '--', 'run'
  ) -WorkingDirectory $ApiRoot -Environment $envMap -LogStem 'api-run'
  $apiCmd = 'cargo run -p netvan-api -- run (hot-reload OFF)'
}

$apiReadyDeadline = (Get-Date).AddSeconds(90)
$apiReady = $false
while ((Get-Date) -lt $apiReadyDeadline) {
  if (Test-PortInUse $ApiPort) { $apiReady = $true; break }
  $alive = Get-Process -Id $apiPid -ErrorAction SilentlyContinue
  if (-not $alive) {
    throw "API process $apiPid exited before binding $ApiPort."
  }
  Start-Sleep -Milliseconds 400
}
if (-not $apiReady) {
  throw "API did not listen on $ApiPort within 90s."
}

$webEnv = @{
  VITE_DEV_PORT           = "$WebUiPort"
  VITE_DEV_HOST           = $BindHost
  VITE_DEV_ORIGIN         = "http://${BindHost}:$WebUiPort"
  NETVAN_API_PROXY_TARGET = "http://${BindHost}:$ApiPort"
}
Write-Host "==> Vite HMR on http://${BindHost}:$WebUiPort (strictPort)"
$webPid = Start-LoggedProcess -FilePath $npm -ArgumentList @(
  'run', 'dev', '--', '--host', $BindHost, '--port', "$WebUiPort", '--strictPort'
) -WorkingDirectory $WebUiRoot -Environment $webEnv -LogStem 'webui-hmr'

$readyDeadline = (Get-Date).AddSeconds(45)
$webReady = $false
while ((Get-Date) -lt $readyDeadline) {
  if (Test-PortInUse $WebUiPort) { $webReady = $true; break }
  $alive = Get-Process -Id $webPid -ErrorAction SilentlyContinue
  if (-not $alive) {
    throw "WebUI process $webPid exited before binding $WebUiPort."
  }
  Start-Sleep -Milliseconds 400
}
if (-not $webReady) {
  throw "WebUI did not listen on $WebUiPort within 45s."
}

Write-State @{
  stack_name = $StackName
  ports      = @{ api = $ApiPort; webui = $WebUiPort }
  pids       = @{ api = $apiPid; webui = $webPid }
  commands   = @{
    api   = $apiCmd
    webui = "npm run dev -- --host $BindHost --port $WebUiPort --strictPort"
  }
  bind_host  = $BindHost
  data_dir   = $DataDir
}

Write-Host "Done."
Write-Host "  API (HMR):   http://${BindHost}:$ApiPort  pid $apiPid"
Write-Host "  WebUI (HMR): http://${BindHost}:$WebUiPort  pid $webPid"
Write-Host "  Stop API:    taskkill /F /T /PID $apiPid"
Write-Host "  Stop WebUI:  taskkill /F /T /PID $webPid"
