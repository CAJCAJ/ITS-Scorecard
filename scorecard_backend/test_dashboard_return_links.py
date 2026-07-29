import os
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from app import app


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, database, table_name):
        self.database = database
        self.table_name = table_name
        self.operation = None
        self.payload = None
        self.filters = []
        self.limit_count = None

    def insert(self, payload):
        self.operation = "insert"
        self.payload = dict(payload)
        return self

    def select(self, _columns):
        self.operation = "select"
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = dict(payload)
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def limit(self, count):
        self.limit_count = count
        return self

    def _matches(self, row):
        return all(row.get(field) == value for field, value in self.filters)

    def execute(self):
        rows = self.database.setdefault(self.table_name, [])
        if self.operation == "insert":
            rows.append(self.payload)
            return FakeResult([self.payload])
        if self.operation == "select":
            selected = [dict(row) for row in rows if self._matches(row)]
            if self.limit_count is not None:
                selected = selected[: self.limit_count]
            return FakeResult(selected)
        if self.operation == "update":
            updated = []
            for row in rows:
                if self._matches(row):
                    row.update(self.payload)
                    updated.append(dict(row))
            return FakeResult(updated)
        if self.operation == "delete":
            deleted = [row for row in rows if self._matches(row)]
            self.database[self.table_name] = [
                row for row in rows if not self._matches(row)
            ]
            return FakeResult(deleted)
        raise AssertionError(f"Unsupported fake operation: {self.operation}")


class FakeSupabase:
    def __init__(self):
        self.database = {}

    def table(self, table_name):
        return FakeQuery(self.database, table_name)


class DashboardReturnLinkApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.fake_supabase = FakeSupabase()
        self.admin_patch = patch(
            "app.create_supabase_admin_client",
            return_value=self.fake_supabase,
        )
        self.mock_admin = self.admin_patch.start()
        self.env_patch = patch.dict(
            os.environ,
            {
                "RETURN_LINK_SIGNING_SECRET": "test-signing-secret",
                "FRONTEND_PUBLIC_URL": "https://itsscorecard.onrender.com",
            },
        )
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        self.admin_patch.stop()

    def valid_payload(self):
        return {
            "agency_company": "Example Agency",
            "display_name": "Jane Reviewer",
            "email": "Jane@example.org",
            "state": "New Jersey",
            "consented": True,
        }

    @patch("app.send_return_link_email")
    def test_create_and_resolve_permanent_link(self, mock_send):
        create_response = self.client.post(
            "/api/dashboard-return-links",
            json=self.valid_payload(),
        )

        self.assertEqual(create_response.status_code, 201)
        rows = self.fake_supabase.database["dashboard_return_links"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["email"], "jane@example.org")
        self.assertEqual(len(rows[0]["token_hash"]), 64)

        resume_url = mock_send.call_args.args[2]
        token = parse_qs(urlparse(resume_url).fragment)["token"][0]
        self.assertNotEqual(rows[0]["token_hash"], token)

        resolve_response = self.client.post(
            "/api/dashboard-return-links/resolve",
            json={"token": token},
        )

        self.assertEqual(resolve_response.status_code, 200)
        resolved = resolve_response.get_json()
        self.assertEqual(resolved["state"], "New Jersey")
        self.assertEqual(resolved["role"], "viewer")
        self.assertEqual(resolved["profile"]["display_name"], "Jane Reviewer")
        self.assertEqual(rows[0]["use_count"], 1)
        self.assertTrue(rows[0]["last_used_at"])

    @patch("app.send_return_link_email")
    def test_consent_is_required(self, mock_send):
        payload = self.valid_payload()
        payload["consented"] = False

        response = self.client.post("/api/dashboard-return-links", json=payload)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.fake_supabase.database, {})
        mock_send.assert_not_called()

    @patch("app.send_return_link_email", side_effect=RuntimeError("SMTP failed"))
    def test_email_failure_removes_saved_link(self, _mock_send):
        response = self.client.post(
            "/api/dashboard-return-links",
            json=self.valid_payload(),
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            self.fake_supabase.database.get("dashboard_return_links"),
            [],
        )


if __name__ == "__main__":
    unittest.main()
