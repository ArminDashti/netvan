#Requires -Version 5.1
<#
.SYNOPSIS
  Export NetvaSetup.exe then install Netvan (API :9050, WebUI :9051).
.DESCRIPTION
  1) Builds release API + WebUI
  2) Stages payload under release\staging
  3) Compiles Inno Setup → release\NetvaSetup.exe
  4) Runs the setup (elevated) to install and start services

  Usage (elevated recommended for the install step):
    powershell -ExecutionPolicy Bypass -File .\scripts\export-exe-and-install.ps1

  Export only:
    powershell -ExecutionPolicy Bypass -File .\scripts\export-exe-and-install.ps1 -SkipInstall
#>
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ReleaseDir = '',
  [int]$ApiPort = 9050,
  [int]$WebUiPort = 9051,
  [string]$InnoCompiler = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
  [string]$WinswUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe',
  [switch]$SkipInstall,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ReleaseDir)) {
  $ReleaseDir = Join-Path $ProjectRoot 'release'
}

$ScriptDir = $PSScriptRoot
$SetupDir = Join-Path $ScriptDir 'setup'
$StagingDir = Join-Path $ReleaseDir 'staging'
$SetupExe = Join-Path $ReleaseDir 'NetvaSetup.exe'
$IssPath = Join-Path $SetupDir 'netvan-setup.iss'
$ApiRoot = Join-Path $ProjectRoot 'netvan-api'
$WebUiRoot = Join-Path $ProjectRoot 'netvan-webui'
$ApiBindUrl = "http://127.0.0.1:$ApiPort"

