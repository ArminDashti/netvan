#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Post-setup install: register WinSW services for API (9050) and WebUI (9051).
.DESCRIPTION
  Called by NetvaSetup.exe after files are copied under the install directory.
  Does not drop existing ProgramData SQLite unless -WipeData is passed.
#>
param(
  [string]$InstallDir = $PSScriptRoot,
  [int]$ApiPort = 9050,
  [int]$WebUiPort = 9051,
  [string]$ApiServiceName = 'netvan-api',
  [string]$WebUiServiceName = 'netvan-webui',
  [switch]$WipeData
)

$ErrorActionPreference = 'Stop'

$InstallDir = (Resolve-Path -LiteralPath $InstallDir).Path
$ApiExe = Join-Path $InstallDir 'netvan-api.exe'
$Winsw = Join-Path $InstallDir 'winsw.exe'
$WebUiRoot = Join-Path $InstallDir 'webui'
$ServeScript = Join-Path $InstallDir 'Serve-WebUi.ps1'
$ApiXml = Join-Path $InstallDir 'netvan-api.xml'
$WebXml = Join-Path $InstallDir 'netvan-webui.xml'
$DataDir = Join-Path $env:ProgramData 'Netvan\NetvanApi'
$Bind = "127.0.0.1:$ApiPort"
$StatePath = Join-Path $InstallDir 'install-state.json'

function Invoke-WinswSafe([string[]]$Args) {
  & $Winsw @Args 2>$null | Out-Null
}

function Write-ApiXml {
  $dataEsc = [System.Security.SecurityElement]::Escape($DataDir)
  $binEsc = [System.Security.SecurityElement]::Escape($ApiExe)
  $wdEsc = [System.Security.SecurityElement]::Escape($InstallDir)
  @"
<?xml version="1.0" encoding="UTF-8"?>
<service>
  <id>$ApiServiceName</id>
  <name>$ApiServiceName</name>
  <description>Netvan API (packaged install)</description>
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
"@ | Set-Content -Path $ApiXml -Encoding UTF8
}

function Write-WebXml {
  $ps = (Get-Command powershell.exe).Source
  $psEsc = [System.Security.SecurityElement]::Escape($ps)
  $args = "-NoProfile -ExecutionPolicy Bypass -File `"$ServeScript`" -Root `"$WebUiRoot`" -Port $WebUiPort -HostAddress 127.0.0.1"
  $argsEsc = [System.Security.SecurityElement]::Escape($args)
  $wdEsc = [System.Security.SecurityElement]::Escape($InstallDir)
  $logEsc = [System.Security.SecurityElement]::Escape((Join-Path $DataDir 'webui-logs'))
  @"
<?xml version="1.0" encoding="UTF-8"?>
<service>
  <id>$WebUiServiceName</id>
  <name>$WebUiServiceName</name>
  <description>Netvan WebUI static server (packaged install)</description>
  <executable>$psEsc</executable>
  <arguments>$argsEsc</arguments>
  <workingdirectory>$wdEsc</workingdirectory>
  <logpath>$logEsc</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>4096</sizeThreshold>
    <keepFiles>4</keepFiles>
  </log>
  <onfailure action="restart" delay="10 sec"/>
</service>
"@ | Set-Content -Path $WebXml -Encoding UTF8
}

foreach ($need in @($ApiExe, $Winsw, $ServeScript, $WebUiRoot)) {
  if (-not (Test-Path -LiteralPath $need)) {
    throw "Missing required install file/folder: $need"
  }
}

if ($WipeData -and (Test-Path -LiteralPath $DataDir)) {
  Write-Host "==> wiping data dir $DataDir"
  Remove-Item -LiteralPath $DataDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataDir 'webui-logs') | Out-Null

# Prefer WinSW over any prior native sc-managed service with the same names.
# Native uninstall prints to stderr when the service is already gone; with
# $ErrorActionPreference=Stop that must not abort before WinSW registration.
$nativeCandidates = @(
  $ApiExe,
  (Join-Path $env:ProgramFiles 'Netvan\netvan-api.exe')
) | Select-Object -Unique
foreach ($exe in $nativeCandidates) {
  if (-not (Test-Path -LiteralPath $exe)) { continue }
  foreach ($action in @('stop', 'uninstall')) {
    try {
      $prevEap = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      & $exe $action 2>&1 | Out-Null
    } catch {
      # best-effort cleanup only
    } finally {
      $ErrorActionPreference = $prevEap
    }
  }
}

Write-ApiXml
Write-WebXml

foreach ($pair in @(
    @{ Name = $ApiServiceName; Xml = $ApiXml },
    @{ Name = $WebUiServiceName; Xml = $WebXml }
  )) {
  Write-Host "==> (re)install service $($pair.Name)"
  Invoke-WinswSafe @('stop', $pair.Xml)
  Invoke-WinswSafe @('uninstall', $pair.Xml)
  & $Winsw install $pair.Xml
  if ($LASTEXITCODE -ne 0) { throw "winsw install failed for $($pair.Name) ($LASTEXITCODE)" }
  & $Winsw start $pair.Xml
  if ($LASTEXITCODE -ne 0) { throw "winsw start failed for $($pair.Name) ($LASTEXITCODE)" }
}

@{
  installed     = $true
  install_dir   = $InstallDir
  ports         = @{ api = $ApiPort; webui = $WebUiPort }
  data_dir      = $DataDir
  api_service   = $ApiServiceName
  webui_service = $WebUiServiceName
  installed_at  = (Get-Date).ToString('o')
} | ConvertTo-Json -Depth 6 | Set-Content -Path $StatePath -Encoding UTF8

Write-Host "Done."
Write-Host "  API   http://$Bind"
Write-Host "  WebUI http://127.0.0.1:$WebUiPort"
Write-Host "  Data  $DataDir"
