"""Todo domain model.

The wire format deliberately stays close to the frontend ``Todo`` type
(src/types.ts) so the client keeps its existing shape::

    { "id": "<uuid>", "title": "...", "completed": false, "createdAt": 1735700000000 }

``createdAt`` is epoch milliseconds in the API but a real ``DateTimeField`` in
storage. The conversion lives in the serializer, not here, so the database
column stays timezone-aware and sortable.
"""

import uuid

from django.db import models

from .constants import MAX_TITLE_LENGTH


class Todo(models.Model):
    """A single task.

    ``id`` is a UUID generated server-side so clients never invent primary keys
    and a replayed POST cannot collide with an existing row.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=MAX_TITLE_LENGTH)
    completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Newest first, with id as a tiebreaker so paging stays stable when two
        # rows share a timestamp.
        ordering = ("-created_at", "-id")
        constraints = [
            # Belt and braces: the serializer rejects blank titles, and this
            # stops one reaching the table through a shell, a script or an
            # admin bulk action.
            models.CheckConstraint(
                condition=~models.Q(title=""),
                name="todo_title_not_blank",
            ),
        ]

    def __str__(self) -> str:
        # Kept short and free of the full title so it is safe in log lines.
        return f"Todo({self.pk})"
