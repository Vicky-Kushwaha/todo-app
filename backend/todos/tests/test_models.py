"""Model-level tests, including the database constraint."""

import pytest
from django.db import IntegrityError, transaction

from todos.constants import MAX_TITLE_LENGTH
from todos.models import Todo

pytestmark = pytest.mark.django_db


def test_defaults_to_not_completed():
    todo = Todo.objects.create(title="Buy milk")

    assert todo.completed is False


def test_id_is_a_uuid_assigned_on_create():
    todo = Todo.objects.create(title="Buy milk")

    assert todo.pk is not None
    assert todo.pk.version == 4


def test_timestamps_are_set_automatically():
    todo = Todo.objects.create(title="Buy milk")

    assert todo.created_at is not None
    assert todo.updated_at is not None


def test_updated_at_moves_but_created_at_does_not():
    todo = Todo.objects.create(title="Buy milk")
    created_at = todo.created_at

    todo.title = "Buy oat milk"
    todo.save()
    todo.refresh_from_db()

    assert todo.created_at == created_at
    assert todo.updated_at >= created_at


def test_ordering_is_newest_first():
    first = Todo.objects.create(title="First")
    second = Todo.objects.create(title="Second")

    assert list(Todo.objects.values_list("id", flat=True)) == [second.id, first.id]


def test_database_rejects_a_blank_title():
    """The serializer is not the only line of defence."""
    with pytest.raises(IntegrityError), transaction.atomic():
        Todo.objects.create(title="")


def test_title_limit_matches_the_frontend_constant():
    """Guards against the two constants drifting apart."""
    assert Todo._meta.get_field("title").max_length == MAX_TITLE_LENGTH == 200
