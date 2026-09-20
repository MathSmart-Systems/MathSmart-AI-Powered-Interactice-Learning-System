"""Every error leaves through one envelope, and it never carries internals out."""

import asyncpg
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from middleware.errors import install_error_handlers
from middleware.request_context import REQUEST_ID_HEADER, RequestIdMiddleware


class Body(BaseModel):
    grade_id: int


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)
    install_error_handlers(app)

    @app.get("/ok")
    async def ok():
        return {"data": {"fine": True}}

    @app.get("/forbidden")
    async def forbidden():
        raise HTTPException(status_code=403, detail="Ownership restriction")

    @app.get("/locked")
    async def locked():
        raise HTTPException(status_code=412, detail="Required sections are incomplete")

    @app.get("/boom")
    async def boom():
        raise RuntimeError("relation app.questions does not exist: answer_key")

    # The three PL/pgSQL codes the definer functions raise. Every route that
    # calls one expects a missing row to come back as None and answers 404, but
    # a function raises instead of returning — so these escaped to the catch-all
    # and a teacher archiving content turned a learner's next request into a
    # 500 the browser could only report as a failed fetch.
    @app.get("/gone")
    async def gone():
        raise asyncpg.exceptions.NoDataFoundError(
            "The assessment is not published: 30e7f94d-0daa-4c0d-9a4b-908e47029a51"
        )

    @app.get("/refused")
    async def refused():
        raise asyncpg.exceptions.RaiseError(
            "app.start_activity_attempt: the learner is not in grade 6"
        )

    @app.get("/incomplete")
    async def incomplete():
        raise asyncpg.exceptions.AssertError(
            "app.submit_assessment_attempt: snapshot count 4 <> graded 5"
        )

    @app.post("/validated")
    async def validated(body: Body):
        return {"data": body.model_dump()}

    return TestClient(app, raise_server_exceptions=False)


def test_a_successful_response_still_carries_a_request_id_header(client):
    response = client.get("/ok")

    assert response.status_code == 200
    assert response.headers[REQUEST_ID_HEADER].startswith("req_")


def test_a_client_supplied_request_id_is_reused(client):
    response = client.get("/ok", headers={REQUEST_ID_HEADER: "req_from_the_gateway"})

    assert response.headers[REQUEST_ID_HEADER] == "req_from_the_gateway"


def test_each_request_gets_its_own_generated_id(client):
    first = client.get("/ok").headers[REQUEST_ID_HEADER]
    second = client.get("/ok").headers[REQUEST_ID_HEADER]

    assert first != second


def test_an_http_error_uses_the_documented_envelope(client):
    response = client.get("/forbidden")

    assert response.status_code == 403
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "forbidden"
    assert body["error"]["message"] == "Ownership restriction"
    assert body["error"]["request_id"] == response.headers[REQUEST_ID_HEADER]
    assert "fields" not in body["error"]


def test_a_workflow_gate_maps_to_precondition_failed(client):
    response = client.get("/locked")

    assert response.status_code == 412
    assert response.json()["error"]["code"] == "precondition_failed"


def test_a_validation_failure_reports_fields(client):
    response = client.post("/validated", json={"grade_id": "not-a-number"})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert "grade_id" in error["fields"]
    assert isinstance(error["fields"]["grade_id"], list)


def test_an_unexpected_failure_hides_internals(client):
    response = client.get("/boom")

    assert response.status_code == 500
    error = response.json()["error"]
    assert error["code"] == "internal_error"
    assert "answer_key" not in response.text
    assert "app.questions" not in response.text
    assert "RuntimeError" not in response.text
    assert error["request_id"].startswith("req_")


def test_a_function_that_found_nothing_is_a_404_not_a_crash(client):
    """Archived or unpublished content is missing, not broken."""
    response = client.get("/gone")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    # The identifier and the function name stay in the log.
    assert "30e7f94d" not in response.text
    assert "assessment is not published" not in response.text


def test_a_rule_a_function_enforces_is_a_refusal_not_a_crash(client):
    response = client.get("/refused")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "rule_violation"
    assert "start_activity_attempt" not in response.text


def test_an_attempt_with_incomplete_evidence_is_a_conflict(client):
    """The function refuses rather than grading against content that has moved.

    Refusing is the point. A 409 says the record is in a state somebody has to
    resolve, which is true: the attempt needs resetting, not a corrected field.
    """
    response = client.get("/incomplete")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "attempt_evidence_incomplete"
    assert "snapshot count" not in response.text
    assert "submit_assessment_attempt" not in response.text
