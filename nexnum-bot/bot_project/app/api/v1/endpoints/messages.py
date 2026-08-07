from fastapi import APIRouter, Depends, Query, HTTPException
from app.models.schemas import IncomingMessage
from app.crud import firebase_crud as crud
from app.core.security import verify_api_key
from typing import List

router = APIRouter()

@router.get("/", response_model=List[IncomingMessage])
async def get_messages(
    client_id: str,
    limit: int = Query(150, ge=1, le=500),
    user=Depends(verify_api_key)
):
    # Check client exists
    client = crud.get_client(client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    messages = crud.get_incoming_messages(client_id, limit)
    return messages
