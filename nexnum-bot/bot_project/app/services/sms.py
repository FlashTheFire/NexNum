# app/services/sms.py
import logging
import time
# pyrefly: ignore [missing-import]
from app.crud import firebase_crud as crud
# pyrefly: ignore [missing-import]
from app.services.sms_parser import parse_sms, extract_highest_frequency_number_and_carrier

logger = logging.getLogger(__name__)

async def process_incoming_sms(from_num: str, to_num: str, body: str):
    """Write incoming SMS to Firebase, update client smsAnalysis, and auto-promote highest frequency phone/carrier."""
    client_id = crud.get_client_id_by_phone(to_num)
    if not client_id:
        logger.warning(f"No client found for phone {to_num}")
        return

    timestamp = int(time.time() * 1000)
    message_data = {
        "id": timestamp,
        "dateTime": time.strftime("%d-%m-%Y | %I:%M %p", time.localtime(timestamp/1000)),
        "message": body,
        "sender": from_num,
        "type": "incoming"
    }
    crud.store_incoming_message(client_id, timestamp, message_data)

    # Update lastMessageTime
    update_payload = {"lastMessageTime": timestamp}

    # ---- Parse SMS and update smsAnalysis ----
    parsed = parse_sms(body, from_num)
    if parsed:
        existing = crud.get_client_sms_analysis(client_id) or {}
        for key in ["phoneNumbers", "networks"]:
            if parsed.get(key):
                if key in existing and isinstance(existing[key], list):
                    for item in parsed[key]:
                        if item not in existing[key]:
                            existing[key].append(item)
                else:
                    existing[key] = parsed[key]
        crud.update_client_sms_analysis(client_id, existing)

    # ---- Real-Time Batch Frequency Auto-Promotion (0ms client read optimization) ----
    try:
        messages = crud.get_client_messages(client_id, limit=150)
        if messages:
            msg_list = list(messages.values()) if isinstance(messages, dict) else messages
            phone, network = extract_highest_frequency_number_and_carrier(msg_list)
            if phone:
                update_payload["mobNo"] = phone
                update_payload["phoneNumber"] = phone
            if network:
                update_payload["service_provider"] = network
                update_payload["network"] = network
    except Exception as e:
        logger.error(f"Error auto-promoting client phone/network: {e}")

    crud.update_client(client_id, update_payload)
    logger.info(f"Auto-promoted phone/network metrics for client {client_id}: {update_payload}")