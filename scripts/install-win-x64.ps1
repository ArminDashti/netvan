#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install Netvan to AppData/Netvan/ with upgrade support.

.DESCRIPTION
  Installs Netvan to %LOCALAPPDATA%\Netvan\ with:
  - settings.json
  - Netvan.exe
  - webui/ (built React PWA)
  - data/ (SQLite database)
  - uninstall.ps1

  If already installed: stops service, replaces files, preserves data/settings.
  If not installed: fresh installation.
#>

$ErrorActionPreference = "Stop"

$InstallDir = Join-Path $env:LOCALAPPDATA "Netvan"
$ExeName = "Netvan.exe"
$SettingsFile = "settings.json"
$DataDir = "data"
$WebuiDir = "webui"
$UninstallScript = "uninstall.ps1"

function Get-ScriptRoot {
    $scriptPath = $PSScriptRoot
    if (-not $scriptPath) {
        $scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    return $scriptPath
}

$ScriptRoot = Get-ScriptRoot
$RepoRoot = Split-Path -Parent $ScriptRoot

function Invoke-BestEffort {
    param(
        [Parameter(Mandatory = $true)][string]$ExePath,
        [Parameter(Mandatory = $true)][string[]]$ExeArgs
    )
    $prevEA = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $ExePath @ExeArgs 2>&1 | Out-Null
        return $LASTEXITCODE
    } catch {
        return 1
    } finally {
        $ErrorActionPreference = $prevEA
    }
}

function Invoke-NativeStrict {
    param(
        [Parameter(Mandatory = $true)][string]$ExePath,
        [Parameter(Mandatory = $true)][string[]]$ExeArgs,
        [Parameter(Mandatory = $true)][string]$Action
    )
    $prevEA = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & $ExePath @ExeArgs 2>&1 | Out-String
        $code = $LASTEXITCODE
        if ($out -and $out.Trim()) { Write-Host $out.Trim() }
        if ($code -ne 0) {
            throw "$Action failed with exit code $code"
        }
    } finally {
        $ErrorActionPreference = $prevEA
    }
}

Write-Host "==> Netvan Installer"
Write-Host "Install Directory: $InstallDir"
Write-Host "Repository Root: $RepoRoot"

$ApiDir = Join-Path $RepoRoot "netvan-api"
$WebuiDirSrc = Join-Path $RepoRoot "netvan-webui"

$SourceExe = $null
Write-Host "Building netvan-api..."
Push-Location $ApiDir
try {
    $raw = & rustup target list --installed 2>$null
    $installed = @($raw | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
    
    $target = 'x86_64-pc-windows-msvc'
    if ($installed -contains 'x86_64-pc-windows-gnu') {
        $target = 'x86_64-pc-windows-gnu'
    }
    
    Write-Host "==> cargo build -p netvan-api --release --target $target"
    cargo build -p netvan-api --release --target $target
    if ($LASTEXITCODE -ne 0) {
        throw "cargo build failed with exit code $LASTEXITCODE"
    }
    
    $builtCandidate = Join-Path $ApiDir "target\$target\release\netvan-api.exe"
    if (Test-Path -LiteralPath $builtCandidate) {
        $SourceExe = $builtCandidate
    } else {
        throw "Failed to find built executable after build: $builtCandidate"
    }
} finally {
    Pop-Location
}

Write-Host "Source executable: $SourceExe"

$WebuiDist = Join-Path $WebuiDirSrc "dist"
if (-not (Test-Path -LiteralPath $WebuiDist) -or -not (Get-ChildItem -LiteralPath $WebuiDist | Where-Object { $_.Name -eq "index.html" })) {
    Write-Host "Building netvan-webui..."
    Push-Location $WebuiDirSrc
    try {
        if (-not (Test-Path -LiteralPath (Join-Path $WebuiDirSrc "node_modules"))) {
            Write-Host "==> npm install"
            npm install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed with exit code $LASTEXITCODE"
            }
        }
        Write-Host "==> npm run build"
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path -LiteralPath $WebuiDist)) {
    throw "Web UI build output not found at $WebuiDist"
}
Write-Host "Web UI build output: $WebuiDist"

$IsUpgrade = Test-Path -LiteralPath $InstallDir

