
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core import get_current_user
from db.dependencies import get_db
from services.payout_account_service import PayoutAccountService


router = APIRouter(
    prefix="/api/payout-account",
    tags=["Payout Account"],
)


# ============================================================
# REQUEST SCHEMA
# ============================================================

class PayoutAccountIn(BaseModel):
    payout_type: str = Field(
        min_length=1,
        max_length=20,
    )

    account_holder_name: str | None = Field(
        default=None,
        max_length=255,
    )

    account_number: str | None = Field(
        default=None,
        max_length=100,
    )

    ifsc_code: str | None = Field(
        default=None,
        max_length=20,
    )

    upi_id: str | None = Field(
        default=None,
        max_length=255,
    )


# ============================================================
# PAYOUT ACCOUNT VALIDATION
# ============================================================

def validate_payout_account(data: PayoutAccountIn):
    """Validate the payout method and its required details."""

    payout_type = data.payout_type.strip().lower()

    if payout_type not in ("bank_account", "upi"):
        raise HTTPException(
            status_code=400,
            detail="payout_type must be 'bank_account' or 'upi'",
        )

    if payout_type == "bank_account":
        holder_name = (
            data.account_holder_name.strip()
            if data.account_holder_name
            else ""
        )

        account_number = (
            data.account_number.strip()
            if data.account_number
            else ""
        )

        ifsc_code = (
            data.ifsc_code.strip().upper()
            if data.ifsc_code
            else ""
        )

        if not holder_name:
            raise HTTPException(
                status_code=400,
                detail="Account holder name is required",
            )

        if not account_number:
            raise HTTPException(
                status_code=400,
                detail="Account number is required",
            )

        if not re.fullmatch(
            r"[A-Za-z0-9]{1,100}",
            account_number,
        ):
            raise HTTPException(
                status_code=400,
                detail="Account number contains invalid characters",
            )

        # Indian IFSC structure:
        # Four letters, zero, then six alphanumeric characters.
        if not re.fullmatch(
            r"[A-Z]{4}0[A-Z0-9]{6}",
            ifsc_code,
        ):
            raise HTTPException(
                status_code=400,
                detail="Please enter a valid 11-character IFSC code",
            )

    else:
        upi_id = (
            data.upi_id.strip()
            if data.upi_id
            else ""
        )

        if not re.fullmatch(
            r"[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}",
            upi_id,
        ):
            raise HTTPException(
                status_code=400,
                detail="Please enter a valid UPI ID",
            )

    return payout_type


# ============================================================
# RESPONSE SERIALIZATION
# ============================================================

def serialize_payout_account(account):
    return {
        "id": account.id,
        "user_id": account.user_id,
        "payout_type": account.payout_type,
        "account_holder_name": account.account_holder_name,
        "account_number": account.account_number,
        "ifsc_code": account.ifsc_code,
        "upi_id": account.upi_id,
        "is_verified": account.is_verified,
        "is_active": account.is_active,
        "created_at": (
            account.created_at.isoformat()
            if account.created_at
            else None
        ),
        "updated_at": (
            account.updated_at.isoformat()
            if account.updated_at
            else None
        ),
    }


# ============================================================
# GET MY PAYOUT ACCOUNT
# ============================================================

@router.get("/me")
async def get_my_payout_account(
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the authenticated creator's payout account."""

    if current.get("role") != "creator":
        raise HTTPException(
            status_code=403,
            detail="Only creators can access payout accounts",
        )

    account = await PayoutAccountService.get_by_user(
        db,
        current["id"],
    )

    if not account:
        raise HTTPException(
            status_code=404,
            detail="Payout account not found",
        )

    return serialize_payout_account(account)


# ============================================================
# CREATE OR UPDATE MY PAYOUT ACCOUNT
# ============================================================

@router.put("/me")
async def update_my_payout_account(
    data: PayoutAccountIn,
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create or update the authenticated creator's payout details.

    Switching payout types clears the fields belonging to the
    previous payout type. Any update requires verification again.
    """

    if current.get("role") != "creator":
        raise HTTPException(
            status_code=403,
            detail="Only creators can manage payout accounts",
        )

    payout_type = validate_payout_account(data)

    if payout_type == "bank_account":
        account_holder_name = data.account_holder_name.strip()
        account_number = data.account_number.strip()
        ifsc_code = data.ifsc_code.strip().upper()
        upi_id = None

    else:
        account_holder_name = None
        account_number = None
        ifsc_code = None
        upi_id = data.upi_id.strip().lower()

    try:
        account = await PayoutAccountService.create_or_update(
            db=db,
            user_id=current["id"],
            payout_type=payout_type,
            account_holder_name=account_holder_name,
            account_number=account_number,
            ifsc_code=ifsc_code,
            upi_id=upi_id,
            is_active=True,
        )

        # The service now flushes without committing.
        # Commit here to persist the account changes.
        await db.commit()
        await db.refresh(account)

        return serialize_payout_account(account)

    except ValueError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception:
        await db.rollback()
        raise
