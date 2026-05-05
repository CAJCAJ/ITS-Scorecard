from survey_schema import QUESTION_IDS, TOPIC_KEYS
from survey_score_utils import count_selected, parse_integer_count, parse_percentage_fraction


POLICY_QUESTIONS = QUESTION_IDS[TOPIC_KEYS["policy_legislation"]]


def unify_positive_score(raw_score):
    return (raw_score ** 2) / (1 + raw_score ** 2)


LEGISLATION_MIX_FALLBACK = {
    "Mostly restrictive": 0.0,
    "Mostly neutral": 0.25,
    "Mixed but leaning supportive": 0.625,
    "Strongly supportive": 1.0,
}


def compute_policy_legislation_score(answers):
    policy_presence_count = count_selected(answers.get(POLICY_QUESTIONS["policy_presence"]))
    policy_presence_score = policy_presence_count / 5 if policy_presence_count else 0.0

    restrictive_count = parse_integer_count(
        answers.get(POLICY_QUESTIONS["legislation_restrictive_count"])
    )
    neutral_count = parse_integer_count(
        answers.get(POLICY_QUESTIONS["legislation_neutral_count"])
    )
    supportive_count = parse_integer_count(
        answers.get(POLICY_QUESTIONS["legislation_supportive_count"])
    )
    better_supportive_count = parse_integer_count(
        answers.get(POLICY_QUESTIONS["legislation_better_supportive_count"])
    )
    strong_supportive_count = parse_integer_count(
        answers.get(POLICY_QUESTIONS["legislation_strong_supportive_count"])
    )

    scored_legislation_count = (
        restrictive_count
        + neutral_count
        + supportive_count
        + better_supportive_count
        + strong_supportive_count
    )

    if scored_legislation_count > 0:
        raw_legislation_average = (
            (-1 * restrictive_count)
            + (0 * neutral_count)
            + (1 * supportive_count)
            + (2 * better_supportive_count)
            + (3 * strong_supportive_count)
        ) / scored_legislation_count
        legislation_support_score = (raw_legislation_average + 1) / 4
    else:
        legislation_support_score = LEGISLATION_MIX_FALLBACK.get(
            answers.get(POLICY_QUESTIONS["legislation_mix"], ""),
            0.0,
        )

    tech_eval_count = parse_integer_count(answers.get(POLICY_QUESTIONS["tech_eval_count"]))
    tech_doc_maturity_score = parse_percentage_fraction(
        answers.get(POLICY_QUESTIONS["tech_doc_maturity_pct"])
    )

    raw_policy_score = (
        policy_presence_score
        + legislation_support_score
        + tech_doc_maturity_score
    )

    unified_score = unify_positive_score(raw_policy_score) if raw_policy_score > 0 else None

    breakdown = [
        {
            "label": "Foundational Policy Documents",
            "value": policy_presence_count,
            "weighted_value": policy_presence_score,
            "note": "Share of the five foundational ITS policy and planning documents currently in place.",
        },
        {
            "label": "Legislative Support",
            "value": scored_legislation_count or parse_integer_count(answers.get(POLICY_QUESTIONS["legislation_volume"])),
            "weighted_value": legislation_support_score,
            "note": "Average legislation support level converted to a 0 to 1 score.",
        },
        {
            "label": "Technology Documentation Maturity",
            "value": tech_eval_count,
            "weighted_value": tech_doc_maturity_score,
            "note": "Share of evaluated ITS technology areas with clear supporting documentation.",
        },
    ]

    return {
        "has_input": any(item["weighted_value"] > 0 or item["value"] > 0 for item in breakdown),
        "policy_presence_score": policy_presence_score,
        "legislation_support_score": legislation_support_score,
        "technology_documentation_score": tech_doc_maturity_score,
        "raw_policy_score": raw_policy_score,
        "unified_score": unified_score,
        "breakdown": breakdown,
    }
