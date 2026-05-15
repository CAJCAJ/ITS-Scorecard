from survey_schema import QUESTION_IDS, TOPIC_KEYS
from survey_score_utils import parse_money


BC_QUESTIONS = QUESTION_IDS[TOPIC_KEYS["benefit_cost"]]


def unify_ratio(ratio):
    if ratio is None or ratio <= 0:
        return 0.0
    return (ratio ** 2) / (1 + ratio ** 2)


def compute_benefit_cost_score(answers):
    existing_mobility = parse_money(answers.get(BC_QUESTIONS["existing_mobility_benefit"]))
    existing_safety = parse_money(answers.get(BC_QUESTIONS["existing_safety_benefit"]))
    existing_environment = parse_money(answers.get(BC_QUESTIONS["existing_environment_benefit"]))
    new_mobility = parse_money(answers.get(BC_QUESTIONS["new_mobility_benefit"]))
    new_safety = parse_money(answers.get(BC_QUESTIONS["new_safety_benefit"]))
    new_environment = parse_money(answers.get(BC_QUESTIONS["new_environment_benefit"]))
    existing_om_cost = parse_money(answers.get(BC_QUESTIONS["existing_om_cost_total"]))
    new_cost_total = parse_money(answers.get(BC_QUESTIONS["new_cost_total"]))

    total_existing_benefit = (
        existing_mobility + existing_safety + existing_environment
    )
    total_new_benefit = new_mobility + new_safety + new_environment
    total_benefit = total_existing_benefit + total_new_benefit
    total_cost = existing_om_cost + new_cost_total

    benefit_cost_ratio = None
    unified_score = None
    if total_cost > 0:
        benefit_cost_ratio = total_benefit / total_cost
        unified_score = unify_ratio(benefit_cost_ratio)

    breakdown = [
        {
            "label": "Existing Mobility Benefit",
            "value": existing_mobility,
            "weighted_value": unify_ratio(existing_mobility / total_cost) if total_cost > 0 else 0.0,
            "note": "Annual monetized mobility benefit from existing ITS systems.",
        },
        {
            "label": "Existing Safety Benefit",
            "value": existing_safety,
            "weighted_value": unify_ratio(existing_safety / total_cost) if total_cost > 0 else 0.0,
            "note": "Annual monetized safety benefit from existing ITS systems.",
        },
        {
            "label": "Existing Environmental Benefit",
            "value": existing_environment,
            "weighted_value": unify_ratio(existing_environment / total_cost) if total_cost > 0 else 0.0,
            "note": "Annual monetized environmental benefit from existing ITS systems.",
        },
        {
            "label": "New Mobility Benefit",
            "value": new_mobility,
            "weighted_value": unify_ratio(new_mobility / total_cost) if total_cost > 0 else 0.0,
            "note": "Annual monetized mobility benefit from newly deployed ITS systems.",
        },
        {
            "label": "New Safety Benefit",
            "value": new_safety,
            "weighted_value": unify_ratio(new_safety / total_cost) if total_cost > 0 else 0.0,
            "note": "Annual monetized safety benefit from newly deployed ITS systems.",
        },
        {
            "label": "New Environmental Benefit",
            "value": new_environment,
            "weighted_value": unify_ratio(new_environment / total_cost) if total_cost > 0 else 0.0,
            "note": "Annual monetized environmental benefit from newly deployed ITS systems.",
        },
        {
            "label": "Existing ITS O&M Cost",
            "value": existing_om_cost,
            "weighted_value": unify_ratio(total_benefit / existing_om_cost) if existing_om_cost > 0 else 0.0,
            "note": "Annual operations, maintenance, and repair cost for existing ITS systems.",
        },
        {
            "label": "New ITS Deployment Cost",
            "value": new_cost_total,
            "weighted_value": unify_ratio(total_benefit / new_cost_total) if new_cost_total > 0 else 0.0,
            "note": "Annual design, planning, testing, and deployment cost for new ITS systems.",
        },
    ]

    has_input = any(item["value"] > 0 for item in breakdown)
    has_required_input = total_benefit > 0 and total_cost > 0

    return {
        "has_input": has_input,
        "has_required_input": has_required_input,
        "evaluation_year": str(answers.get(BC_QUESTIONS["evaluation_year"], "")).strip(),
        "total_existing_benefit": total_existing_benefit,
        "total_new_benefit": total_new_benefit,
        "total_benefit": total_benefit,
        "total_cost": total_cost,
        "benefit_cost_ratio": benefit_cost_ratio,
        "unified_score": unified_score,
        "breakdown": breakdown,
    }
