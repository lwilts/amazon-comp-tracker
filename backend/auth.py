from __future__ import annotations

from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from .models import AppConfig


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


def get_password_hash(db: Session) -> Optional[str]:
    row = db.get(AppConfig, "password_hash")
    return row.value if row else None


def set_password_hash(db: Session, hashed: str) -> None:
    row = db.get(AppConfig, "password_hash")
    if row:
        row.value = hashed
    else:
        db.add(AppConfig(key="password_hash", value=hashed))
    db.commit()


def require_auth(request: Request) -> None:
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=401, detail="Not authenticated")
