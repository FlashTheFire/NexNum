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
        """
        nodes = []

        # 1. JSON Array Format (Primary)
        if self.FIREBASE_NODES_JSON:
            try:
                parsed = json.loads(self.FIREBASE_NODES_JSON)
                if isinstance(parsed, list):
                    for idx, n in enumerate(parsed):
                        if isinstance(n, dict) and n.get("url"):
                            url = n["url"].rstrip("/")
                            auth = n.get("auth", "")
                            nodes.append({"id": f"node_{idx+1}", "url": url, "auth": auth})
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
                nodes.append({"id": f"node_{idx+1}", "url": u, "auth": a})
            if nodes:
                return nodes

        # 3. Numbered Env Variables (FIREBASE_DATABASE_URL_1, FIREBASE_DATABASE_URL_2, etc.)
        idx = 1
        while True:
            u_var = os.environ.get(f"FIREBASE_DATABASE_URL_{idx}")
            a_var = os.environ.get(f"FIREBASE_AUTH_TOKEN_{idx}", "")
            if not u_var:
                break
            nodes.append({"id": f"node_{idx}", "url": u_var.rstrip("/"), "auth": a_var})
            idx += 1
        if nodes:
            return nodes

        return nodes

@lru_cache()
def get_settings() -> Settings:
    return Settings()
