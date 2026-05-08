from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import PensionConfig
from ..schemas import PensionConfigCreate, PensionConfigResponse, PensionConfigUpdate

router = APIRouter(dependencies=[Depends(require_auth)])


def _get_or_404(db: Session, id: int) -> PensionConfig:
    obj = db.get(PensionConfig, id)
    if obj is None:
        raise HTTPException(status_code=404, detail="Pension config not found")
    return obj


@router.get("", response_model=List[PensionConfigResponse])
async def list_pension(db: Session = Depends(get_db)):
    return db.query(PensionConfig).order_by(PensionConfig.effective_from).all()


@router.post("", response_model=PensionConfigResponse, status_code=201)
async def create_pension(body: PensionConfigCreate, db: Session = Depends(get_db)):
    obj = PensionConfig(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{id}", response_model=PensionConfigResponse)
async def update_pension(id: int, body: PensionConfigUpdate, db: Session = Depends(get_db)):
    obj = _get_or_404(db, id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{id}", status_code=204)
async def delete_pension(id: int, db: Session = Depends(get_db)):
    obj = _get_or_404(db, id)
    db.delete(obj)
    db.commit()
