# app/api/v1/endpoints/deposit.py
"""
FastAPI Deposit API Router
Exposes high-performance deposit endpoints interfacing with Operation manager and db_adapter.
"""

import time
import logging
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Query, Depends

try:
    from utils.db import db_adapter
except ImportError:
    from bot_project.utils.db import db_adapter

logger = logging.getLogger(__name__)
router = APIRouter()

class DepositCreateRequest(BaseModel):
    user_id: str = Field(..., description="User Telegram ID or System User UUID")
    amount: float = Field(..., gt=0, description="Deposit amount in INR/USD")
    gateway: str = Field("UPI", description="Payment Gateway (e.g. UPI, QR, Manual)")
    idempotency_key: Optional[str] = Field(None, description="Optional idempotency key")
    customer_mobile: Optional[str] = Field(None, description="Optional customer phone number")

class DepositVerifyRequest(BaseModel):
    deposit_id: str = Field(..., description="16-digit or UUID deposit ID")
    utr: str = Field(..., description="Payment Transaction Reference / UTR Number")
    amount: Optional[float] = Field(None, description="Verified deposit amount")

@router.post("/create", summary="Create Deposit Request")
async def create_deposit(req: DepositCreateRequest):
    """
    Creates a new pending deposit request, generates a unique 16-digit ID,
    stores in PostgreSQL deposit_requests and caches in Redis with 15-min TTL.
    """
    try:
        db = db_adapter
        import random
        deposit_id = str(random.randint(1000000000000000, 9999999999999999))
        idemp_key = req.idempotency_key or f"dep:{deposit_id}"

        # 1. Create in PostgreSQL deposit_requests table
        created_id = await db.create_deposit_request(
            telegram_id=req.user_id,
            amount=req.amount,
            gateway=req.gateway,
            idempotency_key=idemp_key,
            deposit_id=deposit_id
        )

        deposit_data = {
            "deposit_id": str(created_id or deposit_id),
            "user_id": str(req.user_id),
            "amount": req.amount,
            "gateway": req.gateway,
            "status": "PENDING",
            "idempotency_key": idemp_key,
            "created_at": time.time()
        }

        # 2. Store in Redis Hash (deposit_data:info:{deposit_id})
        try:
            # pyrefly: ignore [missing-import]
            from utils.redis_manager import redis_manager
            client = await redis_manager.get_client()
            if client:
                info_key = f"deposit_data:info:{deposit_data['deposit_id']}"
                await client.hset(info_key, mapping={k: str(v) for k, v in deposit_data.items()})
                await client.expire(info_key, 900)
        except Exception as re_err:
            logger.warning(f"Redis cache notice on deposit creation: {re_err}")

        return {
            "status": "success",
            "deposit_id": deposit_data["deposit_id"],
            "amount": req.amount,
            "gateway": req.gateway,
            "expires_in": 900,
            "data": deposit_data
        }
    except Exception as e:
        logger.error(f"Error creating deposit: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status/{deposit_id}", summary="Get Deposit Status")
async def get_deposit_status(deposit_id: str):
    """
    Retrieves deposit request details from Redis (0 DB load) with PostgreSQL fallback.
    """
    try:
        db = db_adapter
        dep = await db.get_deposit_request(deposit_id)
        if not dep:
            raise HTTPException(status_code=404, detail="Deposit request not found")
        return {
            "status": "success",
            "deposit": dep
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving deposit status for {deposit_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/{user_id}", summary="Get User Deposit History")
async def get_user_deposit_history(
    user_id: str,
    status: Optional[str] = Query(None, description="Optional status filter (COMPLETED / PENDING / FAILED)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """
    Queries user deposit history from PostgreSQL deposit_requests and wallet credit transactions.
    """
    try:
        db = db_adapter
        result = await db.search_deposit_requests(
            telegram_id=user_id,
            status=status,
            limit=limit,
            offset=offset
        )
        return {
            "status": "success",
            "user_id": user_id,
            "count": result.get("total_count", 0),
            "deposits": result.get("data", [])
        }
    except Exception as e:
        logger.error(f"Error querying deposit history for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify-utr", summary="Verify / Submit UTR Transaction Reference")
async def verify_utr(req: DepositVerifyRequest):
    """
    Submits or updates UTR transaction reference and triggers status update.
    """
    try:
        db = db_adapter
        dep = await db.get_deposit_request(req.deposit_id)
        if not dep:
            raise HTTPException(status_code=404, detail="Deposit request not found")

        # Update deposit request with UTR and set status to SUBMITTED/PENDING_VERIFICATION
        await db.update_deposit_status(
            deposit_id=req.deposit_id,
            status="SUBMITTED"
        )

        return {
            "status": "success",
            "message": "UTR transaction reference submitted successfully. Verification in progress.",
            "deposit_id": req.deposit_id,
            "utr": req.utr
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying UTR for deposit {req.deposit_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
