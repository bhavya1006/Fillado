"""
backend/core/key_manager.py

Thread-safe round-robin API key rotation for all external API services.

Pools
─────
  _groq_pool     — rotates across GROQ_API_KEYS (CSV) or falls back to GROQ_API_KEY
  _newsdata_pool — rotates across NEWSDATA_API_KEYS (CSV) or falls back to NEWSDATA_API_KEY
  _neo4j_pool    — rotates across NEO4J_URIS (pipe-separated tuples) or falls back to single creds

Public helpers
──────────────
  get_groq_client()         → AsyncGroq
  get_groq_key()            → str
  get_newsdata_key()        → str
  get_neo4j_credentials()   → (uri, username, password)
  report_groq_error(key)
  report_groq_success(key)
  report_newsdata_error(key)
"""
from __future__ import annotations

import logging
import threading
from typing import List

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Generic KeyPool
# ─────────────────────────────────────────────────────────────────────────────

class KeyPool:
    """Thread-safe round-robin pool for a list of string API keys."""

    def __init__(self, keys: List[str], service: str) -> None:
        if not keys:
            raise ValueError(f"[KeyPool:{service}] Initialized with 0 keys — at least one required.")
        self._keys = keys
        self._service = service
        self._index = 0
        self._failures: dict[str, int] = {k: 0 for k in keys}
        self._lock = threading.Lock()
        print(f"[KeyPool:{service}] Initialized with {len(keys)} key(s)")

    def get(self) -> str:
        """Round-robin: advance index on every call so consecutive calls get different keys."""
        with self._lock:
            key = self._keys[self._index]
            self._index = (self._index + 1) % len(self._keys)
        return key

    def mark_failed(self, key: str) -> None:
        with self._lock:
            self._failures[key] = self._failures.get(key, 0) + 1
            count = self._failures[key]
        last4 = key[-4:] if len(key) >= 4 else key
        logger.warning(f"[KeyPool:{self._service}] Key ...{last4} failed ({count} times)")
        print(f"[KeyPool:{self._service}] Key ...{last4} failed ({count} times)")

    def mark_success(self, key: str) -> None:
        with self._lock:
            self._failures[key] = 0

    def get_healthy(self, max_failures: int = 3) -> str:
        """
        Return the next key whose failure count is below max_failures.
        If all keys are exhausted, reset failure counts and fall back to get().
        """
        with self._lock:
            n = len(self._keys)
            for _ in range(n):
                candidate = self._keys[self._index]
                self._index = (self._index + 1) % n
                if self._failures.get(candidate, 0) < max_failures:
                    return candidate
            # All exhausted — reset and retry
            logger.warning(f"[KeyPool:{self._service}] ⚠️ All keys exhausted — resetting failure counts and retrying")
            print(f"[KeyPool:{self._service}] ⚠️ All keys exhausted — resetting failure counts and retrying")
            for k in self._keys:
                self._failures[k] = 0
        return self.get()


# ─────────────────────────────────────────────────────────────────────────────
# Neo4j credential pool
# ─────────────────────────────────────────────────────────────────────────────

Credentials = tuple[str, str, str]  # (uri, username, password)


class Neo4jUriPool:
    """Thread-safe round-robin pool for Neo4j (uri, username, password) tuples."""

    def __init__(self, entries: List[Credentials], service: str = "Neo4j") -> None:
        if not entries:
            raise ValueError(f"[Neo4jUriPool:{service}] Initialized with 0 entries.")
        self._entries = entries
        self._service = service
        self._index = 0
        self._failures: dict[str, int] = {e[0]: 0 for e in entries}
        self._lock = threading.Lock()
        print(f"[KeyPool:{service}] Initialized with {len(entries)} instance(s)")

    def get(self) -> Credentials:
        with self._lock:
            entry = self._entries[self._index]
            self._index = (self._index + 1) % len(self._entries)
        return entry

    def get_healthy(self, max_failures: int = 3) -> Credentials:
        with self._lock:
            n = len(self._entries)
            for _ in range(n):
                candidate = self._entries[self._index]
                self._index = (self._index + 1) % n
                if self._failures.get(candidate[0], 0) < max_failures:
                    return candidate
            logger.warning(f"[KeyPool:{self._service}] ⚠️ All Neo4j instances exhausted — resetting and retrying")
            print(f"[KeyPool:{self._service}] ⚠️ All Neo4j instances exhausted — resetting and retrying")
            for e in self._entries:
                self._failures[e[0]] = 0
        return self.get()

    def mark_failed(self, uri: str) -> None:
        with self._lock:
            self._failures[uri] = self._failures.get(uri, 0) + 1
            count = self._failures[uri]
        logger.warning(f"[KeyPool:{self._service}] Neo4j {uri[-20:]!r} failed ({count} times)")
        print(f"[KeyPool:{self._service}] Neo4j ...{uri[-20:]} failed ({count} times)")

    def mark_success(self, uri: str) -> None:
        with self._lock:
            self._failures[uri] = 0


