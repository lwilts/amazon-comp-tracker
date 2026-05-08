from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..auth import (
    get_password_hash,
    hash_password,
    require_auth,
    set_password_hash,
    verify_password,
)
from ..database import get_db
from ..schemas import (
    AuthStatusResponse,
    ChangePasswordRequest,
    LoginRequest,
    SetPasswordRequest,
)

router = APIRouter()


@router.get("/status", response_model=AuthStatusResponse)
async def auth_status(request: Request, db: Session = Depends(get_db)):
    return AuthStatusResponse(
        authenticated=bool(request.session.get("authenticated")),
        password_set=get_password_hash(db) is not None,
    )


@router.post("/login")
async def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    pw_hash = get_password_hash(db)
    if pw_hash is None:
        raise HTTPException(status_code=403, detail="no_password_set")
    if not verify_password(body.password, pw_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")
    request.session["authenticated"] = True
    request.session["logged_in_at"] = datetime.now(timezone.utc).isoformat()
    return {"ok": True}


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@router.post("/set-password")
async def set_password(body: SetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    if get_password_hash(db) is not None:
        raise HTTPException(status_code=400, detail="Password already set")
    set_password_hash(db, hash_password(body.password))
    request.session["authenticated"] = True
    request.session["logged_in_at"] = datetime.now(timezone.utc).isoformat()
    return {"ok": True}


@router.post("/change-password", dependencies=[Depends(require_auth)])
async def change_password(body: ChangePasswordRequest, db: Session = Depends(get_db)):
    pw_hash = get_password_hash(db)
    if pw_hash is None or not verify_password(body.current_password, pw_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    set_password_hash(db, hash_password(body.new_password))
    return {"ok": True}
