"""Shared rate limiter configuration for the Skiller API."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address


def get_rate_limit_key(request):
    """
    Build a rate-limit key from the client IP and, when available,
    an email or user identifier supplied by the application.
    """

    client_ip = get_remote_address(request)

    email = getattr(request.state, "rate_limit_email", "")
    user_id = getattr(request.state, "rate_limit_user_id", "")

    email = str(email or "").strip().lower()
    user_id = str(user_id or "").strip()

    identifier = email or user_id

    if identifier:
        return f"{client_ip}:{identifier}"

    return client_ip


storage_url = os.getenv("RATE_LIMIT_STORAGE_URL", "").strip()

limiter = Limiter(
    key_func=get_rate_limit_key,
    storage_uri=storage_url or "memory://",
    headers_enabled=True,
)
