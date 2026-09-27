//! `netvan-cli` — interactive, colorful terminal UI for the Netvan API.

mod api;
mod state;
mod theme;
mod ui;

use anyhow::Result;
use clap::Parser;

#[derive(Parser, Debug)]
#[command(
    name = "netvan-cli",
    version,
    about = "Netvan TUI — a modern, colorful terminal dashboard + network tools",
    long_about = "Interactive terminal UI for Netvan. Talks JSON-RPC to a running \
                  Netvan API (netvan run / netvan service start) and renders a live, \
                  colorful dashboard: overview, NICs, bandwidth, latency, system, apps, \
                  plus ping / HTTP latency / traceroute / nslookup / speedtest tools."
)]
struct Args {
    /// API base URL (overrides NETVAN_API_URL)
    #[arg(long, env = "NETVAN_API_URL")]
    api: Option<String>,

    /// Snapshot poll interval in milliseconds
    #[arg(long, default_value_t = 1500)]
    poll_ms: u64,

    /// Fetch one overview snapshot as JSON and exit (headless connectivity check)
    #[arg(long)]
    dump: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let base = args
        .api
        .clone()
        .or_else(|| std::env::var("NETVAN_API_BASE").ok())
        .unwrap_or_else(default_base);

    if args.dump {
        let api = api::ApiClient::new(base.clone());
        let snap = state::fetch_overview(&api).await;
        println!("{}", serde_json::to_string_pretty(&snap)?);
        if snap.connected {
            return Ok(());
        }
        return Err(anyhow::anyhow!("no response from API at {base}"));
    }

    ui::run(base, args.poll_ms).await
}

/// Default endpoint: NETVAN_API_BIND if set, else the compiled-in default bind.
fn default_base() -> String {
    match std::env::var("NETVAN_API_BIND") {
        Ok(bind) => format!("http://{bind}"),
        Err(_) => "http://127.0.0.1:80".to_string(),
    }
}
