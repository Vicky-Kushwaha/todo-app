"""Settings helpers and resolved configuration.

These exist because of a bug the endpoint suite could not see: ``.env.example``
lists ``DJANGO_DB_PATH=``, and an env var that is *set but blank* made the
database NAME empty. The dev server and ``manage.py migrate`` then refused to
start, while the tests stayed green — Django's SQLite backend falls back to an
in-memory database under test, so the empty NAME never mattered there. These
tests pin the behaviour at the helper, which is where it went wrong.
"""

import pytest
from django.conf import settings

from config.settings import env, env_bool, env_list


@pytest.fixture
def var(monkeypatch):
    """Set/clear a scratch environment variable."""

    def _set(name="HERMES_TEST_SETTING", value=None):
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
        return name

    return _set


def test_env_returns_default_when_variable_is_missing(var):
    name = var(value=None)
    assert env(name, "fallback") == "fallback"


def test_env_treats_blank_as_unset(var):
    """The regression: DJANGO_DB_PATH= must not resolve to an empty string."""
    name = var(value="")
    assert env(name, "fallback") == "fallback"


def test_env_treats_whitespace_only_as_unset(var):
    name = var(value="   ")
    assert env(name, "fallback") == "fallback"


def test_env_returns_a_real_value(var):
    name = var(value="/var/lib/todo.db")
    assert env(name, "/fallback") == "/var/lib/todo.db"


def test_env_without_default_returns_none_when_blank(var):
    name = var(value="")
    assert env(name) is None


def test_env_bool_treats_blank_as_unset(var):
    name = var(value="")
    assert env_bool(name, default=True) is True
    assert env_bool(name, default=False) is False


def test_env_bool_parses_truthy_values(var):
    name = var(value="YES")
    assert env_bool(name) is True


def test_env_list_treats_blank_as_unset(var):
    name = var(value="")
    assert env_list(name, "localhost,127.0.0.1") == ["localhost", "127.0.0.1"]


def test_env_list_drops_empty_entries(var):
    name = var(value="a, ,b,")
    assert env_list(name) == ["a", "b"]


def test_database_name_is_configured():
    """A blank NAME is the failure mode this module exists to prevent."""
    assert settings.DATABASES["default"]["NAME"]


def test_allowed_hosts_is_not_empty():
    assert settings.ALLOWED_HOSTS


def test_secret_key_is_present():
    assert settings.SECRET_KEY
