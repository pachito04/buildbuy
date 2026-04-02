"""
WhatsApp router:
  POST /whatsapp/webhook  — receive raw Twilio/Meta messages, store, parse with AI
  GET  /whatsapp/webhook  — Meta webhook verification challenge
  POST /whatsapp/parse    — manually trigger AI parse (authenticated compras user)
"""
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from db import supabase
from dependencies import get_current_profile, require_company
from services.ai_service import parse_whatsapp_message
from services.whatsapp_service import (
    parse_webhook_payload,
    validate_meta_token,
    validate_twilio_signature,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ParseRequest(BaseModel):
    message_id: str | None = None   # parse a stored whatsapp_messages row
    text: str | None = None          # or parse raw text directly (for testing)
    company_id: str | None = None    # required when using text directly


class ParseResponse(BaseModel):
    project_id: str | None
    project_name_mentioned: str | None
    desired_date: str | None
    urgency: str | None
    observations: str | None
    requires_review: bool
    review_reasons: list[str]
    items: list[dict[str, Any]]


# ─── Background task ─────────────────────────────────────────────────────────

async def _process_message(message_id: str, company_id: str | None) -> None:
    """
    Background: fetch the stored message, load catalog, call Claude,
    create a draft request in the `requests` table.
    """
    msg_result = (
        supabase.table("whatsapp_messages")
        .select("*")
        .eq("id", message_id)
        .single()
        .execute()
    )
    if not msg_result.data:
        logger.error("whatsapp_messages row %s not found", message_id)
        return

    msg = msg_result.data
    cid = company_id or msg.get("company_id")
    if not cid:
        logger.warning("Cannot parse message %s — company_id unknown", message_id)
        return

    # Load company catalog (up to 500 materials for the prompt)
    materials_result = (
        supabase.table("materials")
        .select("id, name, unit, category")
        .eq("company_id", cid)
        .eq("active", True)
        .limit(500)
        .execute()
    )
    materials = materials_result.data or []

    projects_result = (
        supabase.table("projects")
        .select("id, name, address")
        .eq("company_id", cid)
        .eq("active", True)
        .execute()
    )
    projects = projects_result.data or []

    ai_result = await parse_whatsapp_message(
        message=msg["body"] or "",
        materials=materials,
        projects=projects,
    )

    # Mark message as processed, store AI result
    supabase.table("whatsapp_messages").update(
        {"processed": True, "ai_result": ai_result}
    ).eq("id", message_id).execute()

    # Create draft request
    request_data = {
        "company_id": cid,
        "status": "draft",
        "raw_message": msg["body"],
        "whatsapp_message_id": message_id,
        "project_id": ai_result.get("project_id"),
        "desired_date": ai_result.get("desired_date"),
        "urgency": ai_result.get("urgency"),
        "observations": ai_result.get("observations"),
        "requires_review": ai_result.get("requires_review", True),
    }
    req_result = supabase.table("requests").insert(request_data).execute()
    if not req_result.data:
        logger.error("Failed to insert draft request for message %s", message_id)
        return

    request_id = req_result.data[0]["id"]

    # Link message → request
    supabase.table("whatsapp_messages").update(
        {"request_id": request_id}
    ).eq("id", message_id).execute()

    # Insert request items
    items = ai_result.get("items") or []
    if items:
        item_rows = [
            {
                "request_id": request_id,
                "material_id": item.get("material_id"),
                "description": item.get("name_mentioned", ""),
                "quantity": item.get("quantity") or 0,
                "unit": item.get("unit") or "",
                "match_confidence": item.get("match_confidence"),
                "observations": item.get("observations"),
            }
            for item in items
        ]
        supabase.table("request_items").insert(item_rows).execute()

    logger.info("Draft request %s created from WhatsApp message %s", request_id, message_id)


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/webhook")
async def whatsapp_meta_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Meta webhook verification handshake."""
    if hub_mode == "subscribe" and validate_meta_token(hub_verify_token or ""):
        return int(hub_challenge)
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid verify token")


@router.post("/webhook", status_code=status.HTTP_204_NO_CONTENT)
async def whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Receive a raw Twilio or Meta WhatsApp webhook.
    Validates the request, stores the message, then parses it with Claude in the background.
    """
    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        payload = await request.json()
        headers = dict(request.headers)
    else:
        # Twilio sends form-encoded data
        form = await request.form()
        payload = dict(form)
        headers = dict(request.headers)

        # Validate Twilio signature
        signature = headers.get("x-twilio-signature", "")
        if signature and not validate_twilio_signature(str(request.url), payload, signature):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid Twilio signature",
            )

    incoming = parse_webhook_payload(payload, headers)

    if not incoming.body and not incoming.media_url:
        # Ignore status callbacks and empty messages
        return

    # Resolve company from whatsapp_numbers mapping
    number_result = (
        supabase.table("whatsapp_numbers")
        .select("company_id, user_id")
        .eq("number", incoming.from_number)
        .eq("active", True)
        .single()
        .execute()
    )
    company_id: str | None = None
    if number_result.data:
        company_id = number_result.data.get("company_id")

    # Store raw message
    insert_result = (
        supabase.table("whatsapp_messages")
        .insert(
            {
                "company_id": company_id,
                "from_number": incoming.from_number,
                "to_number": incoming.to_number,
                "body": incoming.body,
                "media_url": incoming.media_url,
                "raw_payload": incoming.raw_payload,
                "processed": False,
            }
        )
        .execute()
    )

    if not insert_result.data:
        logger.error("Failed to store WhatsApp message from %s", incoming.from_number)
        return

    message_id = insert_result.data[0]["id"]

    # Process asynchronously — parse with Claude and create draft request
    background_tasks.add_task(_process_message, message_id, company_id)


@router.post("/parse", response_model=ParseResponse)
async def parse_message(
    body: ParseRequest,
    profile: dict = Depends(require_company),
):
    """
    Manually trigger AI parsing of a WhatsApp message.
    Used by compras to review/adjust the AI draft before saving.

    Accepts either:
      - message_id: parse an already-stored whatsapp_messages row
      - text + company_id: parse raw text (useful for testing)
    """
    company_id = profile["company_id"]

    if body.message_id:
        msg_result = (
            supabase.table("whatsapp_messages")
            .select("body, company_id")
            .eq("id", body.message_id)
            .single()
            .execute()
        )
        if not msg_result.data:
            raise HTTPException(status_code=404, detail="Message not found")
        text = msg_result.data["body"] or ""
    elif body.text:
        text = body.text
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either message_id or text",
        )

    materials_result = (
        supabase.table("materials")
        .select("id, name, unit, category")
        .eq("company_id", company_id)
        .eq("active", True)
        .limit(500)
        .execute()
    )
    projects_result = (
        supabase.table("projects")
        .select("id, name, address")
        .eq("company_id", company_id)
        .eq("active", True)
        .execute()
    )

    result = await parse_whatsapp_message(
        message=text,
        materials=materials_result.data or [],
        projects=projects_result.data or [],
    )

    return ParseResponse(**result)
