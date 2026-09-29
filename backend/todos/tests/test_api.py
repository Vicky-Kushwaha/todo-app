"""Endpoint tests.

These cover the contract the frontend depends on, not just "did it 200". The
assertions on the exact response shape are intentional: if a field is renamed or
an error stops following the envelope, the client breaks silently, so the tests
should fail first.
"""

import uuid

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from todos.constants import MAX_TITLE_LENGTH
from todos.models import Todo

pytestmark = pytest.mark.django_db


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def make_todo():
    def _make(title: str = "Buy milk", completed: bool = False) -> Todo:
        return Todo.objects.create(title=title, completed=completed)

    return _make


def error_of(response) -> dict:
    """Return the error envelope, asserting it is shaped as documented."""
    assert "error" in response.json(), response.json()
    body = response.json()["error"]
    assert set(body) <= {"code", "message", "fields"}
    assert isinstance(body["code"], str) and body["code"]
    assert isinstance(body["message"], str) and body["message"]
    return body


class TestList:
    def test_empty_list_returns_an_empty_array(self, client):
        response = client.get(reverse("todo-list"))

        assert response.status_code == 200
        assert response.json() == []

    def test_returns_todos_newest_first(self, client, make_todo):
        first = make_todo("First")
        second = make_todo("Second")

        body = client.get(reverse("todo-list")).json()

        assert [item["id"] for item in body] == [str(second.id), str(first.id)]

    def test_serializes_the_shape_the_frontend_expects(self, client, make_todo):
        todo = make_todo("Buy milk")

        item = client.get(reverse("todo-list")).json()[0]

        assert set(item) == {"id", "title", "completed", "createdAt", "updatedAt"}
        assert item["id"] == str(todo.id)
        assert item["title"] == "Buy milk"
        assert item["completed"] is False
        # Epoch milliseconds, not an ISO string: the frontend type is `number`.
        assert isinstance(item["createdAt"], int)
        assert item["createdAt"] == int(todo.created_at.timestamp() * 1000)


class TestListFiltering:
    def test_filters_completed_true(self, client, make_todo):
        make_todo("Done", completed=True)
        make_todo("Open", completed=False)

        body = client.get(reverse("todo-list"), {"completed": "true"}).json()

        assert [item["title"] for item in body] == ["Done"]

    def test_filters_completed_false(self, client, make_todo):
        make_todo("Done", completed=True)
        make_todo("Open", completed=False)

        body = client.get(reverse("todo-list"), {"completed": "false"}).json()

        assert [item["title"] for item in body] == ["Open"]

    @pytest.mark.parametrize("value", ["yes", "1", "", "TRUEish"])
    def test_rejects_a_bad_filter_value(self, client, value):
        response = client.get(reverse("todo-list"), {"completed": value})

        assert response.status_code == 400
        body = error_of(response)
        assert body["code"] == "validation_error"
        assert "completed" in body["fields"]


class TestCreate:
    def test_creates_a_todo(self, client):
        response = client.post(reverse("todo-list"), {"title": "Buy milk"}, format="json")

        assert response.status_code == 201
        body = response.json()
        assert body["title"] == "Buy milk"
        assert body["completed"] is False
        # The id is server-generated and a real UUID.
        assert uuid.UUID(body["id"])
        assert Todo.objects.count() == 1

    def test_trims_the_title(self, client):
        response = client.post(
            reverse("todo-list"), {"title": "  buy milk  "}, format="json"
        )

        assert response.status_code == 201
        assert response.json()["title"] == "buy milk"

    @pytest.mark.parametrize("title", ["", "   ", "\t\n"])
    def test_rejects_a_blank_title(self, client, title):
        response = client.post(reverse("todo-list"), {"title": title}, format="json")

        assert response.status_code == 400
        body = error_of(response)
        assert body["code"] == "validation_error"
        assert "title" in body["fields"]
        assert Todo.objects.count() == 0

    def test_rejects_a_missing_title(self, client):
        response = client.post(reverse("todo-list"), {}, format="json")

        assert response.status_code == 400
        assert "title" in error_of(response)["fields"]

    def test_rejects_a_title_over_the_limit(self, client):
        response = client.post(
            reverse("todo-list"),
            {"title": "x" * (MAX_TITLE_LENGTH + 1)},
            format="json",
        )

        assert response.status_code == 400
        assert "title" in error_of(response)["fields"]

    def test_accepts_a_title_exactly_at_the_limit(self, client):
        response = client.post(
            reverse("todo-list"), {"title": "x" * MAX_TITLE_LENGTH}, format="json"
        )

        assert response.status_code == 201

    def test_ignores_a_client_supplied_id(self, client):
        """A client cannot choose its own primary key."""
        forged = uuid.uuid4()
        response = client.post(
            reverse("todo-list"),
            {"id": str(forged), "title": "Buy milk"},
            format="json",
        )

        assert response.status_code == 201
        assert response.json()["id"] != str(forged)

    def test_rejects_malformed_json(self, client):
        response = client.post(
            reverse("todo-list"), data="{not json", content_type="application/json"
        )

        assert response.status_code == 400
        assert error_of(response)["code"] == "parse_error"


