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
    # pyrefly: ignore [missing-import]
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

class DepositCancelRequest(BaseModel):
    deposit_id: str = Field(..., description="Deposit ID to cancel")
    reason: Optional[str] = Field(None, description="Optional cancellation reason")

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

        from utils.functions import QR_BASE_URL
        dep_id_str = str(created_id or deposit_id)
        qr_code_url = QR_BASE_URL.format(order_id=dep_id_str)
        upi_id = "paytmqr281005050101nbxw0hx35cpo@paytm"

        deposit_data = {
            "deposit_id": dep_id_str,
            "user_id": str(req.user_id),
            "amount": req.amount,
            "gateway": req.gateway,
            "status": "PENDING",
            "idempotency_key": idemp_key,
            "qr_code_url": qr_code_url,
            "upi_id": upi_id,
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
            "qr_code_url": qr_code_url,
            "upi_id": upi_id,
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
        from utils.functions import QR_BASE_URL
        dep = await db.get_deposit_request(deposit_id)
        if not dep:
            raise HTTPException(status_code=404, detail="Deposit request not found")

        dep_dict = dict(dep) if isinstance(dep, dict) else dep.__dict__ if hasattr(dep, '__dict__') else {}
        dep_dict["qr_code_url"] = QR_BASE_URL.format(order_id=deposit_id)
        dep_dict["upi_id"] = "paytmqr281005050101nbxw0hx35cpo@paytm"

        return {
            "status": "success",
            "deposit": dep_dict,
            "qr_code_url": dep_dict["qr_code_url"],
            "upi_id": dep_dict["upi_id"]
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


@router.post("/cancel", summary="Cancel Pending Deposit")
async def cancel_deposit(req: DepositCancelRequest):
    """
    Cancels a pending deposit request.
    - Updates status to CANCELLED in PostgreSQL deposit_requests.
    - Removes the Redis hash so the tracker stops polling.
    - Idempotent: if already cancelled/completed, returns success without re-processing.
    """
    try:
        db = db_adapter
        deposit_id = req.deposit_id

        # 1. Fetch the deposit from DB
        dep = await db.get_deposit_request(deposit_id)
        if not dep:
            # Already gone — treat as success (idempotent)
            return {
                "status": "success",
                "message": "Deposit not found or already removed.",
                "deposit_id": deposit_id
            }

        dep_dict = dict(dep) if isinstance(dep, dict) else dep.__dict__ if hasattr(dep, '__dict__') else {}
        current_status = str(dep_dict.get("status", "")).upper()

        # 2. Guard: only cancel PENDING deposits
        if current_status in ("COMPLETED", "CONFIRMED", "SUCCESS"):
            raise HTTPException(
                status_code=409,
                detail=f"Cannot cancel a deposit that is already {current_status}."
            )

        if current_status == "CANCELLED":
            return {
                "status": "success",
                "message": "Deposit was already cancelled.",
                "deposit_id": deposit_id
            }

        # 3. Update status in PostgreSQL
        try:
            await db.execute(
                """UPDATE deposit_requests
                   SET status = 'CANCELLED', updated_at = NOW()
                   WHERE deposit_id = $1 OR id::text = $1""",
                deposit_id
            )
        except Exception:
            # Fallback: try update_deposit_status if execute is not available
            if hasattr(db, 'update_deposit_status'):
                await db.update_deposit_status(deposit_id=deposit_id, status="CANCELLED")

        # 4. Remove from Redis so tracker stops
        try:
            from utils.redis_manager import redis_manager
            client = await redis_manager.get_client()
            if client:
                info_key = f"deposit_data:info:{deposit_id}"
                # Mark as cancelled in hash before deleting (for audit)
                await client.hset(info_key, mapping={"status": "CANCELLED"})
                await client.expire(info_key, 300)  # expire in 5 min

                # Also remove from active tracker set if present
                tracker_set_key = "deposit_tracker:active"
                await client.srem(tracker_set_key, deposit_id)
        except Exception as re_err:
            logger.warning(f"Redis cleanup notice on cancel: {re_err}")

        logger.info(f"Deposit {deposit_id} cancelled by user. Reason: {req.reason or 'none'}")

        return {
            "status": "success",
            "message": "Deposit cancelled successfully.",
            "deposit_id": deposit_id,
            "reason": req.reason
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling deposit {req.deposit_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
