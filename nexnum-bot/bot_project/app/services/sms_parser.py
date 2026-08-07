# app/services/sms_parser.py
import re
import asyncio
from typing import List, Optional, Dict, Any, Tuple
from collections import Counter
import phonenumbers
from phonenumbers import carrier

# ---- Deep Phone Number Extraction Patterns ----
PHONE_EXPLICIT_PATTERNS = [
    re.compile(r'(?:Jio|AIRTEL|BSNL|VI|Vodafone|Idea)\s*(?:Number|No\.?|Mob\.?)\s*[:\-=]?\s*(?:\+?91|0)?\s*([6-9]\d{9})\b', re.I),
    re.compile(r'(?:your\s+)?(?:mobile|mob\.?|phone|tel|contact)\s*(?:number|no\.?)?\s*[:\-=]?\s*(?:\+?91|0)?\s*([6-9]\d{9})\b', re.I),
    re.compile(r'(?:recharge|plan|pack)\s+(?:for|on|of)?\s*(?:mobile|num|no\.?)?\s*[:\-=]?\s*(?:\+?91|0)?\s*([6-9]\d{9})\b', re.I),
    re.compile(r'(?:SIM|Slot)\s*[12]?\s*[:\-=]?\s*(?:\+?91|0)?\s*([6-9]\d{9})\b', re.I),
    re.compile(r'(?:user|account|id|mob|num)\s*[:\-=]?\s*(?:\+?91|0)?\s*([6-9]\d{9})\b', re.I),
    re.compile(r'\b(?:\+?91|0)?([6-9]\d{9})\b'),
]

# ---- Network Operator Patterns ----
SENDER_NETWORK_MAP = [
    (re.compile(r'AIRTEL|JD-AIRTEL|VM-AIRTEL|AT-AIRTEL', re.I), "Airtel"),
    (re.compile(r'JIOINF|JIOMSG|JIONET|JIO', re.I), "Jio"),
    (re.compile(r'BSNLSM|BSNL', re.I), "BSNL"),
    (re.compile(r'VISMOB|VI-|VODA|VODAFONE', re.I), "Vodafone"),
    (re.compile(r'IDEACEL|IDEA', re.I), "Vi"),
    (re.compile(r'MTNL', re.I), "MTNL"),
]

BODY_NETWORK_MAP = [
    (re.compile(r'\bJio\b', re.I), "Jio"),
    (re.compile(r'\bAirtel\b', re.I), "Airtel"),
    (re.compile(r'\bBSNL\b', re.I), "BSNL"),
    (re.compile(r'\bVodafone\b', re.I), "Vodafone"),
    (re.compile(r'\b(?:Idea|Vi)\b', re.I), "Vi"),
    (re.compile(r'\bMTNL\b', re.I), "MTNL"),
]

# ---- OTP / Code Extraction Patterns ----
OTP_PATTERNS = [
    # G-123456 (Google / Firebase / Android)
    re.compile(r'\bG[\s\-]*([0-9]{4,8})\b', re.I),
    # WhatsApp style: 654-117
    re.compile(r'(?:code|OTP)\s*:?\s*([0-9]{3}[\-\s][0-9]{3})\b', re.I),
    # Flipkart / Standard OTP: [#] 314415
    re.compile(r'\[#\]\s*([0-9]{4,8})', re.I),
    # Keyword matches (e.g. "code is: 48392", "OTP is 1234", "password: 8943")
    re.compile(r'(?:OTP|code|verification|passcode|secret|pin|login|auth|password|account)\s*(?:is\s*:?|are|:|\-|\=)?\s*([0-9]{4,8})\b', re.I),
    # Leading OTP (e.g. "928374 to verify your WhatsApp", "4930 is your OTP")
    re.compile(r'\b([0-9]{4,8})\s*(?:is\s+your|is\s+the|is\s+an|is\s+verification|to\s+verify|valid\s+for)', re.I),
    re.compile(r'(?:use\s+code|enter\s+code|key\s+is|use)\s*:?\s*([0-9]{4,8})\b', re.I),
    # General 4-6 digit fallback
    re.compile(r'\b([0-9]{4,6})\b'),
]