class TestRetrieve:
    def test_returns_one_todo(self, client, make_todo):
        todo = make_todo("Buy milk")

        response = client.get(reverse("todo-detail", args=[todo.id]))

        assert response.status_code == 200
        assert response.json()["id"] == str(todo.id)

    def test_unknown_id_is_a_404_envelope(self, client):
        response = client.get(reverse("todo-detail", args=[uuid.uuid4()]))

        assert response.status_code == 404
        body = error_of(response)
        assert body["code"] == "not_found"
        # The message must describe the failure, not fall back to a generic
        # string: a 404 mislabelled as server_error is how a client shows the
        # wrong thing to a user.
        assert body["message"] != "Request failed."

    def test_a_non_uuid_id_is_a_404_not_a_500(self, client):
        response = client.get("/api/todos/not-a-uuid/")

        assert response.status_code == 404
        assert error_of(response)["code"] == "not_found"


class TestUpdate:
    def test_patches_completed(self, client, make_todo):
        todo = make_todo("Buy milk")

        response = client.patch(
            reverse("todo-detail", args=[todo.id]), {"completed": True}, format="json"
        )

        assert response.status_code == 200
        assert response.json()["completed"] is True
        todo.refresh_from_db()
        assert todo.completed is True

    def test_patches_the_title_and_trims_it(self, client, make_todo):
        todo = make_todo("Buy milk")

        response = client.patch(
            reverse("todo-detail", args=[todo.id]), {"title": "  Buy oat milk "}, format="json"
        )

        assert response.status_code == 200
        assert response.json()["title"] == "Buy oat milk"

    def test_patching_only_completed_leaves_the_title_alone(self, client, make_todo):
        todo = make_todo("Buy milk")

        client.patch(reverse("todo-detail", args=[todo.id]), {"completed": True}, format="json")

        todo.refresh_from_db()
        assert todo.title == "Buy milk"

    def test_rejects_an_empty_patch_title(self, client, make_todo):
        todo = make_todo("Buy milk")

        response = client.patch(
            reverse("todo-detail", args=[todo.id]), {"title": "   "}, format="json"
        )

        assert response.status_code == 400
        assert "title" in error_of(response)["fields"]

    def test_put_is_not_allowed(self, client, make_todo):
        """PUT would let a client clear fields by omission, so it is refused."""
        todo = make_todo("Buy milk")

        response = client.put(
            reverse("todo-detail", args=[todo.id]), {"title": "Buy milk"}, format="json"
        )

        assert response.status_code == 405
        assert error_of(response)["code"] == "method_not_allowed"


class TestDelete:
    def test_deletes_a_todo(self, client, make_todo):
        todo = make_todo("Buy milk")

        response = client.delete(reverse("todo-detail", args=[todo.id]))

        assert response.status_code == 204
        assert Todo.objects.count() == 0

    def test_deleting_twice_is_a_404_the_second_time(self, client, make_todo):
        todo = make_todo("Buy milk")
        url = reverse("todo-detail", args=[todo.id])

        assert client.delete(url).status_code == 204
        assert client.delete(url).status_code == 404


class TestClearCompleted:
    def test_removes_only_completed_todos(self, client, make_todo):
        make_todo("Done", completed=True)
        make_todo("Also done", completed=True)
        keep = make_todo("Open", completed=False)

        response = client.delete(reverse("todo-clear-completed"))

        assert response.status_code == 200
        assert response.json() == {"deleted": 2}
        assert list(Todo.objects.values_list("id", flat=True)) == [keep.id]

    def test_reports_zero_when_nothing_to_clear(self, client, make_todo):
        make_todo("Open", completed=False)

        response = client.delete(reverse("todo-clear-completed"))

        assert response.status_code == 200
        assert response.json() == {"deleted": 0}

    def test_is_not_swallowed_by_the_detail_route(self, client):
        """`completed` must route to the action, never be read as a pk."""
        response = client.delete("/api/todos/completed/")

        assert response.status_code == 200


class TestHealth:
    def test_reports_ok(self, client):
        response = client.get(reverse("health"))

        assert response.status_code == 200
        assert response.json() == {"status": "ok", "database": "ok"}


class TestUnroutedUrls:
    """Unrouted paths must still answer in JSON, not with Django's HTML page."""

    def test_unknown_api_path_returns_a_json_404(self, client):
        response = client.get("/api/definitely-not-a-route/")

        assert response.status_code == 404
        assert response["Content-Type"].startswith("application/json")
        assert error_of(response)["code"] == "not_found"

    def test_unknown_root_path_returns_a_json_404(self, client):
        response = client.get("/definitely-not-a-route")

        assert response.status_code == 404
        assert error_of(response)["code"] == "not_found"

    def test_the_catch_all_does_not_shadow_the_openapi_schema(self, client):
        response = client.get(reverse("schema"))

        assert response.status_code == 200

    def test_the_catch_all_does_not_shadow_the_docs(self, client):
        response = client.get(reverse("docs"))

        assert response.status_code == 200


class TestRequestLogging:
    def test_echoes_a_request_id_header(self, client):
        response = client.get(reverse("todo-list"))

        assert response["X-Request-ID"]
