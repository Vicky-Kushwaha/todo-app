"""Todo API routes, mounted under /api/ by config.urls."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import TodoViewSet, health

router = DefaultRouter()
router.register("todos", TodoViewSet, basename="todo")

urlpatterns = [
    path("health/", health, name="health"),
    path("", include(router.urls)),
]
