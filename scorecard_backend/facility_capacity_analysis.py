import math

from survey_schema import QUESTION_IDS, TOPIC_KEYS
from survey_score_utils import parse_first_number, parse_positive_number


FACILITY_QUESTIONS = QUESTION_IDS[TOPIC_KEYS["facility"]]
FACILITY_MAX_SCORE = 0.98
FACILITY_CAPACITY_SCALE = 7.5
FACILITY_CURVE_SHAPE = 1.5


def map_presence_score(value):
    if value == "Closed-course or limited pilot site":
        return 1.0
    if value == "Open-road pilot corridor":
        return 1.5
    if value == "Both closed and open test environments":
        return 2.0
    return 0.0


def map_staff_support_score(value):
    if value == "Adequate for current needs":
        return 1.0
    if value == "Strong and scalable":
        return 1.5
    if value == "Advanced with dedicated specialty teams":
        return 2.0
    return 0.0


def compute_facility_capacity_score(answers):
    toc_count = parse_positive_number(answers.get(FACILITY_QUESTIONS["toc_count"]))
    om_sites = parse_positive_number(answers.get(FACILITY_QUESTIONS["om_sites"]))
    labs = parse_positive_number(answers.get(FACILITY_QUESTIONS["labs"]))
    resource_centers = parse_positive_number(
        answers.get(FACILITY_QUESTIONS["resource_centers"])
    )
    testbed_presence_score = map_presence_score(
        answers.get(FACILITY_QUESTIONS["testbed_presence"])
    )
    extent_raw = parse_first_number(answers.get(FACILITY_QUESTIONS["testbed_extent"]))
    extent_score = min(extent_raw / 10.0, 1.0)
    staff_support_score = map_staff_support_score(
        answers.get(FACILITY_QUESTIONS["staff_support"])
    )

    breakdown = [
        {
            "label": "Traffic Operations Centers",
            "value": toc_count,
            "weighted_value": toc_count,
            "note": "Count of agency traffic or transportation operations centers.",
        },
        {
            "label": "ITS O&M Facilities / Fleets",
            "value": om_sites,
            "weighted_value": om_sites,
            "note": "Count of ITS operations and maintenance support sites or fleets.",
        },
        {
            "label": "ITS Labs / R&D Units",
            "value": labs,
            "weighted_value": labs,
            "note": "Count of ITS laboratories, simulation environments, or research units.",
        },
        {
            "label": "ITS Resource Centers / Consortia",
            "value": resource_centers,
            "weighted_value": resource_centers,
            "note": "Count of ITS research and resource centers or consortia.",
        },
        {
            "label": "Testbed Availability",
            "value": testbed_presence_score,
            "weighted_value": testbed_presence_score,
            "note": "Converted from the selected testing-environment maturity level.",
        },
        {
            "label": "Testbed Extent Bonus",
            "value": extent_raw,
            "weighted_value": extent_score,
            "note": "Converted from the first numeric value in the reported corridor length or coverage.",
        },
        {
            "label": "Staff / Operational Support",
            "value": staff_support_score,
            "weighted_value": staff_support_score,
            "note": "Converted from the selected institutional support level.",
        },
    ]

    aggregate_capacity = sum(item["weighted_value"] for item in breakdown)
    has_input = any(item["weighted_value"] > 0 for item in breakdown)
    unified_score = (
        min(
            FACILITY_MAX_SCORE,
            1
            - math.exp(
                -((aggregate_capacity / FACILITY_CAPACITY_SCALE) ** FACILITY_CURVE_SHAPE)
            ),
        )
        if has_input
        else None
    )
    if has_input and aggregate_capacity > 0 and unified_score is not None:
        running_total = 0.0
        for index, item in enumerate(breakdown):
            if index == len(breakdown) - 1:
                contribution = max(0.0, unified_score - running_total)
            else:
                contribution = unified_score * item["weighted_value"] / aggregate_capacity
                running_total += contribution
            item["unified_score_contribution"] = min(
                FACILITY_MAX_SCORE, max(0.0, round(contribution, 6))
            )
    else:
        for item in breakdown:
            item["unified_score_contribution"] = 0.0

    return {
        "has_input": has_input,
        "aggregate_capacity": aggregate_capacity,
        "unified_score": unified_score,
        "breakdown": breakdown,
    }