def extract_phone_numbers(message: str) -> List[str]:
    """
    Extract unique 10-digit Indian mobile numbers from text.
    Fast pre-filtering: skips messages with zero digits instantly.
    """
    if not re.search(r'\d', message):
        return []

    found = []
    # 1. Phonenumbers library matcher
    try:
        for match in phonenumbers.PhoneNumberMatcher(message, "IN"):
            num = match.number
            if phonenumbers.is_valid_number(num):
                formatted = phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.NATIONAL).replace(" ", "").replace("-", "")
                if len(formatted) == 10 and formatted[0] in "6789":
                    if formatted not in found:
                        found.append(formatted)
    except Exception:
        pass

    # 2. Explicit Regex fallback
    for pat in PHONE_EXPLICIT_PATTERNS:
        matches = pat.findall(message)
        for num in matches:
            clean_num = str(num).replace(" ", "").replace("-", "").strip()
            if len(clean_num) == 10 and clean_num[0] in "6789":
                if clean_num not in found:
                    found.append(clean_num)
    return found

def extract_network_operator(sender: str, message: str) -> Optional[str]:
    """
    Identify cellular network operator from sender ID or message body.
    """
    for pat, name in SENDER_NETWORK_MAP:
        if pat.search(sender):
            return name
    for pat, name in BODY_NETWORK_MAP:
        if pat.search(message):
            return name
    return None

def extract_otp_code(message: str) -> Optional[str]:
    """
    Extract verification code (4-8 digits or hyphenated 3-3) from message.
    """
    if not re.search(r'\d', message):
        return None

    for pat in OTP_PATTERNS:
        match = pat.search(message)
        if match:
            code = match.group(1).replace("-", "").replace(" ", "")
            if len(code) in (4, 5, 6, 8):
                return code
    return None

def extract_highest_frequency_number_and_carrier(messages: List[Dict[str, Any]]) -> Tuple[Optional[str], Optional[str]]:
    """
    Scans all messages (e.g. up to 150) without sender filtering.
    Filters digit-containing messages for maximum speed.
    Calculates number frequency counts across all messages and returns
    the highest-frequency (most common) phone number and its carrier.
    """
    phone_counter = Counter()
    network_counter = Counter()

    for m in messages:
        if not isinstance(m, dict):
            continue
        body = m.get("message", "")
        sender = m.get("sender", "")

        # Pre-filter digit presence for speed
        if not re.search(r'\d', body):
            # Still check sender network operator
            op = extract_network_operator(sender, body)
            if op:
                network_counter[op] += 1
            continue

        nums = extract_phone_numbers(body)
        for num_str in nums:
            phone_counter[num_str] += 1
            try:
                parsed = phonenumbers.parse(num_str, "IN")
                if phonenumbers.is_valid_number(parsed):
                    c_name = carrier.name_for_number(parsed, "en")
                    if c_name:
                        network_counter[c_name] += 1
            except Exception:
                pass

        op = extract_network_operator(sender, body)
        if op:
            network_counter[op] += 1

    highest_phone = phone_counter.most_common(1)[0][0] if phone_counter else None
    highest_network = network_counter.most_common(1)[0][0] if network_counter else None

    if highest_phone and not highest_phone.startswith("+"):
        clean_p = highest_phone.strip().replace(" ", "").replace("-", "")
        if len(clean_p) == 10 and clean_p[0] in "6789":
            highest_phone = f"+91{clean_p}"
        elif clean_p.startswith("91") and len(clean_p) == 12:
            highest_phone = f"+{clean_p}"

    return highest_phone, highest_network

from concurrent.futures import ThreadPoolExecutor

_PARSER_EXECUTOR = ThreadPoolExecutor(max_workers=8)

async def extract_highest_frequency_number_and_carrier_async(messages: List[Dict[str, Any]]) -> Tuple[Optional[str], Optional[str]]:
    """
    Async wrapper executing in a high-performance worker pool for super ultra fast parallel processing.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_PARSER_EXECUTOR, extract_highest_frequency_number_and_carrier, messages)

def parse_sms(message: str, sender: str) -> Dict[str, Any]:
    """
    Parse an incoming SMS for numbers, telecom networks, and verification codes.
    Returns dict with keys: phoneNumbers, networks, otpCode
    """
    phone_numbers = extract_phone_numbers(message)
    network = extract_network_operator(sender, message)
    otp_code = extract_otp_code(message)

    return {
        "phoneNumbers": phone_numbers,
        "networks": [network] if network else [],
        "otpCode": otp_code
    }