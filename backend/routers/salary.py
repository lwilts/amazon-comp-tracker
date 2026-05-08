from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import SalaryConfig
from ..schemas import SalaryConfigCreate, SalaryConfigResponse, SalaryConfigUpdate

router = APIRouter(dependencies=[Depends(require_auth)])


def _get_or_404(db: Session, id: int) -> SalaryConfig:
    obj = db.get(SalaryConfig, id)
    if obj is None:
        raise HTTPException(status_code=404, detail="Salary config not found")
    return obj


@router.get("", response_model=List[SalaryConfigResponse])
async def list_salary(db: Session = Depends(get_db)):
    return db.query(SalaryConfig).order_by(SalaryConfig.effective_from).all()


@router.post("", response_model=SalaryConfigResponse, status_code=201)
async def create_salary(body: SalaryConfigCreate, db: Session = Depends(get_db)):
    obj = SalaryConfig(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{id}", response_model=SalaryConfigResponse)
async def update_salary(id: int, body: SalaryConfigUpdate, db: Session = Depends(get_db)):
    obj = _get_or_404(db, id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{id}", status_code=204)
async def delete_salary(id: int, db: Session = Depends(get_db)):
    obj = _get_or_404(db, id)
    db.delete(obj)
    db.commit()
