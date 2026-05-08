from __future__ import annotations

import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import BonusConfig
from ..schemas import BonusConfigCreate, BonusConfigResponse, BonusConfigUpdate

router = APIRouter(dependencies=[Depends(require_auth)])


def _get_or_404(db: Session, id: int) -> BonusConfig:
    obj = db.get(BonusConfig, id)
    if obj is None:
        raise HTTPException(status_code=404, detail="Bonus config not found")
    return obj


@router.get("", response_model=List[BonusConfigResponse])
async def list_bonuses(db: Session = Depends(get_db)):
    return db.query(BonusConfig).order_by(BonusConfig.effective_from).all()


@router.post("", response_model=BonusConfigResponse, status_code=201)
async def create_bonus(body: BonusConfigCreate, db: Session = Depends(get_db)):
    data = body.model_dump()
    data["pay_months"] = json.dumps(data["pay_months"])
    obj = BonusConfig(**data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{id}", response_model=BonusConfigResponse)
async def update_bonus(id: int, body: BonusConfigUpdate, db: Session = Depends(get_db)):
    obj = _get_or_404(db, id)
    data = body.model_dump(exclude_unset=True)
    if "pay_months" in data:
        data["pay_months"] = json.dumps(data["pay_months"])
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{id}", status_code=204)
async def delete_bonus(id: int, db: Session = Depends(get_db)):
    obj = _get_or_404(db, id)
    db.delete(obj)
    db.commit()
