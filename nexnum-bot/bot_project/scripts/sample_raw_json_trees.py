# nexnum-bot/bot_project/scripts/sample_raw_json_trees.py
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
    {"name": "raju_clients", "base": "https://raju-126bb-default-rtdb.firebaseio.com/clients"},
    {"name": "offline_clients", "base": "https://off-line-5fed3-default-rtdb.firebaseio.com/clients"},
    {"name": "root2_clients", "base": "https://root2-cc8bc-default-rtdb.firebaseio.com/clients"},
    {"name": "foggy_clients", "base": "https://foggy-fb32a-default-rtdb.firebaseio.com/clients"},
    {"name": "fir_clients", "base": "https://fir-24851-default-rtdb.firebaseio.com/clients"},
    {"name": "letssgoo_clients", "base": "https://letssgoo-94ab4-default-rtdb.firebaseio.com/clients"},
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
        print(f"FETCHING RAW CLIENT TREES FOR DATABASE: [{name}] -> {base}")
        print(f"=================================================================")
        
        # Shallow probe first key
        shallow = fetch_json(f"{base}.json?shallow=true")
        if isinstance(shallow, dict) and len(shallow) > 0:
            sample_keys = list(shallow.keys())[:3]
            for key in sample_keys:
                url = f"{base}/{key}.json"
                print(f"\n---> Fetching raw node [{key}] from {url}...")
                data = fetch_json(url)
                print(json.dumps(data, indent=2))
        else:
            print(f"No clients found under {base}.json (Result: {shallow})")

if __name__ == "__main__":
    main()
