import math

from survey_schema import QUESTION_IDS, TOPIC_KEYS
from survey_score_utils import count_selected, parse_first_number, parse_positive_number


PLANNING_QUESTIONS = QUESTION_IDS[TOPIC_KEYS["project_planning"]]
PLANNING_FUNDING_THRESHOLD = 5_000_000
PLANNING_GROWTH_BETA = 0.35


def compute_planning_score(answers):
    award_count = parse_positive_number(answers.get(PLANNING_QUESTIONS["award_count"]))
    award_funding = parse_first_number(answers.get(PLANNING_QUESTIONS["award_funding"]))
    planned_project_count = parse_positive_number(
        answers.get(PLANNING_QUESTIONS["planned_project_count"])
    )
    corridor_miles = parse_positive_number(answers.get(PLANNING_QUESTIONS["corridor_miles"]))
    award_programs = count_selected(answers.get(PLANNING_QUESTIONS["award_programs"]))
    planning_sources = count_selected(answers.get(PLANNING_QUESTIONS["planning_sources"]))

    award_score = 0.0
    if award_count > 0:
        award_score = 0.8
        if award_funding > PLANNING_FUNDING_THRESHOLD:
            award_score = 0.85 + 0.15 * (
                1
                - math.exp(
                    -(award_funding - PLANNING_FUNDING_THRESHOLD)
                    / PLANNING_FUNDING_THRESHOLD
                )
            )

    planning_score = 0.0
    if planned_project_count > 0 or corridor_miles > 0:
        if planned_project_count <= 5 and corridor_miles <= 10:
            planning_score = 0.5
        else:
            planning_magnitude = max(0.0, planned_project_count - 5) + max(
                0.0, corridor_miles - 10
            ) / 10
            planning_score = 0.5 + 0.5 * (
                1 - math.exp(-PLANNING_GROWTH_BETA * planning_magnitude)
            )

    unified_score = 0.9 * award_score + 0.1 * planning_score

    breakdown = [
        {
            "label": "Federally Recognized Grants",
            "value": award_count,
            "weighted_value": award_score,
            "note": "Baseline award score is triggered once at least one qualifying ITS award is reported.",
        },
        {
            "label": "Award Funding",
            "value": award_funding,
            "weighted_value": award_score,
            "note": "Funding increases the award score after a significant funding threshold is exceeded.",
        },
        {
            "label": "Planned ITS Projects",
            "value": planned_project_count,
            "weighted_value": planning_score,
            "note": "Project count contributes to the planning scale component once planned ITS work is documented.",
        },
        {
            "label": "Planned Corridor Miles",
            "value": corridor_miles,
            "weighted_value": planning_score,
            "note": "Corridor mileage contributes to the planning scale component for broader planned deployment coverage.",
        },
        {
            "label": "Award Programs Listed",
            "value": award_programs,
            "weighted_value": 0.0,
            "note": "Tracked as supporting input only and not directly scored in the current model.",
        },
        {
            "label": "Planning Sources Listed",
            "value": planning_sources,
            "weighted_value": 0.0,
            "note": "Tracked as supporting input only and not directly scored in the current model.",
        },
    ]

    has_input = any(item["value"] > 0 for item in breakdown)

    return {
        "has_input": has_input,
        "award_score": award_score,
        "planning_score": planning_score,
        "unified_score": unified_score if has_input else None,
        "breakdown": breakdown,
    }
