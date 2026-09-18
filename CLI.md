# Netvan CLI

The `netvan` CLI provides a unified interface for managing the Netvan Windows service.

## Installation

### Local (Project Directory)
Use the CLI directly from the project root:
```powershell
powershell -ExecutionPolicy Bypass -File .\netvan.ps1 <command>
```

Or use the batch wrapper:
```cmd
netvan.bat <command>
```

### Global Installation
Run the installation script to add `netvan` to your PATH:

**For current user:**
```powershell
.\scripts\install-cli.ps1
```

**For system-wide installation (requires Administrator):**
```powershell
# Run PowerShell as Administrator
.\scripts\install-cli.ps1
```

After installation, restart your terminal and use:
```cmd
netvan <command>
```

## Commands

### Service Management
- `netvan install` - Install the Netvan Windows service
- `netvan service start` - Start the Netvan Windows service
- `netvan service stop` - Stop the Netvan Windows service  
- `netvan service restart` - Restart the Netvan Windows service
- `netvan service status` - Show service install/running status

### Development
- `netvan run` - Run in foreground (dev/console mode)
- `netvan doctor` - Run diagnostics and checks

### Maintenance
- `netvan uninstall` - Uninstall the Windows service
- `netvan help` - Show help message

## Examples

```cmd
# Install the service
netvan install

# Check service status
netvan service status

# Start the service
netvan service start

# Run in foreground for development
netvan run

# Run diagnostics
netvan doctor

# Show help
netvan help
```

## How It Works

The `netvan` CLI is a wrapper that delegates to the `netvan-api` binary. It:
1. Locates the `netvan-api.exe` in the project's build directory
2. Delegates service commands to the native Windows service implementation
3. Provides additional convenience commands like `doctor` for diagnostics

## Requirements

- Windows 10 or later
- PowerShell 5.1 or later
- `netvan-api.exe` built from the `netvan-api` crate

## Building netvan-api

If `netvan-api.exe` is not found, build it:
```powershell
cd netvan-api
cargo build --release
```

The CLI will look for the binary in:
- `netvan-api/target/release/netvan-api.exe`
- `netvan-api/target/x86_64-pc-windows-gnu/release/netvan-api.exe`
- `netvan-api/target/x86_64-pc-windows-msvc/release/netvan-api.exe`
