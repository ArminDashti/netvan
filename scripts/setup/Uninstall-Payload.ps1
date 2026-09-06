#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Stop and remove WinSW services created by NetvaSetup.
.DESCRIPTION
  Does not delete ProgramData SQLite by default (keeps user data on uninstall).
#>
param(
  [string]$InstallDir = $PSScriptRoot,
  [string]$ApiServiceName = 'netvan-api',
  [string]$WebUiServiceName = 'netvan-webui',
  [switch]$WipeData
)

$ErrorActionPreference = 'Stop'
$InstallDir = (Resolve-Path -LiteralPath $InstallDir).Path
$Winsw = Join-Path $InstallDir 'winsw.exe'
$ApiXml = Join-Path $InstallDir 'netvan-api.xml'
$WebXml = Join-Path $InstallDir 'netvan-webui.xml'
$DataDir = Join-Path $env:ProgramData 'Netvan\NetvanApi'

function Invoke-WinswSafe([string]$Xml, [string]$Action) {
  if ((Test-Path -LiteralPath $Winsw) -and (Test-Path -LiteralPath $Xml)) {
    & $Winsw $Action $Xml 2>$null | Out-Null
  }
}

Invoke-WinswSafe -Xml $WebXml -Action 'stop'
Invoke-WinswSafe -Xml $ApiXml -Action 'stop'
Invoke-WinswSafe -Xml $WebXml -Action 'uninstall'
Invoke-WinswSafe -Xml $ApiXml -Action 'uninstall'

$apiExe = Join-Path $InstallDir 'netvan-api.exe'
if (Test-Path -LiteralPath $apiExe) {
  & $apiExe stop 2>$null | Out-Null
  & $apiExe uninstall 2>$null | Out-Null
}

foreach ($name in @($ApiServiceName, $WebUiServiceName)) {
  $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if ($svc) {
    sc.exe stop $name 2>$null | Out-Null
    sc.exe delete $name 2>$null | Out-Null
  }
}

if ($WipeData -and (Test-Path -LiteralPath $DataDir)) {
  Remove-Item -LiteralPath $DataDir -Recurse -Force
}

Write-Host "Uninstall services complete."
