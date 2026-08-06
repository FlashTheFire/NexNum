# app/inbound/__init__.py
"""
Phase 1 — Unified Webhook Inbound Bus

Receives SMS from SilentGate devices via HTTP webhook,
deduplicates using Redis SETNX, and pushes to Redis Streams
for async processing by activation workers.
"""
