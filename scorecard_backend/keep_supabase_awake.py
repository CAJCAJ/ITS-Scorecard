from datetime import datetime, timezone
from pathlib import Path

from supabase_config import create_supabase_client


LOG_PATH = Path(__file__).resolve().parent / "supabase_keepalive.log"


def write_log(message):
    timestamp = datetime.now(timezone.utc).isoformat()
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(f"{timestamp} {message}\n")


def main():
    try:
        supabase = create_supabase_client()
        result = supabase.table("documents").select("id").limit(1).execute()
        row_count = len(result.data or [])
        message = f"Supabase keep-alive ping succeeded; rows_returned={row_count}"
        print(message)
        write_log(message)
        return 0
    except Exception as exc:
        message = f"Supabase keep-alive ping failed: {exc}"
        print(message)
        write_log(message)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
