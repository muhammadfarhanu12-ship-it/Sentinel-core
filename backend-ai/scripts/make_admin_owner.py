from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import settings  # noqa: E402
from app.security.admin_access import SUPER_ADMIN_ROLE, build_admin_update, get_effective_admin_role  # noqa: E402
from app.utils.hash import hash_password  # noqa: E402


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Promote or create a platform owner for the admin panel.")
    parser.add_argument("--email", required=True, help="Target user email")
    parser.add_argument("--create", action="store_true", help="Create the user if it does not exist")
    parser.add_argument("--password", help="Temporary password for a newly created admin user")
    return parser.parse_args()


def _insert_audit_record(db: Any, *, email: str, old_role: str | None, new_role: str) -> None:
    now = _utcnow()
    db["audit_logs"].insert_one(
        {
            "timestamp": now,
            "actor": "admin-owner-cli",
            "actor_type": "SYSTEM",
            "action": "admin_owner_promoted",
            "event_type": "admin_owner_promoted",
            "resource": "admin_user",
            "severity": "WARNING",
            "metadata": {
                "target_email": email,
                "old_admin_role": old_role,
                "new_admin_role": new_role,
            },
            "old_value": {"admin_role": old_role},
            "new_value": {"admin_role": new_role, "admin_status": "active"},
            "created_at": now,
            "updated_at": now,
        }
    )


def promote_admin_owner(
    db: Any,
    *,
    email: str,
    create: bool,
    password: str | None,
) -> dict[str, Any]:
    users = db["users"]
    user = users.find_one({"email": email})
    old_admin_role = get_effective_admin_role(user) if user else None

    password_hash = hash_password(password) if create and password else None
    if user is None:
        if not create:
            raise ValueError(f"User not found for email={email}. Re-run with --create to create a platform admin owner.")
        now = _utcnow()
        base_document: dict[str, Any] = {
            "email": email,
            "name": email.split("@", 1)[0],
            "organization_name": email.split("@", 1)[1] if "@" in email else "admin.local",
            "tier": "BUSINESS",
            "role": "user",
            "is_active": True,
            "is_verified": True,
            "email_verified_at": now,
            "created_at": now,
            "updated_at": now,
        }
        base_document.update(
            build_admin_update(
                current_user=None,
                password_hash=password_hash,
                create_if_missing=True,
                generated_password=False,
            )
        )
        users.insert_one(base_document)
        user = users.find_one({"email": email})
    else:
        update = build_admin_update(
            current_user=user,
            password_hash=password_hash,
            create_if_missing=False,
            generated_password=False,
        )
        users.update_one({"_id": user["_id"]}, {"$set": update})
        user = users.find_one({"_id": user["_id"]})

    _insert_audit_record(db, email=email, old_role=old_admin_role, new_role=SUPER_ADMIN_ROLE)
    return {
        "email": email,
        "old_admin_role": old_admin_role,
        "new_admin_role": SUPER_ADMIN_ROLE,
        "admin_status": "active",
        "user": user,
    }


def main() -> int:
    args = _parse_args()
    email = _normalize_email(args.email)
    if not email:
        print("Email is required.", file=sys.stderr)
        return 1

    if args.create and not args.password:
        print("When using --create, you must also provide --password.", file=sys.stderr)
        return 1

    client = MongoClient(settings.MONGO_URI)
    try:
        db = client[settings.MONGO_DB_NAME]
        result = promote_admin_owner(db, email=email, create=args.create, password=args.password)
        result = {
            "email": result["email"],
            "old_admin_role": result["old_admin_role"],
            "new_admin_role": result["new_admin_role"],
            "admin_status": result["admin_status"],
        }
        print(json.dumps(result, default=str))
        return 0
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
