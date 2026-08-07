# nexnum-bot/bot_project/scripts/fetch_and_verify_all_json_trees.py
"""
Script to fetch raw JSON payloads from all 6 legacy/client Firebase database URLs
and output exact structural trees, top-level keys, field types, and sample entries.
"""

import sys
import os
import json
import urllib.request
import urllib.error

# Ensure stdout uses utf-8
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

URLS = [
    {"name": "raju_clients", "url": "https://raju-126bb-default-rtdb.firebaseio.com/clients/.json"},
    {"name": "raju_root", "url": "https://raju-126bb-default-rtdb.firebaseio.com/.json"},
    {"name": "offline_root", "url": "https://off-line-5fed3-default-rtdb.firebaseio.com/.json"},
    {"name": "offline_clients", "url": "https://off-line-5fed3-default-rtdb.firebaseio.com/clients/.json"},
    {"name": "root2_root", "url": "https://root2-cc8bc-default-rtdb.firebaseio.com/.json"},
    {"name": "root2_clients", "url": "https://root2-cc8bc-default-rtdb.firebaseio.com/clients/.json"},
    {"name": "foggy_root", "url": "https://foggy-fb32a-default-rtdb.firebaseio.com/.json"},
    {"name": "foggy_clients", "url": "https://foggy-fb32a-default-rtdb.firebaseio.com/clients/.json"},
    {"name": "fir_root", "url": "https://fir-24851-default-rtdb.firebaseio.com/.json"},
    {"name": "fir_clients", "url": "https://fir-24851-default-rtdb.firebaseio.com/clients/.json"},
    {"name": "letssgoo_root", "url": "https://letssgoo-94ab4-default-rtdb.firebaseio.com/.json"},
    {"name": "letssgoo_clients", "url": "https://letssgoo-94ab4-default-rtdb.firebaseio.com/clients/.json"}
]

def analyze_json_structure(data, max_samples=3):
    if not isinstance(data, dict):
        return f"Primitive/Non-dict type: {type(data).__name__} = {str(data)[:100]}"
    
    total_keys = len(data)
    sample_keys = list(data.keys())[:max_samples]
    
    field_schema = {}
    sims_schema = {}
    
    for k in list(data.keys()):
        val = data[k]
        if isinstance(val, dict):
            for fk, fv in val.items():
                if fk not in field_schema:
                    field_schema[fk] = type(fv).__name__
                if fk == "sims" and isinstance(fv, list):
                    for sim in fv:
                        if isinstance(sim, dict):
                            for sk, sv in sim.items():
                                if sk not in sims_schema:
                                    sims_schema[sk] = type(sv).__name__

    result = {
        "total_top_keys": total_keys,
        "sample_top_keys": sample_keys,
        "detected_device_fields": field_schema,
        "detected_sim_fields": sims_schema,
    }

    if sample_keys:
        sample_dict = {}
        for sk in sample_keys:
            sample_dict[sk] = data[sk]
        result["sample_data"] = sample_dict

    return result

def fetch_url(url_info):
    name = url_info["name"]
    url = url_info["url"]
    print(f"\n=======================================================")
    print(f"[FETCHING RAW DATA]: [{name}] -> {url}")
    print(f"=======================================================")
    
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            status = response.getcode()
            body_bytes = response.read()
            print(f"HTTP Status: {status} | Size: {len(body_bytes):,} bytes")
            
            try:
                data = json.loads(body_bytes.decode("utf-8"))
                if data is None:
                    print("Data returned is NULL.")
                else:
                    analysis = analyze_json_structure(data)
                    print(f"Analysis Summary:")
                    print(f"  Total Keys: {analysis.get('total_top_keys')}")
                    print(f"  Sample Keys: {analysis.get('sample_top_keys')}")
                    print(f"  Device Fields Schema: {json.dumps(analysis.get('detected_device_fields'), indent=4)}")
                    print(f"  SIMs Array Schema: {json.dumps(analysis.get('detected_sim_fields'), indent=4)}")
                    print(f"\nSample Device Tree Json:")
                    print(json.dumps(analysis.get("sample_data"), indent=2)[:1500])
            except Exception as e:
                print(f"JSON decode error: {e}")
                print(f"Raw body preview: {body_bytes[:300]}")
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} {e.reason}")
    except urllib.error.URLError as e:
        print(f"URL Error: {e.reason}")
    except Exception as e:
        print(f"General Error: {e}")

if __name__ == "__main__":
    for info in URLS:
        fetch_url(info)
