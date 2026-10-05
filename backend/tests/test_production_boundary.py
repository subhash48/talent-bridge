"""The boundary between the application and its tests: app/ must run on its own, as the production image
ships it, with no backend/tests beside it. Production code may never import from, read from or look for
anything under tests/; the tests may use production code.

A Demo Careers application once failed in production with 503 demo_unavailable, because the Ashby
simulator built its payloads from tests/ashby_support.py and tests/fixtures/ashby. These tests fail if
anything like that comes back."""

import ast
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
APP = BACKEND / "app"

# A path into a tests or fixtures folder, in any string the code uses (not in docstrings).
TESTS_PATH = re.compile(r"(^|[\\/])(tests|fixtures)\b")


def _docstrings(tree: ast.Module) -> set[int]:
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef) and node.body:
            first = node.body[0]
            if (
                isinstance(first, ast.Expr)
                and isinstance(first.value, ast.Constant)
                and isinstance(first.value.value, str)
            ):
                found.add(id(first.value))
    return found


def test_production_code_never_reaches_into_tests() -> None:
    """No module in app/ imports tests.*, names a tests or fixtures path, or ships a tests folder."""
    problems = [
        f"{path.relative_to(BACKEND)}/ is a tests folder inside app/" for path in APP.rglob("tests") if path.is_dir()
    ]
    for path in sorted(APP.rglob("*.py")):
        where = path.relative_to(BACKEND)
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        docstrings = _docstrings(tree)
        for node in ast.walk(tree):
            modules: list[str] = []
            if isinstance(node, ast.Import):
                modules = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                modules = [node.module or ""]
            for module in modules:
                if module == "tests" or module.startswith("tests."):
                    problems.append(f"{where}:{node.lineno} imports {module}")
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
                value = node.value
                if value.strip() in {"tests", "fixtures"} or value.startswith("tests.") or TESTS_PATH.search(value):
                    problems.append(f"{where}:{node.lineno} refers to {value!r}")
    assert not problems, "Production code depends on the tests:\n" + "\n".join(problems)


