"""Admin registration.

Handy for eyeballing data during development. No admin customisation beyond the
list view, because nothing here needs it yet.
"""

from django.contrib import admin

from .models import Todo


@admin.register(Todo)
class TodoAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "completed", "created_at", "updated_at")
    list_filter = ("completed",)
    search_fields = ("title",)
    ordering = ("-created_at",)
    readonly_fields = ("id", "created_at", "updated_at")
