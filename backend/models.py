from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class SalaryConfig(Base):
    __tablename__ = "salary_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    annual_amount: Mapped[float] = mapped_column(Float, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class BonusConfig(Base):
    __tablename__ = "bonus_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    annual_amount: Mapped[float] = mapped_column(Float, nullable=False)
    frequency: Mapped[str] = mapped_column(String, nullable=False)  # "monthly" | "quarterly"
    pay_months: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # JSON array
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class RSUAward(Base):
    __tablename__ = "rsu_awards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    award_ref: Mapped[str] = mapped_column(String, nullable=False)
    grant_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    vests: Mapped[List[RSUVest]] = relationship(
        "RSUVest", back_populates="award", cascade="all, delete-orphan"
    )


class RSUVest(Base):
    __tablename__ = "rsu_vests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    award_id: Mapped[int] = mapped_column(Integer, ForeignKey("rsu_awards.id"), nullable=False)
    vest_date: Mapped[date] = mapped_column(Date, nullable=False)
    shares: Mapped[int] = mapped_column(Integer, nullable=False)
    locked_price_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    locked_fx_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    locked_value_gbp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    manually_overridden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    award: Mapped[RSUAward] = relationship("RSUAward", back_populates="vests")


class PensionConfig(Base):
    __tablename__ = "pension_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    amount_type: Mapped[str] = mapped_column(String, nullable=False)  # "percentage" | "fixed"
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    amzn_usd: Mapped[float] = mapped_column(Float, nullable=False)
    usd_gbp: Mapped[float] = mapped_column(Float, nullable=False)


class AppConfig(Base):
    __tablename__ = "app_config"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
