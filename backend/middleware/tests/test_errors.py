"""Every error leaves through one envelope, and it never carries internals out."""

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