function Test-IsElevated {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-InstalledRustTargets {
  $raw = & rustup target list --installed 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $raw) { return @() }
  return @($raw | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
}

function Resolve-ApiCargoTarget {
  # Prefer gnu only when that std target is installed; otherwise use host MSVC.
  $installed = Get-InstalledRustTargets
  $gnu = 'x86_64-pc-windows-gnu'
  $msvc = 'x86_64-pc-windows-msvc'
  if ($installed -contains $gnu) { return $gnu }
  if ($installed -contains $msvc) { return $msvc }
  return $msvc
}

function Find-ApiBinary {
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

function Build-Api {
  if (-not (Test-Path -LiteralPath $ApiRoot)) { throw "Missing API root: $ApiRoot" }
  $target = Resolve-ApiCargoTarget
  Push-Location $ApiRoot
  try {
    Write-Host "==> cargo build -p netvan-api --release --target $target"
    # Out-Host: native stdout must not join the function success stream (return pollution).
    cargo build -p netvan-api --release --target $target | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed ($LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
  $bin = Find-ApiBinary
  if (-not $bin) { throw 'netvan-api.exe not found under target/*/release' }
  return ,$bin
}

function Build-WebUi {
  if (-not (Test-Path -LiteralPath $WebUiRoot)) { throw "Missing WebUI root: $WebUiRoot" }
  Push-Location $WebUiRoot
  try {
    Write-Host "==> npm run build (VITE_NETVAN_API_URL=$ApiBindUrl)"
    $env:VITE_NETVAN_API_URL = $ApiBindUrl
    # Out-Host: npm prints to stdout; without this, $webDist becomes that text + dist path.
    npm run build | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed ($LASTEXITCODE)" }
  } finally {
    Pop-Location
    Remove-Item Env:VITE_NETVAN_API_URL -ErrorAction SilentlyContinue
  }
  $dist = Join-Path $WebUiRoot 'dist'
  if (-not (Test-Path -LiteralPath $dist)) { throw "WebUI dist missing: $dist" }
  return ,$dist
}

function Ensure-Winsw([string]$DestPath) {
  if (Test-Path -LiteralPath $DestPath) { return }
  Write-Host "==> downloading WinSW → $DestPath"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $lastErr = $null
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      Invoke-WebRequest -Uri $WinswUrl -OutFile $DestPath -UseBasicParsing
      if (Test-Path -LiteralPath $DestPath) { return }
    } catch {
      $lastErr = $_
      Write-Host "    WinSW download attempt $attempt failed: $($_.Exception.Message)"
      Start-Sleep -Seconds (2 * $attempt)
    }
  }
  throw "WinSW download failed from $WinswUrl : $lastErr"
}

function Clear-Staging {
  if (Test-Path -LiteralPath $StagingDir) {
    Remove-Item -LiteralPath $StagingDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $StagingDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $StagingDir 'webui') | Out-Null
}

function Stage-Payload([string]$ApiBinary, [string]$WebDist) {
  Write-Host "==> staging payload → $StagingDir"
  if (-not (Test-Path -LiteralPath $ApiBinary)) { throw "API binary missing: $ApiBinary" }
  if (-not (Test-Path -LiteralPath $WebDist)) { throw "WebUI dist missing: $WebDist" }
  Clear-Staging
  Copy-Item -LiteralPath $ApiBinary -Destination (Join-Path $StagingDir 'netvan-api.exe') -Force
  Copy-Item -LiteralPath (Join-Path $SetupDir 'Serve-WebUi.ps1') -Destination $StagingDir -Force
  Copy-Item -LiteralPath (Join-Path $SetupDir 'Install-Payload.ps1') -Destination $StagingDir -Force
  Copy-Item -LiteralPath (Join-Path $SetupDir 'Uninstall-Payload.ps1') -Destination $StagingDir -Force
  Copy-Item -Path (Join-Path $WebDist '*') -Destination (Join-Path $StagingDir 'webui') -Recurse -Force
  Ensure-Winsw -DestPath (Join-Path $StagingDir 'winsw.exe')

  @{
    api_port   = $ApiPort
    webui_port = $WebUiPort
    api_url    = $ApiBindUrl
    built_at   = (Get-Date).ToString('o')
  } | ConvertTo-Json | Set-Content -Path (Join-Path $StagingDir 'ports.json') -Encoding UTF8
}

function Export-SetupExe {
  if (-not (Test-Path -LiteralPath $InnoCompiler)) {
    throw "Inno Setup compiler not found: $InnoCompiler"
  }
  if (-not (Test-Path -LiteralPath $IssPath)) {
    throw "Missing ISS script: $IssPath"
  }
  New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
  if (Test-Path -LiteralPath $SetupExe) {
    Remove-Item -LiteralPath $SetupExe -Force
  }

  # Absolute paths for ISCC defines (forward slashes work best with Inno)
  $stagingAbs = ($StagingDir -replace '\\', '/')
  $outputAbs = ($ReleaseDir -replace '\\', '/')

  Write-Host "==> compiling setup → $SetupExe"
  & $InnoCompiler `
    "/DStagingDir=$stagingAbs" `
    "/DOutputDir=$outputAbs" `
    "/DApiPort=$ApiPort" `
    "/DWebUiPort=$WebUiPort" `
    $IssPath | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "ISCC failed ($LASTEXITCODE)" }
  if (-not (Test-Path -LiteralPath $SetupExe)) {
    throw "Expected setup exe missing: $SetupExe"
  }
  return ,((Resolve-Path -LiteralPath $SetupExe).Path)
}

function Install-Setup([string]$ExePath) {
  if (-not (Test-IsElevated)) {
    Write-Host '==> re-launching setup elevated...'
    $p = Start-Process -FilePath $ExePath -Verb RunAs -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "NetvaSetup.exe exited $($p.ExitCode)" }
    return
  }
  Write-Host "==> running $ExePath /VERYSILENT /SUPPRESSMSGBOXES /NORESTART"
  $p = Start-Process -FilePath $ExePath -ArgumentList @(
    '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-'
  ) -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "NetvaSetup.exe exited $($p.ExitCode)" }
}

# --- main ---
Write-Host "ProjectRoot : $ProjectRoot"
Write-Host "ReleaseDir  : $ReleaseDir"
Write-Host "Ports       : API $ApiPort / WebUI $WebUiPort"

if (-not $SkipBuild) {
  $apiBin = Build-Api
  $webDist = Build-WebUi
} else {
  $apiBin = Find-ApiBinary
  if (-not $apiBin) { throw 'SkipBuild set but netvan-api.exe not found' }
  $webDist = Join-Path $WebUiRoot 'dist'
  if (-not (Test-Path -LiteralPath $webDist)) { throw "SkipBuild set but WebUI dist missing: $webDist" }
}

Stage-Payload -ApiBinary $apiBin -WebDist $webDist
$exported = Export-SetupExe
Write-Host "==> exported: $exported"

if (-not $SkipInstall) {
  Install-Setup -ExePath $exported
  Write-Host "Installed. Open http://127.0.0.1:$WebUiPort (API http://127.0.0.1:$ApiPort)"
} else {
  Write-Host 'SkipInstall set — setup exe ready, install not run.'
}