if ($IsUpgrade) {
    Write-Host "==> Existing installation detected, performing upgrade..."
    
    $InstalledExe = Join-Path $InstallDir $ExeName
    if (Test-Path -LiteralPath $InstalledExe) {
        Write-Host "==> Stopping service..."
        Invoke-BestEffort -ExePath $InstalledExe -ExeArgs @("stop") | Out-Null
    }
    
    $BackupDir = Join-Path $env:TEMP "NetvanBackup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Write-Host "==> Backing up to $BackupDir..."
    New-Item -Path $BackupDir -ItemType Directory -Force | Out-Null

    if (Test-Path -LiteralPath (Join-Path $InstallDir $SettingsFile)) {
        Copy-Item -Path (Join-Path $InstallDir $SettingsFile) -Destination (Join-Path $BackupDir $SettingsFile) -Force
    }

    if (Test-Path -LiteralPath (Join-Path $InstallDir $DataDir)) {
        Copy-Item -Path (Join-Path $InstallDir $DataDir) -Destination (Join-Path $BackupDir $DataDir) -Recurse -Force
    }
    
    Write-Host "==> Uninstalling old service..."
    if (Test-Path -LiteralPath $InstalledExe) {
        $uninstallCode = Invoke-BestEffort -ExePath $InstalledExe -ExeArgs @("uninstall")
        if ($uninstallCode -ne 0) {
            Write-Host "uninstall exited $uninstallCode (service may not have been installed)"
        }
    } else {
        Write-Host "Installed executable not found, skipping service uninstall."
    }
    
    Write-Host "==> Removing old executable and webui..."
    Remove-Item -Path $InstalledExe -Force -ErrorAction SilentlyContinue
    $InstalledWebui = Join-Path $InstallDir $WebuiDir
    if (Test-Path -LiteralPath $InstalledWebui) {
        Remove-Item -Path $InstalledWebui -Recurse -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "==> Performing fresh installation..."
    New-Item -Path $InstallDir -ItemType Directory -Force | Out-Null
}

Write-Host "==> Copying new executable..."
Copy-Item -Path $SourceExe -Destination (Join-Path $InstallDir $ExeName) -Force

Write-Host "==> Copying thermal helper (netvan-hwmon + LibreHardwareMonitor)..."
$SourceDir = Split-Path -Parent $SourceExe
$HwmonFiles = @(
    "netvan-hwmon.exe",
    "netvan-hwmon.dll",
    "netvan-hwmon.deps.json",
    "netvan-hwmon.runtimeconfig.json",
    "LibreHardwareMonitorLib.dll",
    "HidSharp.dll",
    "System.Management.dll",
    "System.IO.Ports.dll",
    "System.CodeDom.dll",
    "Mono.Posix.NETStandard.dll",
    "MonoPosixHelper.dll",
    "libMonoPosixHelper.dll"
)
foreach ($f in $HwmonFiles) {
    $src = Join-Path $SourceDir $f
    if (Test-Path -LiteralPath $src) {
        Copy-Item -Path $src -Destination (Join-Path $InstallDir $f) -Force
    } else {
        Write-Host "  (skip missing $f)"
    }
}

Write-Host "==> Copying web UI..."
$DestWebui = Join-Path $InstallDir $WebuiDir
New-Item -Path $DestWebui -ItemType Directory -Force | Out-Null
Copy-Item -Path (Join-Path $WebuiDist "*") -Destination $DestWebui -Recurse -Force

$SettingsPath = Join-Path $InstallDir $SettingsFile
if (-not (Test-Path -LiteralPath $SettingsPath)) {
    Write-Host "==> Creating default settings.json..."
    $DefaultSettings = @{
        api_bind = "127.0.0.1:80"
        app_url = "http://netvan.local"
    } | ConvertTo-Json -Depth 10
    $DefaultSettings | Out-File -FilePath $SettingsPath -Encoding utf8 -Force
}

$DataPath = Join-Path $InstallDir $DataDir
if (-not (Test-Path -LiteralPath $DataPath)) {
    Write-Host "==> Creating data directory..."
    New-Item -Path $DataPath -ItemType Directory -Force | Out-Null
}

$UninstallPath = Join-Path $InstallDir $UninstallScript
$UninstallContent = @'
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Uninstall Netvan completely.

.DESCRIPTION
  Removes Netvan installation including:
  - Windows service named Netvan
  - All files in %LOCALAPPDATA%\Netvan\
  - Start menu shortcuts (if any)
#>

$ErrorActionPreference = "Stop"

$InstallDir = Join-Path $env:LOCALAPPDATA "Netvan"
$ExeName = "Netvan.exe"

Write-Host "==> Netvan Uninstaller"
Write-Host "Install Directory: $InstallDir"

if (-not (Test-Path -LiteralPath $InstallDir)) {
    Write-Host "Netvan is not installed."
    exit 0
}

$InstalledExe = Join-Path $InstallDir $ExeName
function Invoke-BestEffort {
    param(
        [Parameter(Mandatory = $true)][string]$ExePath,
        [Parameter(Mandatory = $true)][string[]]$ExeArgs
    )
    $prevEA = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $ExePath @ExeArgs 2>&1 | Out-Null
        return $LASTEXITCODE
    } catch {
        return 1
    } finally {
        $ErrorActionPreference = $prevEA
    }
}
if (Test-Path -LiteralPath $InstalledExe) {
    Write-Host "==> Stopping service..."
    Invoke-BestEffort -ExePath $InstalledExe -ExeArgs @("stop") | Out-Null

    Write-Host "==> Uninstalling service..."
    $uninstallCode = Invoke-BestEffort -ExePath $InstalledExe -ExeArgs @("uninstall")
    if ($uninstallCode -ne 0) {
        Write-Host "uninstall exited $uninstallCode (service may not have been installed)"
    }
}

Write-Host "==> Removing installation directory..."
Remove-Item -Path $InstallDir -Recurse -Force

Write-Host "==> Netvan uninstalled successfully."
'@

$UninstallContent | Out-File -FilePath $UninstallPath -Encoding utf8 -Force

$NewExe = Join-Path $InstallDir $ExeName
Write-Host "==> Installing service 'Netvan' (covers UI + API)..."
Invoke-NativeStrict -ExePath $NewExe -ExeArgs @("install") -Action "Service installation"

Write-Host "==> Starting service..."
Invoke-NativeStrict -ExePath $NewExe -ExeArgs @("start") -Action "Service start"

Write-Host "==> Service status:"
Invoke-NativeStrict -ExePath $NewExe -ExeArgs @("status") -Action "Service status"

Write-Host ""
Write-Host "==> Installation complete!"
Write-Host "Installed to: $InstallDir"
Write-Host "Service: Netvan (running) — covers both Web UI and API"
Write-Host ""
Write-Host "To uninstall, run: $UninstallPath"
Write-Host ""
Write-Host "IMPORTANT: Add this entry to your hosts file (C:\Windows\System32\drivers\etc\hosts):"
Write-Host "127.0.0.1  netvan.local"
Write-Host ""
Write-Host "Then open: http://netvan.local"