# ─────────────────────────────────────────────────────────────────────────────
# Singleton pool construction (runs once on import)
# ─────────────────────────────────────────────────────────────────────────────
# IMPORTANT: use get_settings() — NOT os.environ.get() — so that pydantic-settings
# has already loaded the .env file before we read the keys.

def _build_groq_pool() -> KeyPool:
    from backend.core.config import get_settings
    s = get_settings()
    multi = (s.groq_api_keys or "").strip()
    if multi:
        keys = [k.strip() for k in multi.split(",") if k.strip()]
    else:
        single = (s.groq_api_key or "").strip()
        keys = [single] if single else []

    if not keys:
        # Graceful degradation: pool with a placeholder so the app doesn't crash on import
        logger.warning("[KeyManager] No GROQ_API_KEY(S) configured — using empty placeholder")
        keys = ["__no_groq_key__"]

    return KeyPool(keys, "Groq")


def _build_newsdata_pool() -> KeyPool:
    from backend.core.config import get_settings
    s = get_settings()
    multi = (s.newsdata_api_keys or "").strip()
    if multi:
        keys = [k.strip() for k in multi.split(",") if k.strip()]
    else:
        single = (s.newsdata_api_key or "").strip()
        keys = [single] if single else ["__no_newsdata_key__"]

    return KeyPool(keys, "NewsData")


def _build_neo4j_pool() -> Neo4jUriPool:
    from backend.core.config import get_settings
    s = get_settings()
    multi = (s.neo4j_uris or "").strip()
    entries: List[Credentials] = []

    if multi:
        for entry in multi.split(","):
            parts = entry.strip().split("|")
            if len(parts) == 3:
                entries.append((parts[0].strip(), parts[1].strip(), parts[2].strip()))

    if not entries:
        # Fall back to single URI from settings
        uri  = (s.neo4j_uri or "").strip()
        user = (s.neo4j_username or "neo4j").strip()
        pwd  = (s.neo4j_password or "").strip()
        entries = [(uri, user, pwd)]

    return Neo4jUriPool(entries, "Neo4j")


_groq_pool: KeyPool       = _build_groq_pool()
_newsdata_pool: KeyPool   = _build_newsdata_pool()
_neo4j_pool: Neo4jUriPool = _build_neo4j_pool()



# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def get_groq_key() -> str:
    """Return a healthy raw Groq API key string."""
    return _groq_pool.get_healthy()


def get_groq_client():
    """Return a fresh AsyncGroq client using the next healthy key."""
    from groq import AsyncGroq
    key = _groq_pool.get_healthy()
    last4 = key[-4:] if len(key) >= 4 else key
    print(f"[KeyManager] Groq client → key ...{last4}")
    return AsyncGroq(api_key=key)


def get_newsdata_key() -> str:
    """Return a healthy NewsData.io API key string."""
    return _newsdata_pool.get_healthy()


def get_neo4j_credentials() -> Credentials:
    """Return a healthy (uri, username, password) tuple for Neo4j."""
    return _neo4j_pool.get_healthy()


def report_groq_error(key: str) -> None:
    _groq_pool.mark_failed(key)


def report_groq_success(key: str) -> None:
    _groq_pool.mark_success(key)


def report_newsdata_error(key: str) -> None:
    _newsdata_pool.mark_failed(key)
