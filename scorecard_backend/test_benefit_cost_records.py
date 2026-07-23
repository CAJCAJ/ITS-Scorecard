import csv
import os
import unittest

from benefit_cost_analysis import compute_benefit_cost_score
from benefit_cost_records import (
    BC_COMPONENT_KEYS,
    aggregate_long_benefit_cost_records,
    is_long_benefit_cost_record,
    validate_long_benefit_cost_records,
)


class BenefitCostRecordTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        csv_path = os.path.join(
            os.path.dirname(__file__), "..", "BC_Analysis_Default.csv"
        )
        with open(csv_path, newline="", encoding="utf-8-sig") as handle:
            cls.rows = list(csv.DictReader(handle))

    def test_normalized_table_is_complete_and_valid(self):
        self.assertEqual(len(self.rows), 384)
        self.assertEqual(validate_long_benefit_cost_records(self.rows), [])

        state_years = {(row["state"], row["survey_year"]) for row in self.rows}
        self.assertEqual(len(state_years), 48)

    def test_aggregation_preserves_all_scoring_components(self):
        rows = [
            row
            for row in self.rows
            if row["state"] == "Texas" and row["survey_year"] == "2015"
        ]
        aggregated = aggregate_long_benefit_cost_records(rows)

        self.assertEqual(set(BC_COMPONENT_KEYS) - set(aggregated), set())
        self.assertEqual(len(aggregated["_component_details"]), 8)
        self.assertEqual(aggregated["_provenance_counts"]["Exact_Dataset"], 2)
        self.assertTrue(aggregated["_review_required"])

    def test_aggregated_values_feed_existing_score_calculation(self):
        rows = [
            row
            for row in self.rows
            if row["state"] == "Texas" and row["survey_year"] == "2000"
        ]
        aggregated = aggregate_long_benefit_cost_records(rows)
        answers = {key: aggregated[key] for key in BC_COMPONENT_KEYS}
        answers["bc_eval_year"] = aggregated["survey_year"]
        result = compute_benefit_cost_score(answers)

        self.assertTrue(result["has_required_input"])
        self.assertEqual(result["evaluation_year"], "2000")
        self.assertEqual(len(result["breakdown"]), 8)
        self.assertAlmostEqual(
            result["total_benefit"],
            sum(float(aggregated[key]) for key in BC_COMPONENT_KEYS[:6]),
        )

    def test_legacy_wide_record_remains_distinguishable(self):
        legacy_path = os.path.join(
            os.path.dirname(__file__), "..", "benefit_cost_defaults_2000_2023_mock.csv"
        )
        with open(legacy_path, newline="", encoding="utf-8-sig") as handle:
            legacy_record = next(csv.DictReader(handle))

        self.assertFalse(is_long_benefit_cost_record(legacy_record))
        self.assertEqual(validate_long_benefit_cost_records([legacy_record]), [])


if __name__ == "__main__":
    unittest.main()
