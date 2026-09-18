#Requires -Version 5.1
<#
.SYNOPSIS
  Netvan CLI - manage Netvan Windows service

.DESCRIPTION
  Global CLI wrapper for Netvan service management.
  Delegates to netvan-api binary for service operations.

.EXAMPLE
  netvan service start
  netvan service stop
  netvan service status
  netvan doctor
  netvan run
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Command,

  [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$ErrorActionPreference = 'Stop'

# Resolve paths
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
# If script is in project root, use it directly; otherwise assume it's in a subdirectory
if (Test-Path (Join-Path $ScriptRoot 'netvan-api')) {
  $ProjectRoot = $ScriptRoot
} else {
  $ProjectRoot = (Resolve-Path (Join-Path $ScriptRoot '..')).Path
}
$ApiRoot = Join-Path $ProjectRoot 'netvan-api'

# Find netvan-api.exe
function Get-NetvanApiExe {
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

# Show help
function Show-Help {
  Write-Host "Netvan CLI - manage Netvan Windows service"
  Write-Host ""
  Write-Host "Usage: netvan <command> [args]"
  Write-Host ""
  Write-Host "Commands:"
  Write-Host "  service start    Start the Netvan Windows service"
  Write-Host "  service stop     Stop the Netvan Windows service"
  Write-Host "  service restart  Restart the Netvan Windows service"
  Write-Host "  service status   Show service install/running status"
  Write-Host "  install          Install the Windows service"
  Write-Host "  doctor           Run diagnostics and checks"
  Write-Host "  run              Run in foreground (dev/console mode)"
  Write-Host "  uninstall        Uninstall the Windows service"
  Write-Host "  help             Show this help message"
  Write-Host ""
  Write-Host "Examples:"
  Write-Host "  netvan install"
  Write-Host "  netvan service start"
  Write-Host "  netvan service status"
  Write-Host "  netvan run"
}

# Run diagnostics
function Invoke-Doctor {
  Write-Host "==> Netvan Doctor - running diagnostics..."
  Write-Host ""

  # Check netvan-api.exe
  $apiExe = Get-NetvanApiExe
  if ($apiExe) {
    Write-Host "[OK] netvan-api.exe found: $apiExe"
  } else {
    Write-Host "[FAIL] netvan-api.exe not found. Run: cd netvan-api; cargo build --release"
    return 1
  }

  # Check service status
  $svc = Get-Service -Name 'Netvan' -ErrorAction SilentlyContinue
  if ($svc) {
    Write-Host "[OK] Service 'Netvan' found (Status: $($svc.Status))"
  } else {
    Write-Host "[INFO] Service 'Netvan' not installed"
  }

  # Check data directory
  $dataDir = Join-Path $env:ProgramData 'Netvan\NetvanApi'
  if (Test-Path -LiteralPath $dataDir) {
    Write-Host "[OK] Data directory exists: $dataDir"
  } else {
    Write-Host "[INFO] Data directory not found: $dataDir"
  }

  # Check WinSW wrapper
  $winswPath = Join-Path $ScriptRoot 'scripts\Netvan.exe'
  if (Test-Path -LiteralPath $winswPath) {
    Write-Host "[OK] WinSW wrapper found: $winswPath"
  } else {
    Write-Host "[INFO] WinSW wrapper not found"
  }

  Write-Host ""
  Write-Host "Doctor complete."
  return 0
}

# Main dispatch
if ([string]::IsNullOrWhiteSpace($Command) -or $Command -eq 'help') {
  Show-Help
  exit 0
}

# Service subcommands
if ($Command -eq 'service') {
  if ($Args.Count -eq 0) {
    Write-Host "Error: service command requires an action (start, stop, restart, status)"
    Show-Help
    exit 1
  }

  $action = $Args[0]
  $apiExe = Get-NetvanApiExe

  if (-not $apiExe) {
    Write-Host "Error: netvan-api.exe not found. Build it first:"
    Write-Host "  cd netvan-api"
    Write-Host "  cargo build --release"
    exit 1
  }

  switch ($action) {
    'start' {
      & $apiExe start
      exit $LASTEXITCODE
    }
    'stop' {
      & $apiExe stop
      exit $LASTEXITCODE
    }
    'restart' {
      Write-Host "==> Restarting Netvan service..."
      & $apiExe stop
      Start-Sleep -Seconds 2
      & $apiExe start
      exit $LASTEXITCODE
    }
    'status' {
      & $apiExe status
      exit $LASTEXITCODE
    }
    default {
      Write-Host "Error: Unknown service action '$action'. Use: start, stop, restart, status"
      exit 1
    }
  }
}

# Other commands
switch ($Command) {
  'doctor' {
    exit Invoke-Doctor
  }
  'run' {
    $apiExe = Get-NetvanApiExe
    if (-not $apiExe) {
      Write-Host "Error: netvan-api.exe not found. Build it first:"
      Write-Host "  cd netvan-api"
      Write-Host "  cargo build --release"
      exit 1
    }
    & $apiExe run
    exit $LASTEXITCODE
  }
  'install' {
    $apiExe = Get-NetvanApiExe
    if (-not $apiExe) {
      Write-Host "Error: netvan-api.exe not found. Build it first:"
      Write-Host "  cd netvan-api"
      Write-Host "  cargo build --release"
      exit 1
    }
    & $apiExe install
    exit $LASTEXITCODE
  }
  'uninstall' {
    $apiExe = Get-NetvanApiExe
    if (-not $apiExe) {
      Write-Host "Error: netvan-api.exe not found. Build it first:"
      Write-Host "  cd netvan-api"
      Write-Host "  cargo build --release"
      exit 1
    }
    & $apiExe uninstall
    exit $LASTEXITCODE
  }
  default {
    Write-Host "Error: Unknown command '$Command'"
    Show-Help
    exit 1
  }
}
