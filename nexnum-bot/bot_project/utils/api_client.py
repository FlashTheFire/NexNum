import os
import logging
import asyncio
import aiohttp
from typing import Optional, Dict, Any, List
from utils.cache_manager import cache_manager, CachePrefix

logger = logging.getLogger("api_client")

class NexNumApiClient:
    """
    Asynchronous API Client for nexnum-bot to fetch live data from nexnum-app APIs.
    All calls are transparently cached in Redis using TTLs.
    """
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        self._custom_base_url = base_url
        self._custom_api_key = api_key
        self._session: Optional[aiohttp.ClientSession] = None

    @property
    def base_url(self) -> str:
        url = self._custom_base_url or os.getenv("NEXNUM_API_URL") or "http://nexnum-app:3000"
        return url.rstrip("/")

    @property
    def api_key(self) -> str:
        return self._custom_api_key or os.getenv("NEXNUM_API_KEY") or "nxn_live_-YbCKi0hkPq1W4PQfn_GRAYUMYfdUYkr"

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=10)
            headers = {
                "x-admin-key": self.api_key,
                "Accept": "application/json",
                "User-Agent": "nexnum-bot/2.0"
            }
            self._session = aiohttp.ClientSession(timeout=timeout, headers=headers)
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def get_services(
        self,
        query: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
        sort: Optional[str] = None,
        ttl: int = 120
    ) -> Dict[str, Any]:
        """
        Fetch service aggregates from GET /api/public/services
        """
        cache_key = f"api:services:q={query or ''}:p={page}:l={limit}:s={sort or ''}"
        cached = await cache_manager.get(cache_key, CachePrefix.SERVICE)
        if cached:
            return cached

        session = await self._get_session()
        params = {"page": str(page), "limit": str(limit)}
        if query:
            params["q"] = query
        if sort:
            params["sort"] = sort

        try:
            url = f"{self.base_url}/api/public/services"
            async with session.get(url, params=params) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if data and data.get("services"):
                        await cache_manager.set(cache_key, data, CachePrefix.SERVICE, expire=ttl)
                    return data
                logger.warning(f"get_services HTTP {resp.status} for {url}")
        except Exception as e:
            logger.error(f"Failed to fetch get_services: {e}")

        return {"success": False, "services": [], "pagination": {"page": page, "limit": limit, "total": 0, "totalPages": 0}}

    async def get_countries(
        self,
        service: Optional[str] = None,
        query: Optional[str] = None,
        page: int = 1,
        limit: int = 200,
        ttl: int = 300
    ) -> List[Dict[str, Any]]:
        """
        Fetch countries list from GET /api/public/countries
        """
        cache_key = f"api:countries:svc={service or ''}:q={query or ''}:p={page}:l={limit}"
        cached = await cache_manager.get(cache_key, CachePrefix.COUNTRY)
        if cached:
            return cached

        session = await self._get_session()
        params = {"page": str(page), "limit": str(limit)}
        if service:
            params["service"] = service
        if query:
            params["q"] = query

        try:
            url = f"{self.base_url}/api/public/countries"
            async with session.get(url, params=params) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    items = data.get("items", [])
                    if items:
                        await cache_manager.set(cache_key, items, CachePrefix.COUNTRY, expire=ttl)
                    return items
                logger.warning(f"get_countries HTTP {resp.status} for {url}")
        except Exception as e:
            logger.error(f"Failed to fetch get_countries: {e}")

        return []

    async def get_number_quote(self, country: str, service: str, ttl: int = 30) -> Dict[str, Any]:
        """
        Fetch live quote for country & service
        """
        cache_key = f"api:quote:{country}:{service}"
        cached = await cache_manager.get(cache_key, CachePrefix.SERVICE)
        if cached:
            return cached

        session = await self._get_session()
        try:
            url = f"{self.base_url}/api/numbers/quote"
            payload = {"country": str(country), "service": str(service)}
            async with session.post(url, json=payload) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if data:
                        await cache_manager.set(cache_key, data, CachePrefix.SERVICE, expire=ttl)
                    return data
        except Exception as e:
            logger.error(f"Failed to fetch quote for {country}/{service}: {e}")

        return {"success": False, "error": "Quote unavailable"}

    async def get_admin_metrics(self, ttl: int = 300) -> Dict[str, Any]:
        """
        Fetch system-wide metrics from /api/admin/metrics/advanced
        """
        cache_key = "api:admin:metrics"
        cached = await cache_manager.get(cache_key, CachePrefix.ADMIN)
        if cached:
            return cached

        session = await self._get_session()
        try:
            url = f"{self.base_url}/api/admin/metrics/advanced"
            async with session.get(url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if data:
                        await cache_manager.set(cache_key, data, CachePrefix.ADMIN, expire=ttl)
                    return data
        except Exception as e:
            logger.error(f"Failed to fetch admin metrics: {e}")

        return {}

# Global singleton client instance
api_client = NexNumApiClient()
