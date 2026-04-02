"""
AI service: parses raw WhatsApp messages from architects using Claude.
Returns a structured draft requerimiento for compras to review.
"""
import json
import logging

import anthropic

from config import get_settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
Eres un asistente de compras para una empresa constructora argentina.
Tu tarea es analizar mensajes de WhatsApp enviados por arquitectos
y extraer información estructurada sobre pedidos de materiales.

Reglas:
- Respondé SIEMPRE con un objeto JSON válido. Sin texto adicional fuera del JSON.
- Si un campo no está disponible usá null.
- Si una cantidad o dato es ambiguo, usá null y marcá requires_review: true.
- Normalizá las unidades de medida:
    bolsas / bolsa / bls → bolsa
    kilos / kg / kilogramos → kg
    metros cuadrados / m2 / mts2 → m2
    metros lineales / ml / metros → ml
    unidades / u / unid → unidad
    litros / lts / l → litro
    toneladas / tn / ton → ton
    saco / sacos → saco
- Para obra: intentá hacer match fuzzy con los nombres del catálogo.
  Si no hay match claro, dejá project_id null y ponés el nombre mencionado en project_name_mentioned.
- Para materiales: intentá hacer match fuzzy con el catálogo.
  Si no hay match, dejá material_id null y poné el texto original en name_mentioned.
"""


def _build_user_prompt(
    message: str,
    materials: list[dict],
    projects: list[dict],
) -> str:
    return f"""
Mensaje de WhatsApp recibido:
\"\"\"
{message}
\"\"\"

Catálogo de materiales de la empresa:
{json.dumps(materials, ensure_ascii=False, indent=2)}

Obras/proyectos disponibles:
{json.dumps(projects, ensure_ascii=False, indent=2)}

Extraé la información y respondé con este JSON exacto:
{{
  "project_id": "<uuid o null>",
  "project_name_mentioned": "<texto tal como fue mencionado, o null>",
  "desired_date": "<YYYY-MM-DD o null>",
  "urgency": "<low|medium|high o null>",
  "observations": "<notas generales del pedido o null>",
  "requires_review": <true si hay ambigüedades importantes, false si todo es claro>,
  "review_reasons": ["<razón 1>", "<razón 2>"],
  "items": [
    {{
      "material_id": "<uuid del match exacto/cercano, o null>",
      "name_mentioned": "<texto original del mensaje>",
      "quantity": <número o null>,
      "unit": "<unidad normalizada o null>",
      "observations": "<notas específicas del ítem o null>",
      "match_confidence": "<alta|media|baja|sin_match>"
    }}
  ]
}}
"""


async def parse_whatsapp_message(
    message: str,
    materials: list[dict],
    projects: list[dict],
) -> dict:
    """
    Call Claude to parse a raw WhatsApp message and return a structured dict.

    Args:
        message: Raw WhatsApp text from the architect.
        materials: Company's material catalog — list of {id, name, unit, category}.
        projects: Company's projects — list of {id, name, address}.

    Returns:
        Parsed dict matching the JSON schema in _build_user_prompt.
    """
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": _build_user_prompt(message, materials, projects),
            }
        ],
    )

    raw_text = response.content[0].text.strip()

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error("Claude returned non-JSON: %s", raw_text)
        # Fallback: return a requires_review draft so compras can fill in manually
        result = {
            "project_id": None,
            "project_name_mentioned": None,
            "desired_date": None,
            "urgency": None,
            "observations": message,
            "requires_review": True,
            "review_reasons": ["No se pudo parsear la respuesta de IA"],
            "items": [],
        }

    return result
