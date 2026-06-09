import math

from survey_schema import QUESTION_IDS, TOPIC_KEYS
from survey_score_utils import count_selected, parse_first_number, parse_positive_number


PLANNING_QUESTIONS = QUESTION_IDS[TOPIC_KEYS["project_planning"]]
PLANNING_MAX_SCORE = 1.0


def count_planning_values(values):
    if isinstance(values, list):
        return len([value for value in values if str(value).strip()])
    if isinstance(values, str):
        return len([value for value in values.split(";") if value.strip()])
    return count_selected(values)


def bounded_growth(value, scale):
    if value <= 0:
        return 0.0
    return 1 - math.exp(-value / scale)


def compute_planning_score(answers):
    award_count = parse_positive_number(answers.get(PLANNING_QUESTIONS["award_count"]))
    award_funding = parse_first_number(answers.get(PLANNING_QUESTIONS["award_funding"]))
    planned_project_count = parse_positive_number(
        answers.get(PLANNING_QUESTIONS["planned_project_count"])
    )
    corridor_miles = parse_positive_number(answers.get(PLANNING_QUESTIONS["corridor_miles"]))
    award_programs = count_planning_values(answers.get(PLANNING_QUESTIONS["award_programs"]))
    planning_sources = count_planning_values(answers.get(PLANNING_QUESTIONS["planning_sources"]))

    award_program_score = min(award_programs / 3.0, 1.0)
    planning_source_score = min(planning_sources / 5.0, 1.0)

    award_score = min(
        PLANNING_MAX_SCORE,
        (0.40 * bounded_growth(award_count, 1.5))
        + (0.35 * bounded_growth(award_funding, 15_000_000))
        + (0.25 * award_program_score),
    )

    planning_score = min(
        PLANNING_MAX_SCORE,
        (0.38 * bounded_growth(planned_project_count, 4.0))
        + (0.34 * bounded_growth(corridor_miles, 30.0))
        + (0.28 * planning_source_score),
    )

    unified_score = min(
        PLANNING_MAX_SCORE,
        max(planning_score, (0.15 * award_score) + (0.85 * planning_score)),
    )

    breakdown = [
        {
            "label": "Federally Recognized Grants",
            "value": award_count,
            "weighted_value": award_score,
            "note": "Grant count contributes to the award diagnostic score on a maturity curve.",
        },
        {
            "label": "Award Funding",
            "value": award_funding,
            "weighted_value": award_score,
            "note": "Funding contributes to the award diagnostic score on a maturity curve.",
        },
        {
            "label": "Planned ITS Projects",
            "value": planned_project_count,
            "weighted_value": planning_score,
            "note": "Project count contributes gradually to the planning maturity component.",
        },
        {
            "label": "Planned Corridor Miles",
            "value": corridor_miles,
            "weighted_value": planning_score,
            "note": "Corridor mileage contributes gradually for broader planned deployment coverage.",
        },
        {
            "label": "Award Programs Listed",
            "value": award_programs,
            "weighted_value": 0.25 * award_program_score,
            "note": "Program diversity provides a small supporting contribution to award maturity.",
        },
        {
            "label": "Planning Sources Listed",
            "value": planning_sources,
            "weighted_value": 0.28 * planning_source_score,
            "note": "Planning source diversity provides a small supporting contribution to planning maturity.",
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
