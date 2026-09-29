"""Root URL configuration.

Everything the frontend consumes lives under /api/. The catch-all at the bottom
keeps 404s JSON-shaped: an unrouted path never reaches DRF, so without it Django
would answer with an HTML page a JSON client cannot parse.
"""

from django.contrib import admin
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from todos.views import api_not_found

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("todos.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    # Must stay last: it matches anything not routed above.
    re_path(r"^.*$", api_not_found),
]
