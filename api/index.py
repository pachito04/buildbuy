import sys
import os

# Ensure the backend package is importable from the Vercel function context
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.main import app  # noqa: F401 — Vercel looks for `app`
