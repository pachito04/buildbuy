from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db import supabase

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    """
    Validate a Supabase JWT and return the auth.users record.
    Raises 401 if the token is missing or invalid.
    """
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    try:
        response = supabase.auth.get_user(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if not response or not response.user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return response.user


async def get_current_profile(user=Depends(get_current_user)) -> dict:
    """
    Fetch the profile row for the authenticated user.
    Returns a dict with id, company_id, full_name, etc.
    """
    result = (
        supabase.table("profiles")
        .select("id, company_id, full_name, phone")
        .eq("id", user.id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Profile not found")

    return result.data


def require_company(profile: dict = Depends(get_current_profile)) -> dict:
    """Ensures the user belongs to a company."""
    if not profile.get("company_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not associated with a company",
        )
    return profile
