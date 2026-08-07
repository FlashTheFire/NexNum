from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, List, Any
from datetime import datetime

class ClientBase(BaseModel):
    battery: Optional[str] = None
    status: bool = False
    lastMessageTime: Optional[int] = None

class Client(ClientBase):
    id: str

class ClientDetail(Client):
    webhookEvent: Optional[Dict[str, Any]] = None
    commands: Optional[Dict[str, Any]] = None
    messages: Optional[Dict[str, Any]] = None
    sms: Optional[Dict[str, Any]] = None

class IncomingMessage(BaseModel):
    id: int
    dateTime: str
    message: str
    sender: str
    type: str = "incoming"

class SendSmsRequest(BaseModel):
    clientId: str
    to: str
    message: str
    simSlot: int = 0

    @validator('to')
    def validate_phone(cls, v):
        # Basic phone validation (E.164 recommended)
        if not v.startswith('+') or not v[1:].isdigit():
            raise ValueError('Phone number must be in E.164 format (e.g., +919876543210)')
        return v

class SendSmsResponse(BaseModel):
    commandId: str
    status: str = "queued"
    clientId: str

class WebhookSmsPayload(BaseModel):
    From: str
    To: str
    Body: str
    MessageSid: Optional[str] = None
