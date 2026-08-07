#!/usr/bin/env python3
"""
FireXPanel SMS Gateway CLI – Provider Terminal (Enhanced)
==========================================================
Interactive terminal client with full client details and live message monitoring.

Commands:
    list                 Show online/offline clients with phone, network, balance, etc.
    info <id>            Show full client details (all fields).
    getnumber <service>  Allocate a number for service (e.g. tg, wa, go)
    status <id>          Poll for OTP code
    setstatus <id> <code>  Set status (1,3,6,8)
    messages <id>        Show last 5 messages for client
    balance              Show account balance
    monitor <id>         Continuously poll for new SMS and show last 5 messages live
    help                 Show this help
    quit                 Exit
"""

import asyncio
import re
import time
import sys
import os
import json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from typing import Optional, Dict, Any, List
from datetime import datetime

import httpx
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.layout import Layout
from rich.live import Live
from rich.prompt import Prompt
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich import box
from rich.markdown import Markdown
from app.services.sms_parser import (
    extract_highest_frequency_number_and_carrier_async
)

# -----------------------------------------------------------------------------
# Configuration & Local In-Memory Cache
# -----------------------------------------------------------------------------
API_BASE = "http://127.0.0.1:8000"
API_KEY = os.environ.get("FX_API_KEY", "your-random-secret-key")
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

console = Console()

# Local In-Memory Cache for Client Phone Number and Operator (Resolved only once!)
RESOLVED_CLIENT_CACHE: Dict[str, Dict[str, Any]] = {}
LAST_PAGE_CLIENT_IDS: List[str] = []

