"""Temporary verification bridge for tests written against synchronous DB startup."""
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent / "backend-ai"))
import app.main as main


async def fixture_start(app=None):
    await main.connect_to_mongo(app=app)


async def fixture_wait(**kwargs):
    await main.ping_mongo()


main.start_mongo_connection_background = fixture_start
main.wait_for_mongo_ready = fixture_wait
raise SystemExit(pytest.main(["tests", "-q", "--tb=short"]))
