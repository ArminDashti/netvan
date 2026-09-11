#Requires -Version 5.1
<#
.SYNOPSIS
  Fully remove the Netvan Windows service, then install again.

.DESCRIPTION
  Runs remove.ps1 (keeps ProgramData / SQLite), then install.ps1.
  Forwards "port set <NUMBER>" to install. Without port set, install picks
  new random safe ports (fresh path after remove clears installed=true).

.EXAMPLE
  .\reinstall.ps1
  .\reinstall.ps1 port set 18000

.NOTES
  Requires Administrator.
#>
[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs
)

$ErrorActionPreference = 'Stop'

$DeployDir = $PSScriptRoot
$RemoveScript = Join-Path $DeployDir 'remove.ps1'
$InstallScript = Join-Path $DeployDir 'install.ps1'

if (-not (Test-Path -LiteralPath $RemoveScript)) {
  throw "Missing $RemoveScript"
}
if (-not (Test-Path -LiteralPath $InstallScript)) {
  throw "Missing $InstallScript"
}

Write-Host '==> reinstall: remove then install'
& $RemoveScript
# remove/install are PowerShell scripts: real failures throw. Ignore leftover native LASTEXITCODE.

Write-Host '==> reinstall: install'
if ($CliArgs -and $CliArgs.Count -gt 0) {
  & $InstallScript @CliArgs
} else {
  & $InstallScript
}

Write-Host 'Done: reinstall complete'
