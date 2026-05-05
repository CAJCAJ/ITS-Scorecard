from survey_schema import QUESTION_IDS, TOPIC_KEYS
from survey_score_utils import count_selected, parse_percentage_fraction, parse_positive_number


COVERAGE_QUESTIONS = QUESTION_IDS[TOPIC_KEYS["deployment_coverage"]]

DOMAIN_FIELDS = [
    ("Signal Management and Intersection Control", COVERAGE_QUESTIONS["signal_management_pct"]),
    ("Traffic Monitoring and Data Collection", COVERAGE_QUESTIONS["traffic_monitoring_pct"]),
    ("Vulnerable Road User Safety Applications", COVERAGE_QUESTIONS["vru_safety_pct"]),
    ("Traveler Information and User Services", COVERAGE_QUESTIONS["traveler_information_pct"]),
    ("Active Traffic and Demand Management", COVERAGE_QUESTIONS["atdm_pct"]),
    ("Safety Enforcement and Incident Response", COVERAGE_QUESTIONS["safety_enforcement_pct"]),
    ("Road Weather Information and Response", COVERAGE_QUESTIONS["road_weather_pct"]),
    ("Work Zone ITS and Queue Warning", COVERAGE_QUESTIONS["work_zone_pct"]),
    ("Transit and Fleet ITS Technology", COVERAGE_QUESTIONS["transit_fleet_pct"]),
    ("Connected, Automated, and Emerging Vehicle Technology", COVERAGE_QUESTIONS["connected_automated_pct"]),
    ("ITS Program Planning and Operational Support", COVERAGE_QUESTIONS["program_support_pct"]),
]


def coverage_unification(raw_score):
    return 1 - ((1 - raw_score) ** 2)


def compute_deployment_coverage_score(answers):
    total_units = parse_positive_number(answers.get(COVERAGE_QUESTIONS["total_units"]))
    domain_scores = []
    breakdown = []

    for label, field_id in DOMAIN_FIELDS:
        raw_value = parse_positive_number(answers.get(field_id))
        if raw_value <= 0:
            continue
        fraction = parse_percentage_fraction(raw_value)
        domain_scores.append(fraction)
        breakdown.append(
            {
                "label": label,
                "value": min(raw_value, 100.0),
                "weighted_value": fraction,
                "note": "Percent of the applicable infrastructure, fleet, or program base with this deployment domain in place.",
            }
        )

    raw_coverage_score = (
        sum(domain_scores) / len(domain_scores) if domain_scores else None
    )
    unified_score = (
        coverage_unification(raw_coverage_score)
        if raw_coverage_score is not None
        else None
    )

    return {
        "has_input": bool(domain_scores),
        "base_type": answers.get(COVERAGE_QUESTIONS["base_type"], ""),
        "total_units": total_units,
        "represented_domain_count": count_selected(
            answers.get(COVERAGE_QUESTIONS["domains_present"])
        ),
        "raw_coverage_score": raw_coverage_score,
        "unified_score": unified_score,
        "breakdown": breakdown,
    }
