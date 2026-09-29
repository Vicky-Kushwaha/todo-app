"""Shared constants.

MAX_TITLE_LENGTH mirrors the frontend constant in src/types.ts. The two must
stay in step: the client trims/truncates on input, the server enforces the same
limit authoritatively.
"""

MAX_TITLE_LENGTH = 200
