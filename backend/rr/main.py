"""Mount /api/v1 (routers per domain). Phase 4 purchase verification and Phase 6 admin (RBAC via core.require_role) plug in here."""
from fastapi import APIRouter, FastAPI

from .core import install_error_handlers
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from .routers import admin, auth, billing, online, player, public, runs

v1 = APIRouter(prefix="/api/v1")
for r in (auth.router, player.router, runs.router, online.router, billing.router, public.router, admin.router):
    v1.include_router(r)


def mount(app: FastAPI):
    install_error_handlers(app)
    app.include_router(v1)
    # Website game art (copied from mobile/assets/game) → /api/static/game/<file>
    app.mount("/api/static", StaticFiles(directory=Path(__file__).resolve().parent.parent / "static"), name="static")

    async def start_voided_poll():  # refunds: Voided Purchases poll every 6 h (no-op until Play is configured)
        import asyncio

        from .billing import voided_loop
        asyncio.get_event_loop().create_task(voided_loop())

    app.router.on_startup.append(start_voided_poll)
