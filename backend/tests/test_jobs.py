from httpx import AsyncClient

from tests.conftest import API, job_id


async def test_list_jobs(client: AsyncClient) -> None:
    response = await client.get(f"{API}/jobs")
    assert response.status_code == 200
    jobs = response.json()
    assert len(jobs) == 9
    assert {"Product Designer", "ML Engineer", "DevOps Engineer"} <= {job["title"] for job in jobs}

    open_jobs = (await client.get(f"{API}/jobs", params={"status": "open"})).json()
    assert len(open_jobs) == 7
    assert {job["status"] for job in open_jobs} == {"open"}


async def test_get_job(client: AsyncClient) -> None:
    response = await client.get(f"{API}/jobs/{job_id('ML Engineer')}")
    assert response.status_code == 200
    job = response.json()
    assert job["hiring_manager"] == "Tom Reid"
    assert "Requirements: PyTorch" in job["description"]

    missing = await client.get(f"{API}/jobs/00000000-0000-0000-0000-000000000000")
    assert missing.status_code == 404
    assert missing.json()["error"]["message"] == "Job not found."


async def test_create_and_update_job(client: AsyncClient) -> None:
    created = await client.post(
        f"{API}/jobs",
        json={"title": "Research Engineer", "department": "Research", "location": "London, UK"},
    )
    assert created.status_code == 201
    job = created.json()
    assert job["status"] == "open"
    assert job["employment_type"] == "Full-time"

    updated = await client.patch(f"{API}/jobs/{job['id']}", json={"status": "closed", "location": None})
    assert updated.status_code == 200
    assert updated.json()["status"] == "closed"
    assert updated.json()["location"] is None
    assert updated.json()["title"] == "Research Engineer"


async def test_job_validation(client: AsyncClient) -> None:
    assert (await client.post(f"{API}/jobs", json={"title": ""})).status_code == 422
    assert (await client.post(f"{API}/jobs", json={"title": "X", "status": "paused"})).status_code == 422
    null_title = await client.patch(f"{API}/jobs/{job_id('ML Engineer')}", json={"title": None})
    assert null_title.status_code == 422
