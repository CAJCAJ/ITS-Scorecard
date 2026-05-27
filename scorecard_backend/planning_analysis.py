import math

from survey_schema import QUESTION_IDS, TOPIC_KEYS
from survey_score_utils import count_selected, parse_first_number, parse_positive_number


PLANNING_QUESTIONS = QUESTION_IDS[TOPIC_KEYS["project_planning"]]
PLANNING_MAX_SCORE = 0.68


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
    award_programs = count_selected(answers.get(PLANNING_QUESTIONS["award_programs"]))
    planning_sources = count_selected(answers.get(PLANNING_QUESTIONS["planning_sources"]))

    award_program_score = min(award_programs / 3.0, 1.0)
    planning_source_score = min(planning_sources / 5.0, 1.0)

    award_score = min(
        PLANNING_MAX_SCORE,
        (0.45 * bounded_growth(award_count, 1.5))
        + (0.22 * bounded_growth(award_funding, 20_000_000))
        + (0.08 * award_program_score),
    )

    planning_score = min(
        PLANNING_MAX_SCORE,
        (0.36 * bounded_growth(planned_project_count, 6.0))
        + (0.27 * bounded_growth(corridor_miles, 50.0))
        + (0.12 * planning_source_score),
    )

    unified_score = min(
        PLANNING_MAX_SCORE,
        (0.55 * award_score) + (0.45 * planning_score),
    )

    breakdown = [
        {
            "label": "Federally Recognized Grants",
            "value": award_count,
            "weighted_value": award_score,
            "note": "Grant count contributes on a capped maturity curve rather than creating an immediate high score.",
        },
        {
            "label": "Award Funding",
            "value": award_funding,
            "weighted_value": award_score,
            "note": "Funding contributes gradually and is capped to keep default planning scores conservative.",
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
            "weighted_value": 0.08 * award_program_score,
            "note": "Program diversity provides a small supporting contribution to award maturity.",
        },
        {
            "label": "Planning Sources Listed",
            "value": planning_sources,
            "weighted_value": 0.12 * planning_source_score,
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
