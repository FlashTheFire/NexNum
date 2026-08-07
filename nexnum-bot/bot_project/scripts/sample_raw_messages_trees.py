# nexnum-bot/bot_project/scripts/sample_raw_messages_trees.py
import urllib.request
import json
import sys

# Ensure stdout uses utf-8
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

URL_TEMPLATES = [
    {"name": "raju_messages", "base": "https://raju-126bb-default-rtdb.firebaseio.com/messages"},
    {"name": "offline_messages", "base": "https://off-line-5fed3-default-rtdb.firebaseio.com/messages"},
    {"name": "root2_messages", "base": "https://root2-cc8bc-default-rtdb.firebaseio.com/messages"},
    {"name": "foggy_messages", "base": "https://foggy-fb32a-default-rtdb.firebaseio.com/messages"},
    {"name": "fir_messages", "base": "https://fir-24851-default-rtdb.firebaseio.com/messages"},
    {"name": "letssgoo_messages", "base": "https://letssgoo-94ab4-default-rtdb.firebaseio.com/messages"},
]

def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return None

def main():
    for target in URL_TEMPLATES:
        name = target["name"]
        base = target["base"]
        print(f"\n=================================================================")
        print(f"FETCHING RAW MESSAGES TREE FOR DATABASE: [{name}] -> {base}")
        print(f"=================================================================")
        
        # 1. Probe shallow device keys under /messages
        shallow_devs = fetch_json(f"{base}.json?shallow=true")
        if isinstance(shallow_devs, dict) and len(shallow_devs) > 0:
            dev_keys = list(shallow_devs.keys())[:2] # sample 2 device keys
            print(f"Total Device Message Nodes: {len(shallow_devs)} | Sample Devices: {dev_keys}")
            
            for dev_id in dev_keys:
                dev_msg_url = f"{base}/{dev_id}.json?shallow=true"
                shallow_msgs = fetch_json(dev_msg_url)
                
                print(f"\n---> Device [{dev_id}] Message Node Shallow Probe:")
                if isinstance(shallow_msgs, dict):
                    msg_ids = list(shallow_msgs.keys())[:2] # sample 2 message item IDs
                    print(f"     Total Messages: {len(shallow_msgs)} | Sample Msg IDs: {msg_ids}")
                    
                    # Fetch sample message items
                    sample_payload = {}
                    for m_id in msg_ids:
                        msg_item = fetch_json(f"{base}/{dev_id}/{m_id}.json")
                        sample_payload[m_id] = msg_item
                    
                    print(f"     Sample Raw Message Items JSON:")
                    print(json.dumps(sample_payload, indent=4))
                else:
                    # Non-dict message payload
                    full_dev_msg = fetch_json(f"{base}/{dev_id}.json")
                    print(json.dumps(full_dev_msg, indent=4)[:500])
        else:
            print(f"No messages found under {base}.json (Result: {shallow_devs})")

if __name__ == "__main__":
    main()
