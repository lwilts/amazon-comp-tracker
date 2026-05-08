from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import AppConfig

router = APIRouter(dependencies=[Depends(require_auth)])

VALID_CURRENCIES = {"GBP", "USD"}


class SettingsResponse(BaseModel):
    display_currency: str


class SettingsUpdate(BaseModel):
    display_currency: str


@router.get("", response_model=SettingsResponse)
async def get_settings(db: Session = Depends(get_db)):
    row = db.get(AppConfig, "display_currency")
    return SettingsResponse(display_currency=row.value if row else "GBP")


@router.put("", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdate, db: Session = Depends(get_db)):
    if body.display_currency not in VALID_CURRENCIES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Currency must be one of {VALID_CURRENCIES}")
    row = db.get(AppConfig, "display_currency")
    if row:
        row.value = body.display_currency
    else:
        db.add(AppConfig(key="display_currency", value=body.display_currency))
    db.commit()
    return SettingsResponse(display_currency=body.display_currency)