# -----------------------------------------------------------------------------
# Helper: relative time formatting
# -----------------------------------------------------------------------------
def format_relative_time(ts: Any) -> str:
    """Format timestamp (ms, sec, or ISO string) to natural human relative time."""
    if not ts or ts == "Never" or ts == "N/A":
        return "Never"

    now = time.time()
    seconds_ago = 0.0

    try:
        val = float(ts)
        if val > 1e11:  # milliseconds
            val = val / 1000.0
        seconds_ago = now - val
    except Exception:
        try:
            struct_t = time.strptime(str(ts).split(".")[0], "%Y-%m-%d %H:%M:%S")
            val = time.mktime(struct_t)
            seconds_ago = now - val
        except Exception:
            return "Never"

    if seconds_ago < 0:
        seconds_ago = 0

    if seconds_ago < 10:
        return "[bold green]Just now[/]"
    elif seconds_ago < 60:
        return f"[green]{int(seconds_ago)}s ago[/]"
    elif seconds_ago < 3600:
        mins = int(seconds_ago // 60)
        return f"[yellow]{mins}m ago[/]"
    elif seconds_ago < 86400:
        hrs = int(seconds_ago // 3600)
        return f"[cyan]{hrs}h ago[/]"
    elif seconds_ago < 604800:
        days = int(seconds_ago // 86400)
        return f"[dim]{days}d ago[/]"
    elif seconds_ago < 2592000:
        wks = int(seconds_ago // 604800)
        return f"[dim]{wks}w ago[/]"
    else:
        mths = int(seconds_ago // 2592000)
        return f"[dim]{mths}mo ago[/]"

# -----------------------------------------------------------------------------
# HTTP helpers with redirect following
# -----------------------------------------------------------------------------
async def get(path: str, params: Optional[Dict] = None):
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        resp = await client.get(f"{API_BASE}{path}", params=params, headers=HEADERS)
        resp.raise_for_status()
        return resp.text

async def get_json(path: str, params: Optional[Dict] = None):
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        resp = await client.get(f"{API_BASE}{path}", params=params, headers=HEADERS)
        resp.raise_for_status()
        return resp.json()

# -----------------------------------------------------------------------------
# Helper: format values
# -----------------------------------------------------------------------------
def fmt(val: Any, default: str = "—") -> str:
    if val is None or val == "" or val == "N/A":
        return default
    return str(val)

def fmt_phone(val: Any, default: str = "—") -> str:
    """Format 10-digit Indian numbers or raw numbers uniformly with +91 country code prefix."""
    if val is None or val == "" or val == "N/A" or val == "None" or val == "—":
        return default
    
    num_str = str(val).strip().replace(" ", "").replace("-", "")
    if num_str.startswith("+"):
        return num_str
    if num_str.startswith("91") and len(num_str) == 12:
        return f"+{num_str}"
    if num_str.startswith("0") and len(num_str) == 11:
        return f"+91{num_str[1:]}"
    if len(num_str) == 10 and num_str[0] in "6789":
        return f"+91{num_str}"
    return f"+91{num_str}" if num_str.isdigit() and len(num_str) == 10 else num_str

# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------
async def resolve_client_phone_and_network(cid: str, data: dict):
    """
    Extract phone number and network operator using local cache, client data, 
    SIM info, smsAnalysis, and 150-message highest-frequency batch analysis.
    """
    if cid in RESOLVED_CLIENT_CACHE:
        cached = RESOLVED_CLIENT_CACHE[cid]
        if cached.get("phone") and cached.get("network"):
            return cached["phone"], cached["network"]

    phone = data.get("mobNo") or data.get("phoneNumber") or data.get("number")
    network = data.get("service_provider") or data.get("network") or data.get("operator")

    # 1. Check SIMs array
    sims = data.get("sims", [])
    if isinstance(sims, list) and sims:
        first_sim = sims[0]
        if isinstance(first_sim, dict):
            if not phone:
                phone = first_sim.get("phoneNumber") or first_sim.get("number")
            if not network:
                network = first_sim.get("carrier") or first_sim.get("operator")

    # 2. Check smsAnalysis
    sms_analysis = data.get("smsAnalysis", {})
    if isinstance(sms_analysis, dict):
        if not phone:
            phones = sms_analysis.get("phoneNumbers", [])
            if phones:
                phone = phones[0]
        if not network:
            nets = sms_analysis.get("networks", [])
            if nets:
                network = nets[0]

    # 3. 150-Message Batch Analysis (No sender filtering -> Find highest frequency number & carrier)
    if not phone or not network:
        try:
            msgs = await get_json(f"/api/v1/clients/{cid}/messages?limit=150")
            if isinstance(msgs, list) and msgs:
                freq_phone, freq_net = await extract_highest_frequency_number_and_carrier_async(msgs)
                if not phone and freq_phone:
                    phone = freq_phone
                if not network and freq_net:
                    network = freq_net
        except Exception:
            pass

    # Format phone with +91 uniformly
    if phone:
        phone = fmt_phone(phone)

    # Cache resolved result locally in memory
    RESOLVED_CLIENT_CACHE[cid] = {
        "phone": phone,
        "network": network
    }

    # Auto-promote to Firebase root asynchronously (0ms future reads, zero double-checks)
    if phone or network:
        try:
            from app.crud import firebase_crud as crud
            payload = {}
            if phone:
                payload["mobNo"] = phone
                payload["phoneNumber"] = phone
            if network:
                payload["service_provider"] = network
                payload["network"] = network
            crud._CRUD_EXECUTOR.submit(crud.update_client, cid, payload)
        except Exception:
            pass

    return phone, network

async def cmd_list(page: int = 1, sort_by: str = "online"):
    """
    List clients with 10 items per page and dynamic live skeleton loading.
    sort_by: 'online' (online devices first) or 'sms'/'recent'/'activity' (newest SMS timestamp first).
    """
    global LAST_PAGE_CLIENT_IDS
    try:
        clients = await get_json("/api/v1/clients/")
    except Exception as e:
        console.print(f"[bold red]Error fetching clients: {e}[/]")
        return

    if not clients:
        console.print("[yellow]No clients found.[/]")
        return

    def get_ts(cdata: dict) -> float:
        ts = cdata.get("lastMessageTime") or cdata.get("timestamp") or 0
        try:
            return float(ts)
        except Exception:
            return 0.0

    # Sort clients based on filter option
    if sort_by.lower() in ("sms", "recent", "activity", "time"):
        sorted_clients = sorted(
            clients.items(),
            key=lambda x: get_ts(x[1]),
            reverse=True
        )
        mode_label = "Newest SMS First"
    else:
        sorted_clients = sorted(
            clients.items(),
            key=lambda x: (0 if x[1].get("status") else 1, -get_ts(x[1]), x[0])
        )
        mode_label = "Online First"

    total_clients = len(sorted_clients)
    page_size = 10
    total_pages = max(1, (total_clients + page_size - 1) // page_size)

    if page < 1:
        page = 1
    elif page > total_pages:
        page = total_pages

    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    page_items = sorted_clients[start_idx:end_idx]

    LAST_PAGE_CLIENT_IDS = [cid for cid, _ in page_items]

    # Pre-render initial skeleton table immediately
    rows_data = []
    for idx, (cid, data) in enumerate(page_items, start=1):
        phone = data.get("mobNo") or data.get("phoneNumber") or data.get("number")
        network = data.get("service_provider") or data.get("network") or data.get("operator")
        battery = data.get("battery", "N/A")
        status = "Online" if data.get("status") else "Offline"
        fb_id = data.get("firebase_id") or data.get("firebaseId") or "node_1"
        last_time_ts = data.get("lastMessageTime") or data.get("timestamp")
        last_active = format_relative_time(last_time_ts)

        rows_data.append({
            "index": str(idx),
            "cid": cid,
            "firebase_id": fb_id,
            "phone": phone,
            "network": network,
            "battery": battery,
            "last_active": last_active,
            "status": status,
            "resolved": bool(phone and network),
            "data": data
        })

    def render_table():
        table = Table(
            title=f"All Clients ({mode_label} – Page {page}/{total_pages} – {total_clients} Total)", 
            box=box.ROUNDED
        )
        table.add_column("#", style="bold yellow", justify="right")
        table.add_column("Client ID", style="cyan")
        table.add_column("Firebase ID", style="magenta")
        table.add_column("Phone Number", style="green")
        table.add_column("Network Operator", style="blue")
        table.add_column("Battery", justify="center")
        table.add_column("Last Active / SMS", justify="center")
        table.add_column("Status", justify="center")

        for r in rows_data:
            p_str = fmt_phone(r["phone"]) if r["phone"] else ("[dim]Loading...[/]" if not r["resolved"] else "—")
            n_str = fmt(r["network"]) if r["network"] else ("[dim]Loading...[/]" if not r["resolved"] else "—")
            batt_str = str(r["battery"]) + ("%" if str(r["battery"]).isdigit() else "")
            table.add_row(
                f"[{r['index']}]",
                r["cid"],
                r["firebase_id"],
                p_str,
                n_str,
                batt_str,
                r["last_active"],
                f"[{'green' if r['status']=='Online' else 'red'}]{r['status']}[/]"
            )
        return table

    # Live update table as resolving completes in parallel
    sem = asyncio.Semaphore(20)
    with Live(render_table(), console=console, refresh_per_second=4) as live:
        async def resolve_item(idx, item):
            if not item["resolved"]:
                async with sem:
                    p, n = await resolve_client_phone_and_network(item["cid"], item["data"])
                    item["phone"] = p
                    item["network"] = n
                    item["resolved"] = True
                    live.update(render_table())

        tasks = [resolve_item(i, item) for i, item in enumerate(rows_data)]
        await asyncio.gather(*tasks)

    console.print(
        f"[dim]Showing {len(page_items)} of {total_clients} clients. "
        f"Use [bold cyan]list {page+1}[/] for next page, [bold cyan]list {max(1, page-1)}[/] for previous page.[/]\n"
    )

async def cmd_info(client_id: str):
    """Show full client details in a rich formatted panel (like FireXPanel UI)."""
    client_id = resolve_target_client_id(client_id)
    try:
        client = await get_json(f"/api/v1/clients/{client_id}")
    except Exception as e:
        console.print(f"[bold red]Error: {e}[/]")
        return

    if not client:
        console.print("[yellow]Client not found.[/]")
        return

    # Unwrap if backend wraps object under client_id key
    if isinstance(client, dict) and client_id in client and isinstance(client[client_id], dict):
        client = client[client_id]

    # Resolve phone number and network operator using cache / extractor
    phone, network = await resolve_client_phone_and_network(client_id, client)

    items = []

    # 1. Basic status
    is_online = bool(client.get("status"))
    status_str = "Online" if is_online else "Offline"
    battery = client.get("battery", "N/A")
    last_time = client.get("lastMessageTime") or client.get("timestamp")
    
    if last_time:
        try:
            last_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(float(last_time)/1000))
        except Exception:
            last_time_str = str(last_time)
    else:
        last_time_str = "Never"

    fb_id = client.get("firebase_id") or client.get("firebaseId") or "node_1"
    items.append(f"[bold]Firebase ID:[/] [bold magenta]{fb_id}[/]")
    items.append(f"[bold]Status:[/] [{'green' if is_online else 'red'}]{status_str}[/]")
    items.append(f"[bold]Battery:[/] {battery}%" if isinstance(battery, int) or (isinstance(battery, str) and battery.isdigit()) else f"[bold]Battery:[/] {battery}")
    items.append(f"[bold]Phone Number:[/] [bold green]{fmt_phone(phone)}[/]")
    items.append(f"[bold]Network Operator:[/] [bold blue]{network if network else '—'}[/]")
    items.append(f"[bold]Last Message Time:[/] {last_time_str}")

    # 2. SIM Cards array / info
    sims = client.get("sims", [])
    if isinstance(sims, list) and sims:
        items.append("[bold]SIM Cards:[/]")
        for i, s in enumerate(sims):
            if isinstance(s, dict):
                sp = s.get("phoneNumber") or s.get("number") or "N/A"
                sc = s.get("carrier") or s.get("operator") or "N/A"
                ss = s.get("slot", i+1)
                items.append(f"  Slot {ss}: {sp} ({sc})")

    # 3. Device info
    device = client.get("device") or client.get("model")
    android = client.get("android") or client.get("os") or client.get("version")
    ip = client.get("ip") or client.get("ipAddress")
    storage = client.get("storage")
    cpu = client.get("cpu") or client.get("cpuArch")
    sdk = client.get("sdk") or client.get("sdkVersion")
    if any([device, android, ip, storage, cpu, sdk]):
        items.append("[bold]Device Specs:[/]")
        if device: items.append(f"  Model: {device}")
        if android: items.append(f"  OS / Android: {android}")
        if ip: items.append(f"  IP Address: {ip}")
        if storage: items.append(f"  Storage: {storage}")
        if cpu: items.append(f"  CPU Arch: {cpu}")
        if sdk: items.append(f"  SDK Version: {sdk}")

    # 4. Outgoing / Messages Log
    msgs = client.get("messages")
    if msgs and isinstance(msgs, dict):
        items.append(f"[bold]Messages Log:[/] {len(msgs)} entries")
    elif msgs and isinstance(msgs, list):
        items.append(f"[bold]Messages Log:[/] {len(msgs)} entries")

    # 5. Webhook Event
    webhook = client.get("webhookEvent")
    if webhook and isinstance(webhook, dict):
        items.append("[bold]Webhook Event:[/]")
        for k, v in webhook.items():
            if isinstance(v, dict):
                items.append(f"  {k}: {v.get('status', 'pending')}")
            else:
                items.append(f"  {k}: {v}")

    # 6. Pending Commands
    cmds = client.get("commands")
    if cmds and isinstance(cmds, dict):
        items.append("[bold]Pending Commands:[/]")
        for cmd_name, cmd_data in cmds.items():
            status_cmd = cmd_data.get("status", "unknown") if isinstance(cmd_data, dict) else str(cmd_data)
            items.append(f"  {cmd_name}: {status_cmd}")

    content = "\n".join(items)
    console.print(Panel(content, title=f"[bold cyan]Client {client_id}[/]", expand=False))

async def cmd_getnumber(service: str):
    """Allocate a client for the given service."""
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("[cyan]Allocating number...", total=None)
        try:
            resp_text = await get("/stubs/handler_api.php", params={
                "api_key": "test",
                "action": "getNumber",
                "service": service
            })
        except Exception as e:
            console.print(f"[bold red]Error: {e}[/]")
            return

    # Try parsing JSON response
    try:
        data = json.loads(resp_text)
        if isinstance(data, dict) and "activationId" in data:
            act_id = str(data["activationId"])
            number = fmt_phone(data.get("phoneNumber"))
            console.print(f"[bold green]✅ Number allocated![/]")
            console.print(f"[bold]Activation ID:[/] [yellow]{act_id}[/]")
            console.print(f"[bold]Phone:[/] [yellow]{number}[/]")
            console.print(f"[bold]Service:[/] [yellow]{service}[/]")
            console.print(f"[bold]Activation Time:[/] {data.get('activationTime')}")
            console.print(f"[bold]Activation Cancel:[/] {data.get('activationCancel')}")
            console.print(f"[bold]Activation End:[/] {data.get('activationEnd')}")
            console.print("\n[dim]Use 'status {act_id}' to poll for OTP[/]")
            return
    except Exception:
        pass

    if resp_text.startswith("ACCESS_NUMBER:"):
        _, act_id, number = resp_text.split(":", 2)
        console.print(f"[bold green]✅ Number allocated![/]")
        console.print(f"[bold]Activation ID:[/] [yellow]{act_id}[/]")
        console.print(f"[bold]Phone:[/] [yellow]{fmt_phone(number)}[/]")
        console.print(f"[bold]Service:[/] [yellow]{service}[/]")
        console.print("\n[dim]Use 'status {act_id}' to poll for OTP[/]")
    else:
        console.print(f"[bold red]Failed: {resp_text}[/]")

async def cmd_status(act_id: str):
    """Poll status for an activation."""
    act_id = resolve_target_client_id(act_id)
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("[cyan]Checking status...", total=None)
        try:
            resp_text = await get("/stubs/handler_api.php", params={
                "api_key": "test",
                "action": "getStatus",
                "id": act_id
            })
        except Exception as e:
            console.print(f"[bold red]Error: {e}[/]")
            return

    # Try parsing JSON response
    try:
        data = json.loads(resp_text)
        if isinstance(data, dict) and "sms" in data:
            sms_info = data["sms"]
            code_text = sms_info.get("code") or sms_info.get("text")
            dt = sms_info.get("dateTime", "")
            console.print(f"[bold green]✅ SMS / OTP received![/]")
            console.print(f"[bold magenta]Message / Code:[/] {code_text}")
            if dt:
                console.print(f"[dim]Date Time: {dt}[/]")
            return
    except Exception:
        pass

    if resp_text.startswith("STATUS_OK:"):
        code = resp_text.split(":", 1)[1]
        console.print(f"[bold green]✅ OTP received![/]")
        console.print(f"[bold magenta]Code: {code}[/]")
    elif resp_text == "STATUS_WAIT_CODE":
        console.print("[yellow]⏳ Waiting for SMS...[/]")
    elif resp_text == "STATUS_CANCEL":
        console.print("[red]❌ Activation canceled.[/]")
    else:
        console.print(f"[bold red]Unexpected response: {resp_text}[/]")

async def cmd_setstatus(act_id: str, status_code: str):
    """Set status: 1=ready, 3=retry, 6=complete, 8=cancel."""
    try:
        resp = await get("/stubs/handler_api.php", params={
            "api_key": "test",
            "action": "setStatus",
            "id": act_id,
            "status": status_code
        })
    except Exception as e:
        console.print(f"[bold red]Error: {e}[/]")
        return

    status_map = {
        "ACCESS_READY": "Number ready (waiting for SMS)",
        "ACCESS_RETRY_GET": "Retry requested – reset timer",
        "ACCESS_ACTIVATION": "Activation completed",
        "ACCESS_CANCEL": "Activation canceled",
    }
    if resp in status_map:
        console.print(f"[green]✅ {status_map[resp]}[/]")
    else:
        console.print(f"[bold red]Response: {resp}[/]")

async def cmd_messages(client_id: str, limit: int = 5):
    """Show last N messages for a client with relative time."""
    target_id = resolve_target_client_id(client_id)
    try:
        msgs = await get_json(f"/api/v1/clients/{target_id}/messages?limit={limit}")
    except Exception as e:
        console.print(f"[bold red]Error: {e}[/]")
        return

    if not msgs:
        console.print(f"[yellow]No messages found for client {target_id}.[/]")
        return

    table = Table(title=f"Recent Messages for Client {target_id}", box=box.ROUNDED)
    table.add_column("Time", style="dim")
    table.add_column("Ago", justify="center")
    table.add_column("Sender", style="bold cyan")
    table.add_column("Message", overflow="fold")

    for m in msgs[:limit]:
        ts = m.get("id") or m.get("dateTime")
        table.add_row(
            m.get("dateTime", ""),
            format_relative_time(ts),
            m.get("sender", "Unknown"),
            m.get("message", "")
        )
    console.print(table)

def resolve_target_client_id(arg: str) -> str:
    """
    If arg is a 1-based index (e.g. 1..10) from the last rendered page,
    resolves to the actual client_id. Otherwise returns arg directly.
    """
    if arg.isdigit():
        idx = int(arg) - 1
        if 0 <= idx < len(LAST_PAGE_CLIENT_IDS):
            return LAST_PAGE_CLIENT_IDS[idx]
    return arg

async def cmd_balance():
    """Show account balance."""
    try:
        resp = await get("/stubs/handler_api.php", params={
            "api_key": "test",
            "action": "getBalance"
        })
        if resp.startswith("ACCESS_BALANCE:"):
            bal = resp.split(":", 1)[1]
            console.print(f"[bold green]💰 Balance: ${bal}[/]")
        else:
            console.print(f"[red]Unexpected: {resp}[/]")
    except Exception as e:
        console.print(f"[bold red]Error: {e}[/]")

async def cmd_monitor(act_id: str, interval: int = 5, timeout: int = 1200):
    """
    Continuously poll status and show live messages.
    Stops when OTP received or timeout.
    """
    console.print(f"[cyan]Monitoring activation {act_id}... (Ctrl+C to stop)[/]")

    # We'll show a live panel with the last 5 messages
    last_messages = []
    start_time = time.time()

    with Live(refresh_per_second=2, console=console) as live:
        while time.time() - start_time < timeout:
            # Poll status
            try:
                status_resp = await get("/stubs/handler_api.php", params={
                    "api_key": "test",
                    "action": "getStatus",
                    "id": act_id
                })
            except Exception:
                live.update("[red]Error polling[/]")
                await asyncio.sleep(interval)
                continue

            # Fetch last 5 messages
            try:
                msgs = await get_json(f"/api/v1/clients/{act_id}/messages?limit=5")
            except Exception:
                msgs = []

            # Build display
            layout = Layout()
            layout.split_column(
                Layout(name="status", size=3),
                Layout(name="messages")
            )

            # Status panel
            if status_resp.startswith("STATUS_OK:"):
                code = status_resp.split(":", 1)[1]
                status_panel = Panel(
                    f"[bold green]✅ OTP received! Code: {code}[/]",
                    border_style="green"
                )
                live.update(status_panel)
                return
            elif status_resp == "STATUS_WAIT_CODE":
                elapsed = int(time.time() - start_time)
                status_panel = Panel(
                    f"[yellow]⏳ Waiting for SMS... {elapsed}s elapsed[/]",
                    border_style="yellow"
                )
            elif status_resp == "STATUS_CANCEL":
                status_panel = Panel("[red]❌ Activation canceled.[/]", border_style="red")
                live.update(status_panel)
                return
            else:
                status_panel = Panel(f"[red]Unexpected: {status_resp}[/]", border_style="red")

            # Messages panel
            if msgs:
                msg_table = Table(show_header=True, header_style="bold cyan", box=box.SIMPLE)
                msg_table.add_column("Time", style="dim")
                msg_table.add_column("Sender")
                msg_table.add_column("Message", overflow="fold")
                for m in msgs[:5]:
                    msg_table.add_row(
                        m.get("dateTime", ""),
                        m.get("sender", ""),
                        m.get("message", "")[:60]
                    )
                messages_panel = Panel(msg_table, title="Last 5 Messages", border_style="blue")
            else:
                messages_panel = Panel("[dim]No messages yet[/]", title="Last 5 Messages", border_style="blue")

            # Combine
            layout["status"].update(status_panel)
            layout["messages"].update(messages_panel)

            live.update(layout)
            await asyncio.sleep(interval)

        live.update("[red]⏰ Timeout reached.[/]")
        
async def cmd_analysis(act_id: str):
    """Show extracted phone numbers and telecom networks for a client."""
    try:
        client = await get_json(f"/api/v1/clients/{act_id}")
    except Exception as e:
        console.print(f"[bold red]Error: {e}[/]")
        return
    analysis = client.get("smsAnalysis", {})
    if not analysis:
        console.print("[yellow]No SMS analysis data found for this client.[/]")
        return

    table = Table(title=f"Extracted Telecom Data for {act_id}", box=box.SIMPLE)
    table.add_column("Type", style="cyan")
    table.add_column("Extracted Values", style="green")

    phones = analysis.get("phoneNumbers", [])
    networks = analysis.get("networks", [])

    table.add_row("Phone Numbers", ", ".join(phones) if phones else "None")
    table.add_row("Networks", ", ".join(networks) if networks else "None")

    console.print(table)
# -----------------------------------------------------------------------------
# CLI Main Loop
# -----------------------------------------------------------------------------
async def main():
    console.print(Panel.fit(
        "[bold cyan]FireXPanel SMS Gateway[/] – [yellow]Provider Terminal (Enhanced)[/]\n"
        f"[dim]Connected to {API_BASE}[/]",
        border_style="cyan"
    ))
    console.print("[dim]Type 'help' for commands.[/]\n")

    while True:
        try:
            cmd = await asyncio.get_event_loop().run_in_executor(
                None, Prompt.ask, "[bold green]>>[/]"
            )
        except KeyboardInterrupt:
            console.print("\n[yellow]Exiting...[/]")
            break

        if not cmd:
            continue

        parts = cmd.strip().split()
        action = parts[0].lower()

        if action == "quit" or action == "exit":
            break

        elif action == "help":
            console.print(Markdown("""
            **Available Commands**
            - `list [page]` – Show clients (10 per page, auto-resolves phone & operator from messages)
            - `info <id>` – Show full client details (all fields).
            - `getnumber <service>` – Allocate a number (service: tg, wa, go, fb, ig, tw, vi, ds, ot, mm, ya, am, wx, lf, vk, ok, ma, oi, nz, hw)
            - `status <id>` – Poll for OTP code
            - `setstatus <id> <code>` – 1=ready, 3=retry, 6=complete, 8=cancel
            - `messages <id>` – Show last 5 messages for client
            - `analysis <id>` – Show extracted phone numbers and telecom networks for client
            - `balance` – Show account balance
            - `monitor <id>` – Continuously poll for new SMS and show live messages
            - `help` – Show this help
            - `quit` – Exit
            """))

        elif action == "list":
            page = 1
            sort_by = "online"
            if len(parts) > 1:
                if parts[1].isdigit():
                    page = int(parts[1])
                elif parts[1].lower() in ("sms", "recent", "activity", "time"):
                    sort_by = "sms"
                    if len(parts) > 2 and parts[2].isdigit():
                        page = int(parts[2])
            await cmd_list(page, sort_by=sort_by)

        elif action == "info":
            if len(parts) < 2:
                console.print("[red]Usage: info <client_id or row_number>[/]")
            else:
                cid = resolve_target_client_id(parts[1])
                await cmd_info(cid)

        elif action == "getnumber":
            if len(parts) < 2:
                console.print("[red]Usage: getnumber <service>[/]")
            else:
                await cmd_getnumber(parts[1])

        elif action == "status":
            if len(parts) < 2:
                console.print("[red]Usage: status <activation_id>[/]")
            else:
                await cmd_status(parts[1])

        elif action == "setstatus":
            if len(parts) < 3:
                console.print("[red]Usage: setstatus <id> <status_code>[/]")
            else:
                await cmd_setstatus(parts[1], parts[2])

        elif action == "messages" or action == "m":
            if len(parts) < 2:
                console.print("[red]Usage: messages <client_id or row_number>[/]")
            else:
                cid = resolve_target_client_id(parts[1])
                await cmd_messages(cid)

        elif action == "balance":
            await cmd_balance()

        elif action == "monitor":
            if len(parts) < 2:
                console.print("[red]Usage: monitor <activation_id>[/]")
            else:
                await cmd_monitor(parts[1])

        elif action == "analysis":
            if len(parts) < 2:
                console.print("[red]Usage: analysis <client_id or row_number>[/]")
            else:
                cid = resolve_target_client_id(parts[1])
                await cmd_analysis(cid)

        elif action.isdigit():
            # Directly typing row number [1..10] expands last 5 messages for that row!
            cid = resolve_target_client_id(action)
            await cmd_messages(cid)

        else:
            console.print(f"[red]Unknown command: {action}. Type 'help'.[/]")

# -----------------------------------------------------------------------------
# Entry
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        console.print("\n[yellow]Goodbye![/]")