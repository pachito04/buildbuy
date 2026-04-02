from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from supabase import Client, create_client

from config import get_settings

settings = get_settings()

# Async engine using asyncpg — pool_size=1 / max_overflow=0 for Vercel serverless
engine = create_async_engine(
    settings.database_url,
    pool_size=1,
    max_overflow=0,
    pool_pre_ping=True,
    echo=settings.environment == "development",
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# Supabase client (service role) — used only in server-side routes (webhook, parse)
supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
)
