import unittest
from unittest.mock import patch

from app import app


class FakeInsertQuery:
    def __init__(self, storage):
        self.storage = storage
        self.row = None

    def insert(self, row):
        self.row = row
        return self

    def execute(self):
        self.storage.append(self.row)
        return type("Result", (), {"data": [self.row]})()


class FakeSupabase:
    def __init__(self):
        self.rows = []

    def table(self, _table_name):
        return FakeInsertQuery(self.rows)


class FeedbackApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.fake_supabase = FakeSupabase()
        self.supabase_patch = patch("app.supabase", self.fake_supabase)
        self.supabase_patch.start()

    def tearDown(self):
        self.supabase_patch.stop()

    def test_feedback_profile_fields_are_saved_with_comment(self):
        response = self.client.post(
            "/api/feedback",
            json={
                "agency_company": "Example Agency",
                "user_name": "Jane Reviewer",
                "email": "jane@example.org",
                "account_user_name": "NJDOT",
                "comment": "Please clarify this chart.",
                "page_path": "/dashboard",
                "section_block": "Historical Score Trend",
                "section_id": "historical-score-trend-3",
                "state": "New Jersey",
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(self.fake_supabase.rows), 1)
        saved = self.fake_supabase.rows[0]
        self.assertEqual(saved["agency_company"], "Example Agency")
        self.assertEqual(saved["user_name"], "Jane Reviewer")
        self.assertEqual(saved["email"], "jane@example.org")
        self.assertEqual(saved["account_user_name"], "NJDOT")
        self.assertEqual(saved["section_block"], "Historical Score Trend")
        self.assertEqual(saved["section_id"], "historical-score-trend-3")

    def test_feedback_profile_fields_are_required(self):
        response = self.client.post(
            "/api/feedback",
            json={"comment": "Missing profile information."},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.fake_supabase.rows, [])


if __name__ == "__main__":
    unittest.main()
