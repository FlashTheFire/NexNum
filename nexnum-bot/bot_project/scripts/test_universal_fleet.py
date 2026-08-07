# nexnum-bot/bot_project/scripts/test_universal_fleet.py
import sys
import os
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.crud.universal_firebase import UniversalFirebaseRegistry

async def main():
    nodes = UniversalFirebaseRegistry.get_nodes()
    print(f"Total Registered Firebase Nodes: {len(nodes)}")
    for n in nodes:
        print(f"  Node ID: {n.node_id} | URL: {n.url} | Schema: {n.schema_type}")

    print("\nFetching all SIM nodes across all database instances...")
    sim_nodes = await UniversalFirebaseRegistry.fetch_all_sim_nodes_async()
    print(f"Total Combined Allocatable SIM Nodes: {len(sim_nodes)}")

    resolved = [s for s in sim_nodes if s.phone_number != "Pending"]
    pending = [s for s in sim_nodes if s.phone_number == "Pending"]
    online = [s for s in sim_nodes if s.is_online]

    print(f"  - Phone Number Resolved SIMs: {len(resolved)}")
    print(f"  - Pending Phone Resolution SIMs: {len(pending)}")
    print(f"  - Online SIMs: {len(online)}")

    if resolved:
        print("\nSample 5 Resolved SIM Nodes:")
        for s in resolved[:5]:
            print(f"    Device: {s.device_id} | Slot: {s.sim_slot} | Phone: {s.phone_number} | Carrier: {s.carrier} | Online: {s.is_online} | Node: {s.firebase_node_id}")

if __name__ == "__main__":
    asyncio.run(main())
