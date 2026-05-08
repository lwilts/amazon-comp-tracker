from __future__ import annotations

import json
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


# ─── Salary ──────────────────────────────────────────────────────────────────

class SalaryConfigBase(BaseModel):
    annual_amount: float
    effective_from: date
    effective_to: Optional[date] = None
    notes: Optional[str] = None


class SalaryConfigCreate(SalaryConfigBase):
    pass


class SalaryConfigUpdate(SalaryConfigBase):
    pass


class SalaryConfigResponse(SalaryConfigBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


# ─── Bonuses ─────────────────────────────────────────────────────────────────

class BonusConfigBase(BaseModel):
    name: str
    annual_amount: float
    frequency: str  # "monthly" | "quarterly"
    pay_months: List[int] = []
    effective_from: date
    effective_to: Optional[date] = None
    notes: Optional[str] = None

    @field_validator("frequency")
    @classmethod
    def validate_frequency(cls, v: str) -> str:
        if v not in ("monthly", "quarterly", "annual", "custom"):
            raise ValueError("frequency must be 'monthly', 'quarterly', 'annual', or 'custom'")
        return v


class BonusConfigCreate(BonusConfigBase):
    pass


class BonusConfigUpdate(BonusConfigBase):
    pass


class BonusConfigResponse(BonusConfigBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

    @field_validator("pay_months", mode="before")
    @classmethod
    def parse_pay_months(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v


# ─── RSU ─────────────────────────────────────────────────────────────────────

class RSUVestBase(BaseModel):
    vest_date: date
    shares: int
    notes: Optional[str] = None


class RSUVestCreate(RSUVestBase):
    award_id: int


class RSUVestUpdate(BaseModel):
    vest_date: Optional[date] = None
    shares: Optional[int] = None
    locked_price_usd: Optional[float] = None
    locked_fx_rate: Optional[float] = None
    locked_value_gbp: Optional[float] = None
    is_locked: Optional[bool] = None
    manually_overridden: Optional[bool] = None
    notes: Optional[str] = None


class RSUVestResponse(RSUVestBase):
    id: int
    award_id: int
    locked_price_usd: Optional[float] = None
    locked_fx_rate: Optional[float] = None
    locked_value_gbp: Optional[float] = None
    is_locked: bool
    manually_overridden: bool
    model_config = ConfigDict(from_attributes=True)


class RSUVestLockRequest(BaseModel):
    locked_price_usd: Optional[float] = None
    locked_fx_rate: Optional[float] = None
    locked_value_gbp: Optional[float] = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> RSUVestLockRequest:
        if self.locked_price_usd is None and self.locked_fx_rate is None and self.locked_value_gbp is None:
            raise ValueError("Provide at least one of: locked_price_usd, locked_fx_rate, locked_value_gbp")
        return self


class RSUAwardBase(BaseModel):
    award_ref: str
    grant_date: date
    notes: Optional[str] = None


class RSUAwardCreate(RSUAwardBase):
    pass


class RSUAwardUpdate(RSUAwardBase):
    pass


class RSUAwardResponse(RSUAwardBase):
    id: int
    vests: List[RSUVestResponse] = []
    model_config = ConfigDict(from_attributes=True)


# ─── Pay Schedule ─────────────────────────────────────────────────────────────

class PayLineItem(BaseModel):
    line_date: date
    pay_date: date
    type: str       # "salary" | "bonus" | "rsu"
    description: str
    cash_gbp: Optional[float] = None
    rsu_shares: Optional[int] = None
    rsu_value_gbp: Optional[float] = None
    is_estimated: bool
    status: str     # "confirmed" | "estimated" | "locked" | "manual"
    tax_year: str


class TaxYearSubtotals(BaseModel):
    base_salary: float
    bonus: float
    rsu: float
    total_cash: float
    total_inc_rsu: float


class TaxYearBlock(BaseModel):
    tax_year: str
    lines: List[PayLineItem]
    subtotals: TaxYearSubtotals


class ScheduleResponse(BaseModel):
    tax_years: List[TaxYearBlock]


# ─── Prices ───────────────────────────────────────────────────────────────────

class PriceResponse(BaseModel):
    amzn_usd: float
    usd_gbp: float
    fetched_at: datetime
    amzn_gbp: float


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    password: str


class AuthStatusResponse(BaseModel):
    authenticated: bool


class SetPasswordRequest(BaseModel):
    password: str
    confirm_password: str

    @model_validator(mode="after")
    def passwords_match(self) -> SetPasswordRequest:
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

    @model_validator(mode="after")
    def passwords_match(self) -> ChangePasswordRequest:
        if self.new_password != self.confirm_password:
            raise ValueError("New passwords do not match")
        return self
