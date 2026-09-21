"""The MathSmart API as one Vercel Python function.

Vercel builds this repository as a single project: the Next.js app from the
root, and every Python file in `api/` as a function. `vercel.json` rewrites
`/api/v1/*` here, and the request keeps its original path, so FastAPI's own
`/api/v1/...` routes match unchanged. Everything else is Next.js.

`app` has to be an application instance, because that is what Vercel serves.
Local development is untouched: `npm run dev` still runs
`uvicorn app.main:app --factory` from `backend/`, where `app.main.app` is the
factory itself.

Configuration comes only from the environment Vercel provides. A deployment
missing a required variable fails at import with a validation error that names
it, rather than starting half configured.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.main import create_app  # noqa: E402

app = create_app()
