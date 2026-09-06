; Netvan packaged installer — compiled by scripts\export-exe-and-install.ps1
; Do not run ISCC on this file alone without staging payload under release\staging.

#define MyAppName "Netvan"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Armin Dashti"
#define MyAppExeName "netvan-api.exe"

#ifndef StagingDir
  #define StagingDir "..\..\release\staging"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\release"
#endif
#ifndef ApiPort
  #define ApiPort "9050"
#endif
#ifndef WebUiPort
  #define WebUiPort "9051"
#endif

[Setup]
AppId={{A6C3E2F1-9B4D-4E8A-9C21-7F0E1D2C3B4A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Netvan
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=NetvaSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#StagingDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Netvan WebUI"; Filename: "http://127.0.0.1:{#WebUiPort}"
Name: "{group}\Uninstall Netvan"; Filename: "{uninstallexe}"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Install-Payload.ps1"" -InstallDir ""{app}"" -ApiPort {#ApiPort} -WebUiPort {#WebUiPort}"; \
  StatusMsg: "Installing Netvan services (API {#ApiPort}, WebUI {#WebUiPort})..."; \
  Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Uninstall-Payload.ps1"" -InstallDir ""{app}"""; \
  RunOnceId: "UninstallNetvanServices"; \
  Flags: runhidden waituntilterminated
