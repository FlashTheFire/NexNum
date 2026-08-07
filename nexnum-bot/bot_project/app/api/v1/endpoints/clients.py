from fastapi import APIRouter, Depends, HTTPException
from app.models.schemas import Client, ClientDetail
from app.crud import firebase_crud as crud
from app.core.security import verify_api_key
from typing import List, Dict, Any
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/", response_model=Dict[str, Any])
async def get_clients(user=Depends(verify_api_key)):
    """Get all clients with basic info (battery, status, lastMessageTime)"""
    clients = crud.get_all_clients()
    return clients

@router.get("/{client_id}", response_model=ClientDetail)
async def get_client_detail(client_id: str, user=Depends(verify_api_key)):
    client = crud.get_client(client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"id": client_id, **client}
