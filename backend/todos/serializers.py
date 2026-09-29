"""Serializers for the todo API.

Two things here are deliberate and worth not "tidying" later:

1. Timestamps cross the wire as epoch milliseconds, because that is what the
   existing frontend ``Todo`` type and its reducer already use. Converting in
   the serializer keeps the model and the database timezone-aware.
2. ``title`` is trimmed before validation, matching the reducer's
   ``title.trim().slice(0, MAX_TITLE_LENGTH)`` behaviour, so a request that the
   UI would accept is never rejected by the API for whitespace alone.
"""

from rest_framework import serializers

from .constants import MAX_TITLE_LENGTH
from .models import Todo


class EpochMillisField(serializers.Field):
    """Renders an aware datetime as integer epoch milliseconds."""

    def to_representation(self, value) -> int:
        return int(value.timestamp() * 1000)

    def to_internal_value(self, data):  # pragma: no cover - read-only in use
        raise serializers.ValidationError("This field is read-only.")


class TodoSerializer(serializers.ModelSerializer):
    """Input/output serializer for a todo.

    Write surface: ``title`` and ``completed`` only. ``id``, ``createdAt`` and
    ``updatedAt`` are server-owned so a client cannot forge or move them.
    """

    createdAt = EpochMillisField(source="created_at", read_only=True)
    updatedAt = EpochMillisField(source="updated_at", read_only=True)

    class Meta:
        model = Todo
        fields = ("id", "title", "completed", "createdAt", "updatedAt")
        read_only_fields = ("id", "createdAt", "updatedAt")
        extra_kwargs = {
            "title": {
                "required": True,
                "allow_blank": False,
                "error_messages": {
                    "blank": "Title must not be blank.",
                    "required": "Title is required.",
                    "max_length": f"Title must be at most {MAX_TITLE_LENGTH} characters.",
                },
            },
        }

    def validate_title(self, value: str) -> str:
        """Normalise then re-check the title.

        DRF trims by default, but doing it explicitly is what makes the
        contract obvious and testable: "  buy milk  " stores as "buy milk", and
        a title of only whitespace is rejected rather than stored empty.
        """
        title = value.strip()
        if not title:
            raise serializers.ValidationError("Title must not be blank.")
        if len(title) > MAX_TITLE_LENGTH:
            raise serializers.ValidationError(
                f"Title must be at most {MAX_TITLE_LENGTH} characters."
            )
        return title


class ClearCompletedResultSerializer(serializers.Serializer):
    """Response body for the bulk clear endpoint."""

    deleted = serializers.IntegerField(
        help_text="How many completed todos were removed.",
    )


class HealthSerializer(serializers.Serializer):
    """Response body for the health endpoint."""

    status = serializers.CharField()
    database = serializers.CharField()
