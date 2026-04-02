"""
Provider-agnostic WhatsApp webhook normalizer.
Supports Twilio and Meta (WhatsApp Business API) payloads.
"""
import hashlib
import hmac
import logging
from dataclasses import dataclass

from config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class IncomingMessage:
    from_number: str          # E.164 format
    to_number: str | None
    body: str | None
    media_url: str | None
    provider: str             # "twilio" | "meta"
    raw_payload: dict


def _detect_provider(payload: dict, headers: dict) -> str:
    """Detect whether the webhook came from Twilio or Meta."""
    if "SmsMessageSid" in payload or "MessageSid" in payload:
        return "twilio"
    if payload.get("object") in ("whatsapp_business_account", "page"):
        return "meta"
    return "unknown"


def _parse_twilio(payload: dict) -> IncomingMessage:
    from_number = payload.get("From", "").replace("whatsapp:", "")
    to_number = payload.get("To", "").replace("whatsapp:", "") or None
    body = payload.get("Body") or None
    media_url = payload.get("MediaUrl0") or None

    return IncomingMessage(
        from_number=from_number,
        to_number=to_number,
        body=body,
        media_url=media_url,
        provider="twilio",
        raw_payload=payload,
    )


def _parse_meta(payload: dict) -> IncomingMessage:
    try:
        entry = payload["entry"][0]
        change = entry["changes"][0]["value"]
        message = change["messages"][0]
        from_number = "+" + message["from"]
        to_number = "+" + change["metadata"]["phone_number_id"]
        body = message.get("text", {}).get("body") or None
        media_url = None
        if message.get("type") in ("image", "document", "audio"):
            media_url = message.get(message["type"], {}).get("id")
    except (KeyError, IndexError) as exc:
        logger.warning("Could not parse Meta payload: %s", exc)
        from_number = "unknown"
        to_number = None
        body = None
        media_url = None

    return IncomingMessage(
        from_number=from_number,
        to_number=to_number,
        body=body,
        media_url=media_url,
        provider="meta",
        raw_payload=payload,
    )


def parse_webhook_payload(payload: dict, headers: dict) -> IncomingMessage:
    """Normalize a raw Twilio or Meta webhook payload into an IncomingMessage."""
    provider = _detect_provider(payload, headers)
    if provider == "twilio":
        return _parse_twilio(payload)
    if provider == "meta":
        return _parse_meta(payload)

    # Fallback — return what we can
    logger.warning("Unknown WhatsApp provider, using raw payload")
    return IncomingMessage(
        from_number=payload.get("From", "unknown"),
        to_number=None,
        body=str(payload),
        media_url=None,
        provider="unknown",
        raw_payload=payload,
    )


def validate_twilio_signature(
    request_url: str,
    params: dict,
    x_twilio_signature: str,
) -> bool:
    """
    Validate the X-Twilio-Signature header to ensure the request is from Twilio.
    https://www.twilio.com/docs/usage/webhooks/webhooks-security
    """
    settings = get_settings()
    if not settings.twilio_auth_token:
        logger.warning("TWILIO_AUTH_TOKEN not set — skipping signature validation")
        return True

    # Build the string to sign: URL + sorted POST params
    s = request_url
    for key in sorted(params.keys()):
        s += key + params[key]

    mac = hmac.new(
        settings.twilio_auth_token.encode("utf-8"),
        s.encode("utf-8"),
        hashlib.sha1,
    )
    import base64
    expected = base64.b64encode(mac.digest()).decode("utf-8")
    return hmac.compare_digest(expected, x_twilio_signature)


def validate_meta_token(token: str) -> bool:
    """Validate the Meta hub.verify_token for webhook verification."""
    settings = get_settings()
    if not settings.meta_verify_token:
        return False
    return token == settings.meta_verify_token
