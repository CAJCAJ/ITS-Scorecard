import os
from pathlib import Path

from supabase import create_client


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


def load_local_env() -> None:
    backend_dir = Path(__file__).resolve().parent
    repo_root = backend_dir.parent

    for candidate in (
        repo_root / ".env",
        repo_root / ".env.local",
        backend_dir / ".env",
        backend_dir / ".env.local",
    ):
        _load_env_file(candidate)


def get_supabase_settings():
    load_local_env()

    url = os.getenv("SUPABASE_URL", "").strip()
    key = (
        os.getenv("SUPABASE_KEY", "").strip()
        or os.getenv("SUPABASE_SECRET_KEY", "").strip()
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.getenv("SUPABASE_ANON_KEY", "").strip()
    )

    if not url or not key:
        raise RuntimeError(
            "Missing Supabase configuration. Set SUPABASE_URL and one of "
            "SUPABASE_KEY, SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, "
            "or SUPABASE_ANON_KEY in scorecard_backend/.env.local."
        )

    return url, key


def create_supabase_client():
    url, key = get_supabase_settings()
    return create_client(url, key)
