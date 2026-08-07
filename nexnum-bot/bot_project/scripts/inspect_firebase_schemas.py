# nexnum-bot/bot_project/scripts/inspect_firebase_schemas.py
"""
Diagnostic Script: Probes legacy & modern Firebase RTDB instances with shallow=true
to inspect structural trees (devices, sims arrays, messages) without downloading huge payloads.
"""

import sys
import os
import json
import httpx

# Ensure bot_project is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TARGET_FIREBASE_URLS = [
    {"id": "raju_clients", "url": "https://raju-126bb-default-rtdb.firebaseio.com", "path": "/clients"},
    {"id": "raju_messages", "url": "https://raju-126bb-default-rtdb.firebaseio.com", "path": "/messages"},
    {"id": "offline_clients", "url": "https://off-line-5fed3-default-rtdb.firebaseio.com", "path": "/clients"},
    {"id": "offline_messages", "url": "https://off-line-5fed3-default-rtdb.firebaseio.com", "path": "/messages"},
    {"id": "root2_clients", "url": "https://root2-cc8bc-default-rtdb.firebaseio.com", "path": "/clients"},
    {"id": "root2_messages", "url": "https://root2-cc8bc-default-rtdb.firebaseio.com", "path": "/messages"},
    {"id": "foggy_clients", "url": "https://foggy-fb32a-default-rtdb.firebaseio.com", "path": "/clients"},
    {"id": "foggy_messages", "url": "https://foggy-fb32a-default-rtdb.firebaseio.com", "path": "/messages"},
    {"id": "fir_clients", "url": "https://fir-24851-default-rtdb.firebaseio.com", "path": "/clients"},
    {"id": "fir_messages", "url": "https://fir-24851-default-rtdb.firebaseio.com", "path": "/messages"},
    {"id": "letssgoo_clients", "url": "https://letssgoo-94ab4-default-rtdb.firebaseio.com", "path": "/clients"},
    {"id": "letssgoo_messages", "url": "https://letssgoo-94ab4-default-rtdb.firebaseio.com", "path": "/messages"},
    {"id": "node_1_clients", "url": "https://vdgsh-623ed-default-rtdb.firebaseio.com", "path": "/clients"},
    {"id": "node_1_messages", "url": "https://vdgsh-623ed-default-rtdb.firebaseio.com", "path": "/messages"}
]

def inspect_node(node_info: dict):
    node_id = node_info["id"]
    base_url = node_info["url"].rstrip("/")
    rel_path = node_info["path"]
    
    print(f"\n=======================================================")
    print(f"[INSPECTING FIREBASE NODE]: [{node_id}] -> {base_url}{rel_path}")
    print(f"=======================================================")

    with httpx.Client(timeout=10.0, trust_env=False, follow_redirects=True) as client:
        # 1. Shallow query to list top-level keys
        shallow_url = f"{base_url}{rel_path}.json?shallow=true"
        try:
            resp = client.get(shallow_url)
            print(f"Shallow Query HTTP {resp.status_code}")
            if resp.status_code == 200:
                top_keys = resp.json()
                if isinstance(top_keys, dict):
                    key_list = list(top_keys.keys())
                    print(f"Total Top-Level Keys: {len(key_list)}")
                    print(f"Sample Top-Level Keys (first 10): {key_list[:10]}")
                    
                    # 2. Sample 1-2 keys in detail
                    sample_keys = key_list[:2]
                    for s_key in sample_keys:
                        sample_url = f"{base_url}{rel_path}/{s_key}.json"
                        try:
                            s_resp = client.get(sample_url)
                            if s_resp.status_code == 200:
                                s_data = s_resp.json()
                                print(f"\n--- Sample Data for Key: '{s_key}' ---")
                                if isinstance(s_data, dict):
                                    # Print top-level field names
                                    print(f"  Field Names: {list(s_data.keys())}")
                                    # Check for sims array
                                    if "sims" in s_data:
                                        print(f"  [SIMS ARRAY PRESENT]: {s_data['sims']}")
                                    if "mobNo" in s_data:
                                        print(f"  mobNo: '{s_data['mobNo']}'")
                                    if "service_provider" in s_data:
                                        print(f"  service_provider: '{s_data['service_provider']}'")
                                    if "status" in s_data:
                                        print(f"  status: {s_data['status']} (type: {type(s_data['status']).__name__})")
                                    if "battery" in s_data:
                                        print(f"  battery: '{s_data['battery']}'")
                                    if "modelName" in s_data:
                                        print(f"  modelName: '{s_data['modelName']}'")
                                    
                                    # Check if messages sub-node exists inside device dictionary or at root /messages
                                    if "messages" in s_data:
                                        print(f"  [MESSAGES SUB-NODE]: type={type(s_data['messages']).__name__}")
                                else:
                                    print(f"  Raw value: {str(s_data)[:200]}")
                        except Exception as e:
                            print(f"  Failed to fetch sample key '{s_key}': {e}")
                elif top_keys is True or top_keys is False:
                    print(f"Shallow result: {top_keys}")
                else:
                    print(f"Raw shallow payload: {str(top_keys)[:300]}")
            else:
                print(f"Response Body: {resp.text[:300]}")
        except Exception as e:
            print(f"[ERROR] Connection error probing node [{node_id}]: {e}")

if __name__ == "__main__":
    for n in TARGET_FIREBASE_URLS:
        inspect_node(n)
