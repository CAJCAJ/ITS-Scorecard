from survey_schema import QUESTION_IDS, TOPIC_KEYS
from survey_score_utils import count_selected, parse_first_number, parse_positive_number


PLANNING_QUESTIONS = QUESTION_IDS[TOPIC_KEYS["project_planning"]]
PLANNING_MAX_SCORE = 1.0
PLANNING_BASE_SCORE = 0.60
AWARD_YEAR_MIN_SCORE = 0.85
AWARD_YEAR_MAX_SCORE = 0.95
NO_AWARD_PLANNING_MAX_SCORE = 0.78


def count_planning_values(values):
    if isinstance(values, list):
        return len([value for value in values if str(value).strip()])
    if isinstance(values, str):
        return len([value for value in values.split(";") if value.strip()])
    return count_selected(values)


def compute_planning_score(answers):
    award_count = parse_positive_number(answers.get(PLANNING_QUESTIONS["award_count"]))
    award_funding = parse_first_number(answers.get(PLANNING_QUESTIONS["award_funding"]))
    planned_project_count = parse_positive_number(
        answers.get(PLANNING_QUESTIONS["planned_project_count"])
    )
    corridor_miles = parse_positive_number(answers.get(PLANNING_QUESTIONS["corridor_miles"]))
    award_programs = count_planning_values(answers.get(PLANNING_QUESTIONS["award_programs"]))
    planning_sources = count_planning_values(answers.get(PLANNING_QUESTIONS["planning_sources"]))

    has_award = award_count > 0
    has_planning_file = planned_project_count > 0 or planning_sources > 0 or corridor_miles > 0

    file_bonus = min(
        0.18,
        (0.038 * min(planned_project_count, 4))
        + (0.012 * min(planning_sources, 3))
        + (0.010 if corridor_miles > 0 else 0.0),
    )
    planning_score = min(NO_AWARD_PLANNING_MAX_SCORE, PLANNING_BASE_SCORE + file_bonus)

    award_bonus = min(
        0.08,
        (0.020 * min(award_count, 3))
        + (0.010 * min(award_programs, 3))
        + (0.010 if award_funding > 0 else 0.0),
    )

    award_score = min(PLANNING_MAX_SCORE, AWARD_YEAR_MIN_SCORE + award_bonus) if has_award else 0.0
    if has_award:
        unified_score = min(AWARD_YEAR_MAX_SCORE, award_score + (0.25 * file_bonus))
    else:
        unified_score = planning_score

    breakdown = [
        {
            "label": "Planning Baseline",
            "value": 1,
            "weighted_value": PLANNING_BASE_SCORE,
            "note": "Every state-year starts with the baseline planning readiness score.",
        },
        {
            "label": "Federally Recognized Grants",
            "value": award_count,
            "weighted_value": award_score,
            "note": "Any verified SMART, ATCMTD, ATTAIN, or SS4A award year receives at least 0.850.",
        },
        {
            "label": "Award Funding",
            "value": award_funding,
            "weighted_value": award_score,
            "note": "Funding is supporting evidence for the award-year score and adds a small bonus.",
        },
        {
            "label": "Planned ITS Projects",
            "value": planned_project_count,
            "weighted_value": planning_score,
            "note": "Planning-file evidence lifts non-award years from 0.600 toward the planning cap.",
        },
        {
            "label": "Planned Corridor Miles",
            "value": corridor_miles,
            "weighted_value": planning_score,
            "note": "Corridor mileage is retained as optional supporting planning evidence.",
        },
        {
            "label": "Award Programs Listed",
            "value": award_programs,
            "weighted_value": min(0.03, 0.010 * min(award_programs, 3)),
            "note": "Program diversity adds a limited bonus when an award is present.",
        },
        {
            "label": "Planning Sources Listed",
            "value": planning_sources,
            "weighted_value": min(0.03, 0.010 * min(planning_sources, 3)),
            "note": "Planning source diversity provides a limited planning-file bonus.",
        },
    ]

    return {
        "has_input": True,
        "has_award": has_award,
        "has_planning_file": has_planning_file,
        "award_score": award_score,
        "planning_score": planning_score,
        "unified_score": unified_score,
        "breakdown": breakdown,
    }
