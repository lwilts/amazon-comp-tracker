from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .database import SessionLocal, init_db, lock_historical_vests
from .routers import auth, bonuses, pension, prices, rsu, salary, schedule

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

SECRET_KEY = os.environ.get("SECRET_KEY", "changeme-insecure")
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if SECRET_KEY == "changeme-insecure":
        logger.warning("⚠️  SECRET_KEY is using the insecure default — set SECRET_KEY env var!")

    init_db()

    db = SessionLocal()
    try:
        n = lock_historical_vests(db)
        if n:
            logger.info("Locked %d past vest(s) using historical prices", n)
    finally:
        db.close()

    from .scheduler import start_scheduler
    start_scheduler()

    yield

    from .scheduler import stop_scheduler
    stop_scheduler()


app = FastAPI(title="Compensation Tracker", lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    session_cookie="amazon-comp-tracker-session",
    max_age=86400,
    https_only=False,
    same_site="lax",
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(salary.router, prefix="/api/salary", tags=["salary"])
app.include_router(bonuses.router, prefix="/api/bonuses", tags=["bonuses"])
app.include_router(rsu.router, prefix="/api/rsu", tags=["rsu"])
app.include_router(pension.router, prefix="/api/pension", tags=["pension"])
app.include_router(schedule.router, prefix="/api/schedule", tags=["schedule"])
app.include_router(prices.router, prefix="/api/prices", tags=["prices"])

# Serve React SPA — must be after API routes
if os.path.isdir(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
