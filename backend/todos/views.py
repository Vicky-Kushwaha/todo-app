"""API views.

Deliberately a plain ModelViewSet-style viewset: no business logic beyond the
bulk clear, because there is no business logic to hide yet. Anything that grows
here (ownership, soft delete, per-user scoping) belongs in a service layer, not
in the view.
"""

import logging

from django.db import connection
from django.http import JsonResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .exceptions import error_body
from .models import Todo
from .serializers import (
    ClearCompletedResultSerializer,
    HealthSerializer,
    TodoSerializer,
)

logger = logging.getLogger("todos.views")

# Accepted values for the ?completed= filter, mapped to booleans.
_COMPLETED_FILTER_VALUES = {"true": True, "false": False}


class TodoViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """CRUD over todos.

    PUT is intentionally not offered: clients send partial updates (the UI
    toggles one field at a time) and accepting PUT would invite accidental
    field clearing.
    """

    queryset = Todo.objects.all()
    serializer_class = TodoSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    # Only UUIDs can be detail lookups. This keeps /api/todos/completed/ from
    # ever being parsed as a pk, and turns junk ids into a clean 404.
    lookup_value_regex = "[0-9a-fA-F-]{36}"

    def get_queryset(self):
        """Apply the optional ?completed= server-side filter."""
        queryset = Todo.objects.all()

        # get_queryset also runs during schema generation, where the request
        # may be a stub without query_params.
        params = getattr(self.request, "query_params", None)
        if params is None:
            return queryset

        raw = params.get("completed")
        if raw is None:
            return queryset

        normalized = raw.strip().lower()
        if normalized not in _COMPLETED_FILTER_VALUES:
            # Fail loudly rather than silently returning everything.
            raise ValidationError(
                {"completed": ["Query parameter must be 'true' or 'false'."]}
            )

        return queryset.filter(completed=_COMPLETED_FILTER_VALUES[normalized])

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="completed",
                description="Filter by completion state.",
                required=False,
                type=bool,
            )
        ],
        responses={200: TodoSerializer(many=True)},
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(responses={200: ClearCompletedResultSerializer})
    @action(detail=False, methods=["delete"], url_path="completed")
    def clear_completed(self, request):
        """DELETE /api/todos/completed/ - remove every completed todo.

        Returns the number removed so the client can log or display it, and so
        a caller can tell "nothing to clear" apart from a failed request.
        """
        deleted, _by_model = Todo.objects.filter(completed=True).delete()
        logger.info(
            "cleared completed todos",
            extra={
                "request_id": getattr(request, "request_id", "-"),
                "deleted": deleted,
            },
        )
        return Response({"deleted": deleted}, status=status.HTTP_200_OK)


@extend_schema(responses={200: HealthSerializer, 503: HealthSerializer})
@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Liveness/readiness probe that actually touches the database.

    A process that is up but cannot reach its database is not healthy, so the
    check runs a trivial query rather than returning a constant.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        logger.exception(
            "health check failed",
            extra={"request_id": getattr(request, "request_id", "-")},
        )
        return Response(
            {"status": "error", "database": "unavailable"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response({"status": "ok", "database": "ok"}, status=status.HTTP_200_OK)


def api_not_found(request, *args, **kwargs):
    """JSON 404 for any unrouted URL.

    Without this, a request to a path that matches no route never reaches DRF
    and Django answers with an HTML error page, which a JSON client cannot
    parse. Wired up as the final catch-all in config.urls.
    """
    return JsonResponse(
        error_body("not_found", "No API endpoint matches this URL."),
        status=status.HTTP_404_NOT_FOUND,
    )
