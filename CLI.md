# Netvan CLI

The `netvan` CLI provides a unified interface for managing the Netvan Windows service
plus an interactive, colorful terminal dashboard (`netvan tui`).

## Interactive TUI

`netvan-cli` is a full-screen, modern-colorful terminal UI (ratatui) that reads live
data from a running Netvan API over JSON-RPC (`POST /api/rpc`).

### Launch

```cmd
:: via the wrapper (finds target\release\netvan-cli.exe)
netvan tui

:: or directly
netvan-cli
netvan-cli --api http://127.0.0.1:8000
netvan-cli --poll-ms 1000
```

Environment overrides: `NETVAN_API_URL` (or `NETVAN_API_BASE`) for the endpoint,
`NETVAN_API_BIND` as a fallback (rendered as `http://<bind>`).

Headless connectivity check (prints the overview snapshot as JSON, exit code 1 if
the API cannot be reached):

```cmd
netvan-cli --dump --api http://127.0.0.1:8000
```

Build it:

```powershell
cd netvan-api
cargo build --release -p netvan-cli
```

### Tabs

| # | Tab | Shows |
| --- | --- | --- |
| 1 | Overview | CPU / memory / disk gauges, adapter summary, throughput sparkline, service status |
| 2 | NICs | adapter table (link speed, IPv4, Wi-Fi, RSSI, live rx/tx) with a selectable NIC filter |
| 3 | Bandwidth | rx/tx line chart for today plus now / avg / peak rates |
| 4 | Latency | ping RTT + HTTP total charts and link up/down events |
| 5 | System | per-core CPU bars, memory, disk volumes, thermal sensors |
| 6 | Apps | top processes by traffic today |
| 7 | Tools | run ping, HTTP latency, traceroute, nslookup, speedtest and read the output |

### Keys

- `1`…`7` jump to a tab, `Tab` / `Shift+Tab` cycle, `r` refresh, `?` help, `q` quit
- NICs / Bandwidth / Latency: `↑`/`↓` move the cursor (row 1 = all NICs), `Enter` applies the filter
- Tools: `←`/`→` switch tool, `i`/`Enter` focus the target input, `r` run, `c` clear,
  `↑`/`↓` scroll output, `a` accept the Ookla speedtest EULA

### Behavior

- The active view polls the API every 1.5 s (configurable with `--poll-ms`);
  other tabs refresh when you switch to them.
- If the API is not reachable the UI stays up and shows an OFFLINE banner with
  recovery hints.
- Tool runs (ping / traceroute / speedtest …) execute on the API host and stream
  their result back into the output panel.

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
