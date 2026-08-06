import os
import json
from typing import List, Dict, Optional
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Multi-Node Configuration Support (JSON string, CSV, or numbered)
    FIREBASE_NODES_JSON: Optional[str] = None
    FIREBASE_DATABASE_URLS: Optional[str] = None
    FIREBASE_AUTH_TOKENS: Optional[str] = None

    # Dedicated Schema Declarations (Explicit Gateways vs Clients Firebase DBs)
    FIREBASE_GATEWAY_URL: Optional[str] = None
    FIREBASE_GATEWAY_AUTH: Optional[str] = None
    FIREBASE_CLIENT_URL: Optional[str] = None
    FIREBASE_CLIENT_AUTH: Optional[str] = None

    # Supabase Integration (SilentGate project)
    SUPABASE_URL: Optional[str] = "https://kqlhsbtexcoxqwwubuhz.supabase.co"
    SUPABASE_KEY: Optional[str] = "sb_publishable_qggA0oG7mpRRT7WTnf6UUw_nIPVf1zM"

    # API Auth
    API_KEY: str = "your-random-secret-key"

    # API
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "NexNum Backend"
    DEBUG: bool = False

    # Webhook Inbound (Phase 1)
    WEBHOOK_SHARED_SECRET: str = ""              # X-API-Key header value for inbound webhook auth
    INBOUND_DEDUP_TTL: int = 60                  # Seconds to keep dedup keys in Redis
    REDIS_STREAM_INBOUND: str = "stream:inbound:sms"  # Redis Stream name for inbound SMS
    INBOUND_WORKER_COUNT: int = 3                # Number of Redis Stream consumer workers

    # Background jobs
    HEARTBEAT_INTERVAL_SECONDS: int = 60
    COMMAND_CLEANUP_HOURS: int = 24
    MESSAGE_RETENTION_DAYS: int = 30

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

    def get_firebase_nodes(self) -> List[Dict[str, str]]:
        """
        Parses unlimited Firebase database instances from configuration.
        Each node dict contains: {"id": str, "url": str, "auth": str, "schema_type": "gateways"|"clients"|"auto"}
        """
        nodes = []

        # 0. Dedicated Gateway & Client env variables (Explicit format)
        if self.FIREBASE_GATEWAY_URL:
            nodes.append({
                "id": "firebase_gateways_db",
                "url": self.FIREBASE_GATEWAY_URL.rstrip("/"),
                "auth": self.FIREBASE_GATEWAY_AUTH or "",
                "schema_type": "gateways"
            })
        if self.FIREBASE_CLIENT_URL:
            nodes.append({
                "id": "firebase_clients_db",
                "url": self.FIREBASE_CLIENT_URL.rstrip("/"),
                "auth": self.FIREBASE_CLIENT_AUTH or "",
                "schema_type": "clients"
            })
        if nodes:
            return nodes

        # 1. JSON Array Format (Primary with optional schema_type key)
        if self.FIREBASE_NODES_JSON:
            try:
                parsed = json.loads(self.FIREBASE_NODES_JSON)
                if isinstance(parsed, list):
                    for idx, n in enumerate(parsed):
                        if isinstance(n, dict) and n.get("url"):
                            url = n["url"].rstrip("/")
                            auth = n.get("auth", "")
                            stype = n.get("schema_type", n.get("type", "auto")).lower()
                            if stype not in ("gateways", "clients", "auto"):
                                stype = "auto"
                            nodes.append({"id": f"node_{idx+1}", "url": url, "auth": auth, "schema_type": stype})
                    if nodes:
                        return nodes
            except Exception:
                pass

        # 2. CSV Format
        if self.FIREBASE_DATABASE_URLS:
            urls = [u.strip().rstrip("/") for u in self.FIREBASE_DATABASE_URLS.split(",") if u.strip()]
            auths = [a.strip() for a in (self.FIREBASE_AUTH_TOKENS or "").split(",") if a.strip()]
            for idx, u in enumerate(urls):
                a = auths[idx] if idx < len(auths) else ""
                nodes.append({"id": f"node_{idx+1}", "url": u, "auth": a, "schema_type": "auto"})
            if nodes:
                return nodes

        # 3. Numbered Env Variables
        idx = 1
        while True:
            u_var = os.environ.get(f"FIREBASE_DATABASE_URL_{idx}")
            a_var = os.environ.get(f"FIREBASE_AUTH_TOKEN_{idx}", "")
            s_var = os.environ.get(f"FIREBASE_SCHEMA_TYPE_{idx}", "auto").lower()
            if not u_var:
                break
            if s_var not in ("gateways", "clients", "auto"):
                s_var = "auto"
            nodes.append({"id": f"node_{idx}", "url": u_var.rstrip("/"), "auth": a_var, "schema_type": s_var})
            idx += 1
        if nodes:
            return nodes

        return nodes

@lru_cache()
def get_settings() -> Settings:
    return Settings()
