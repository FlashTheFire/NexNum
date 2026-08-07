from fastapi import APIRouter, Depends, HTTPException
from app.models.schemas import SendSmsRequest, SendSmsResponse
from app.crud import firebase_crud as crud
from app.core.security import verify_api_key
import time
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/send-sms", response_model=SendSmsResponse)
async def send_sms_command(
    req: SendSmsRequest,
    user=Depends(verify_api_key)
):
    client_id = req.clientId
    # Check client exists
    client = crud.get_client(client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Build command payload
    command_id = f"cmd_{int(time.time()*1000)}_{uuid.uuid4().hex[:8]}"
    command_data = {
        "sendSms": {
            "from": req.simSlot,
            "to": req.to,
            "message": req.message,
            "isSended": False,
            "timestamp": int(time.time() * 1000),
            "status": "pending",
            "commandId": command_id
        }
    }
    # Write to webhookEvent (overwrite)
    crud.set_webhook_event(client_id, command_data)
    # Optionally log outgoing command in client's messages
    crud.log_outgoing_message(client_id, {
        "commandId": command_id,
        "targetNumber": req.to,
        "message": req.message,
        "timestamp": int(time.time() * 1000),
        "status": "pending",
        "type": "outgoing",
        "sender": "ADMIN"
    })
    logger.info(f"Command {command_id} queued for client {client_id}")
    return SendSmsResponse(commandId=command_id, status="queued", clientId=client_id)
