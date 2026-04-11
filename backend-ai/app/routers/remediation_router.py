from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.remediation_log import RemediationLog
from app.models.user import User
from app.schemas.remediation_schema import RemediationLogResponse
from app.schemas.api_schema import ApiResponse, ok

router = APIRouter(prefix="/remediation", tags=["remediation"])


@router.get("/logs", response_model=ApiResponse[list[RemediationLogResponse]])
def list_remediation_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=1000000),
):
    return ok((
        db.query(RemediationLog)
        .filter(RemediationLog.user_id == current_user.id)
        .order_by(RemediationLog.created_at.desc(), RemediationLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    ))
