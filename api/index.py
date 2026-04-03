import os
import sys

# Add backend/ directory to path so all internal backend imports resolve correctly:
# - "from config import get_settings" (config.py lives in backend/)
# - "from db import supabase" (db.py lives in backend/)
# - "from routers import ..." (routers/ lives in backend/)
# - "from services import ..." (services/ lives in backend/)
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(repo_root, "backend")

if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Import directly from main (not "backend.main") since backend/ is now in path
from main import app  # noqa: F401 — Vercel looks for `app`