# The careers flow, run from a copy of app/ alone. Before anything is imported, any import of a tests
# package fails, and so does opening or listing anything under a folder called tests.
PACKAGED_FLOW = r'''
import asyncio
import base64
import os
import sys
import uuid
from pathlib import PurePath

sys.modules["tests"] = None


def no_tests(event, args):
    if event in ("open", "os.listdir", "os.scandir") and args and isinstance(args[0], (str, bytes, os.PathLike)):
        target = os.fsdecode(args[0])
        if "tests" in (part.lower() for part in PurePath(target).parts):
            raise RuntimeError(f"production code touched {target}")


sys.addaudithook(no_tests)

from fastapi import BackgroundTasks
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import create_engine_for, create_tables, get_session, get_session_factory
from app.core.enums import DemoApplicationStatus, UserRole
from app.core.security import TokenClaims
from app.integrations.supabase_admin import InvitedUser, get_supabase_admin
from app.main import app
from app.models import (
    Application,
    Candidate,
    CandidateDemographics,
    DemoApplication,
    DemoApplicationDemographics,
    User,
)
from app.schemas.demo import DemoJobCreate
from app.services import demo_careers, demo_jobs
from app.services.ai.client import get_ai_provider
from app.services.ai.fallback import MockProvider

EMAIL = "maya.patel@inbox.dev"
PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"


class Admin:
    """Supabase Auth's invitations, in memory."""

    def __init__(self):
        self.invited = {}

    async def invite(self, email, *, redirect_to, data):
        self.invited[email] = uuid.uuid4()
        return InvitedUser(id=self.invited[email], email=email)


async def main():
    engine = create_engine_for(os.environ["DATABASE_URL"])
    await create_tables(engine)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    # 1-2. A recruiter creates a demo job and publishes it.
    async with factory() as session:
        recruiter = User(id=uuid.uuid4(), email="alex.chen@encord.example", full_name="Alex Chen", role=UserRole.RECRUITER)
        session.add(recruiter)
        await session.commit()
        job = await demo_jobs.create_demo_job(
            session,
            DemoJobCreate(
                title="TEST - Data Scientist",
                summary="Build the models behind data curation.",
                about_role="You train and evaluate the models that decide which data teams label next.",
                responsibilities=["Train ranking models"],
                requirements=["Production Python"],
            ),
            recruiter,
        )
        await demo_jobs.publish(session, job.id)

    admin = Admin()

    async def session_override():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_session_factory] = lambda: factory
    app.dependency_overrides[get_supabase_admin] = lambda: admin
    app.dependency_overrides[get_ai_provider] = MockProvider
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 3-4. The careers site lists it and shows it.
        listed = (await client.get("/api/v1/demo/careers/jobs")).json()
        assert [item["id"] for item in listed] == [str(job.id)], listed
        assert (await client.get(f"/api/v1/demo/careers/jobs/{job.id}")).status_code == 200
        # 5-7. The application, with a résumé and voluntary answers: a success, not a 503.
        response = await client.post(
            f"/api/v1/demo/careers/jobs/{job.id}/apply",
            json={
                "first_name": "Maya",
                "last_name": "Patel",
                "email": EMAIL,
                "phone": "+44 20 7946 0958",
                "resume": {"file_name": "Maya Patel CV.pdf", "content_type": "application/pdf", "data": base64.b64encode(PDF).decode()},
                "demographics": {"region": "united_kingdom", "disability_status": "prefer_not_to_say"},
            },
        )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "invitation_sent", response.json()

    # 8. Stored as pending, with its answers held apart; recruiters see no one yet.
    async with factory() as session:
        pending = await session.scalar(select(DemoApplication).where(DemoApplication.email == EMAIL))
        assert pending.status == DemoApplicationStatus.AWAITING_ACTIVATION, pending.status
        assert pending.auth_user_id == admin.invited[EMAIL]
        assert await session.get(DemoApplicationDemographics, pending.id) is not None
        assert await session.scalar(select(func.count()).select_from(Candidate).where(Candidate.email == EMAIL)) == 0

    # 9. Activating the invited account submits it through the Ashby simulator.
    claims = TokenClaims(subject=admin.invited[EMAIL], email=EMAIL, session_id=None)
    await demo_careers.submit_on_sign_in(factory, claims, background=BackgroundTasks(), provider=MockProvider())

    # 10-11. Now the candidate and application exist; the answers became the candidate's own.
    async with factory() as session:
        pending = await session.get(DemoApplication, pending.id, populate_existing=True)
        assert pending.status == DemoApplicationStatus.SUBMITTED, pending.status
        application = await session.get(Application, pending.application_id)
        candidate = await session.get(Candidate, application.candidate_id)
        assert (candidate.email, candidate.first_name, candidate.last_name) == (EMAIL, "Maya", "Patel")
        assert application.source == demo_careers.DEMO_CAREERS_SOURCE
        assert candidate.user_id is not None
        assert await session.get(DemoApplicationDemographics, pending.id) is None
        assert (await session.get(CandidateDemographics, candidate.id)).region == "united_kingdom"
    await engine.dispose()
    print("submitted")


asyncio.run(main())
'''


def test_a_careers_application_goes_through_from_app_alone(tmp_path: Path) -> None:
    """The Demo Careers flow from a copy of app/ with no tests folder and no source checkout around it:
    publish, apply (200, not 503), pending, activation, submitted through the Ashby simulator."""
    runtime = tmp_path / "runtime"
    shutil.copytree(APP, runtime / "app", ignore=shutil.ignore_patterns("__pycache__"))
    assert not (runtime / "tests").exists()
    env = {
        **os.environ,
        "PYTHONPATH": str(runtime),  # app/ alone: backend/ and its tests aren't on the path
        "DATABASE_URL": f"sqlite+aiosqlite:///{(tmp_path / 'runtime.db').as_posix()}",
        "ENABLE_ASHBY_DEMO": "true",
        "PORTAL_INVITES_ENABLED": "true",
        "ASHBY_AUTO_ANALYZE": "false",
    }
    result = subprocess.run(
        [sys.executable, "-c", PACKAGED_FLOW],
        cwd=runtime,  # no backend/.env here: the tests' settings are in the environment
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    assert result.returncode == 0, result.stderr[-4000:]
    assert result.stdout.strip().splitlines()[-1] == "submitted", result.stdout
