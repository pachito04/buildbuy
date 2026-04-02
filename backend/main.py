from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from routers import health, whatsapp

settings = get_settings()

app = FastAPI(
    title="Build Buy Pool API",
    description="Server-side API for WhatsApp intake and AI parsing",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(whatsapp.router, prefix="/api/whatsapp", tags=["whatsapp"])
