from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
# pyrefly: ignore [missing-import]
from app.services.sms import process_incoming_sms
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/sms")
async def sms_webhook(request: Request, background_tasks: BackgroundTasks):
    # Try JSON first, then form
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = await request.json()
    else:
        form = await request.form()
        payload = dict(form)
    
    from_num = payload.get("From")
    to_num = payload.get("To")
    body = payload.get("Body")
    if not (from_num and to_num and body):
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    background_tasks.add_task(process_incoming_sms, from_num, to_num, body)
    return {"status": "accepted"}
