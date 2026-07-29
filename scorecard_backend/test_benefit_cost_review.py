import csv
import os
import unittest
from unittest.mock import patch

from app import app
from benefit_cost_records import aggregate_long_benefit_cost_records


class BenefitCostReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        csv_path = os.path.join(
            os.path.dirname(__file__), "..", "BC_Analysis_Default.csv"
        )
        with open(csv_path, newline="", encoding="utf-8-sig") as handle:
            rows = [
                row
                for row in csv.DictReader(handle)
                if row["state"] == "Texas" and row["survey_year"] == "2000"
            ]
        cls.record = aggregate_long_benefit_cost_records(rows)

    def setUp(self):
        self.client = app.test_client()

    @patch("app.fetch_latest_survey_update", return_value=(None, {}))
    @patch("app.find_latest_benefit_cost_record")
    def test_mock_defaults_are_flagged_for_expert_review(
        self, find_record, _fetch_submission
    ):
        find_record.return_value = (self.record, {"id": "test-document"})

        response = self.client.get(
            "/api/expert-review/current-values",
            query_string={
                "year": "2000",
                "state": "Texas",
                "domain_key": "benefit_cost",
            },
        )

        self.assertEqual(response.status_code, 200)
        items = {
            item["subaspect_key"]: item
            for item in response.get_json()["items"]
        }

        mobility = items["existing_mobility_benefit"]
        self.assertFalse(mobility["review_required"])
        self.assertEqual(mobility["source_basis"], "Exact Dataset")

        safety = items["existing_safety_benefit"]
        self.assertTrue(safety["review_required"])
        self.assertEqual(
            safety["source_basis"],
            "Mock Default - Expert Review Required",
        )
        self.assertEqual(safety["provenance_type"], "Mock_Default")
        self.assertTrue(safety["source_title"])


if __name__ == "__main__":
    unittest.main()
