import json
from pathlib import Path


EXPERT_REVIEW_DOMAINS = [
    {"key": "benefit_cost", "label": "ITS Benefit and Cost"},
    {"key": "deployment_coverage", "label": "ITS Depolyment Coverage"},
    {"key": "policy_legislation", "label": "ITS Policy and Legislation"},
    {"key": "project_planning", "label": "ITS Project and Planning"},
    {"key": "facility", "label": "ITS Facility"},
]


EXPERT_REVIEW_SUBASPECTS = {
    "benefit_cost": [
        ("existing_mobility_benefit", "Existing Mobility Benefit"),
        ("existing_safety_benefit", "Existing Safety Benefit"),
        ("existing_environment_benefit", "Existing Environmental Benefit"),
        ("new_mobility_benefit", "New Mobility Benefit"),
        ("new_safety_benefit", "New Safety Benefit"),
        ("new_environment_benefit", "New Environmental Benefit"),
        ("existing_om_cost", "Existing ITS Operations and Maintenance Cost"),
        ("new_deployment_cost", "New ITS Deployment Cost"),
    ],
    "deployment_coverage": [
        ("signal_management", "Signal Management and Intersection Control"),
        ("traffic_monitoring", "Traffic Monitoring and Data Collection"),
        ("vru_safety", "Vulnerable Road User Safety Applications"),
        ("traveler_information", "Traveler Information and User Services"),
        ("atdm", "Active Traffic and Demand Management"),
        ("safety_enforcement", "Safety Enforcement and Incident Response"),
        ("road_weather", "Road Weather Information and Response"),
        ("work_zone", "Work Zone ITS and Queue Warning"),
        ("transit_fleet", "Transit and Fleet ITS Technology"),
        ("connected_automated", "Connected, Automated, and Emerging Vehicle Technology"),
        ("program_support", "ITS Program Planning and Operational Support"),
    ],
    "policy_legislation": [
        ("policy_document_presence", "Foundational ITS Policy Document Presence"),
        ("legislative_support", "Legislative Support Level"),
        ("technology_documentation_maturity", "Technology Documentation Maturity"),
    ],
    "project_planning": [
        ("federal_awards", "Federally Recognized ITS Awards"),
        ("award_funding", "ITS Award Funding Scale"),
        ("planned_projects", "Planned ITS Project Count"),
        ("planned_corridor_miles", "Planned ITS Corridor Miles"),
    ],
    "facility": [
        ("operations_centers", "Traffic Operations Centers"),
        ("om_facilities_fleets", "ITS Operations and Maintenance Facilities or Fleets"),
        ("labs_rd_units", "ITS Laboratories and R&D Units"),
        ("resource_centers", "ITS Research and Resource Centers or Consortia"),
        ("testbeds_pilot_corridors", "ITS Testbeds or Pilot Corridors"),
    ],
}


DOMAIN_NAME_TO_SUBASPECT_KEY = {
    "Signal Management and Intersection Control": "signal_management",
    "Traffic Monitoring and Data Collection": "traffic_monitoring",
    "Vulnerable Road User Safety Applications": "vru_safety",
    "Traveler Information and User Services": "traveler_information",
    "Active Traffic and Demand Management": "atdm",
    "Safety Enforcement and Incident Response": "safety_enforcement",
    "Road Weather Information and Response": "road_weather",
    "Work Zone ITS and Queue Warning": "work_zone",
    "Transit and Fleet ITS Technology": "transit_fleet",
    "Connected, Automated, and Emerging Vehicle Technology": "connected_automated",
    "ITS Program Planning and Operational Support": "program_support",
}

BASELINE_VALUES_PATH = Path(__file__).resolve().parent / "data" / "baseline_review_values.json"


def get_domain_label(domain_key):
    for domain in EXPERT_REVIEW_DOMAINS:
        if domain["key"] == domain_key:
            return domain["label"]
    return None


def load_baseline_review_values():
    if not BASELINE_VALUES_PATH.exists():
        return {}
    with BASELINE_VALUES_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def format_number(value, digits=3):
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return str(value or "")


def format_percent(value):
    try:
        return f"{float(value):.1f}%"
    except (TypeError, ValueError):
        return str(value or "")


def build_review_items(domain_key):
    subaspects = EXPERT_REVIEW_SUBASPECTS.get(domain_key, [])
    baseline_values = load_baseline_review_values().get(domain_key, {})
    return [
        {
            "subaspect_key": key,
            "subaspect_label": label,
            "current_value": str(baseline_values.get(key, "")),
            "unified_score": "",
            "source_basis": "Preloaded Baseline" if key in baseline_values else "No Value Available",
            "expert_judgment": "",
            "suggested_value": "",
            "confidence_level": "",
            "comment": "",
            "recommend_method_change": False,
        }
        for key, label in subaspects
    ]


def apply_current_values(items, values_by_key):
    next_items = []
    for item in items:
        key = item["subaspect_key"]
        if key in values_by_key:
            next_items.append({**item, **values_by_key[key]})
        else:
            next_items.append(item)
    return next_items


def survey_answer_values(domain_key, answers):
    if domain_key == "benefit_cost":
        mapping = {
            "existing_mobility_benefit": "bc_existing_mobility_benefit",
            "existing_safety_benefit": "bc_existing_safety_benefit",
            "existing_environment_benefit": "bc_existing_environment_benefit",
            "new_mobility_benefit": "bc_new_mobility_benefit",
            "new_safety_benefit": "bc_new_safety_benefit",
            "new_environment_benefit": "bc_new_environment_benefit",
            "existing_om_cost": "bc_existing_om_cost_total",
            "new_deployment_cost": "bc_new_cost_total",
        }
        return {
            subaspect: {
                "current_value": str(answers.get(question_id, "")),
                "source_basis": "Calculated from Survey-Based Updates",
            }
            for subaspect, question_id in mapping.items()
            if str(answers.get(question_id, "")).strip()
        }

    if domain_key == "deployment_coverage":
        mapping = {
            "signal_management": "cvg_pct_signal_management",
            "traffic_monitoring": "cvg_pct_traffic_monitoring",
            "vru_safety": "cvg_pct_vru_safety",
            "traveler_information": "cvg_pct_traveler_information",
            "atdm": "cvg_pct_atdm",
            "safety_enforcement": "cvg_pct_safety_enforcement",
            "road_weather": "cvg_pct_road_weather",
            "work_zone": "cvg_pct_work_zone",
            "transit_fleet": "cvg_pct_transit_fleet",
            "connected_automated": "cvg_pct_connected_automated",
            "program_support": "cvg_pct_program_support",
        }
        return {
            subaspect: {
                "current_value": format_percent(answers.get(question_id)),
                "source_basis": "Calculated from Survey-Based Updates",
            }
            for subaspect, question_id in mapping.items()
            if str(answers.get(question_id, "")).strip()
        }

    if domain_key == "policy_legislation":
        values = {}
        policy_docs = answers.get("doc_policy_presence")
        if isinstance(policy_docs, list):
            values["policy_document_presence"] = {
                "current_value": f"{len(policy_docs)} of 5 policy documents",
                "source_basis": "Calculated from Survey-Based Updates",
            }
        support_counts = [
            ("doc_legislation_restrictive_count", -1),
            ("doc_legislation_neutral_count", 0),
            ("doc_legislation_supportive_count", 1),
            ("doc_legislation_better_supportive_count", 2),
            ("doc_legislation_strong_supportive_count", 3),
        ]
        total = 0
        weighted = 0
        for question_id, score in support_counts:
            try:
                count = int(float(answers.get(question_id) or 0))
            except (TypeError, ValueError):
                count = 0
            total += count
            weighted += count * score
        if total:
            values["legislative_support"] = {
                "current_value": f"{total} scored documents; average raw score {format_number(weighted / total)}",
                "source_basis": "Calculated from Survey-Based Updates",
            }
        if str(answers.get("doc_tech_doc_maturity_pct", "")).strip():
            tech_eval_count = str(answers.get("doc_tech_eval_count") or "").strip()
            maturity_pct = format_percent(answers.get("doc_tech_doc_maturity_pct"))
            values["technology_documentation_maturity"] = {
                "current_value": (
                    f"{tech_eval_count} technology areas; {maturity_pct} mature"
                    if tech_eval_count
                    else f"{maturity_pct} mature"
                ),
                "source_basis": "Calculated from Survey-Based Updates",
            }
        return values

    if domain_key == "project_planning":
        mapping = {
            "federal_awards": "plan_award_count",
            "award_funding": "plan_award_funding",
            "planned_projects": "plan_doc_count",
            "planned_corridor_miles": "plan_corridor_miles",
        }
        return {
            subaspect: {
                "current_value": str(answers.get(question_id, "")),
                "source_basis": "Calculated from Survey-Based Updates",
            }
            for subaspect, question_id in mapping.items()
            if str(answers.get(question_id, "")).strip()
        }

    if domain_key == "facility":
        values = {}
        mapping = {
            "operations_centers": "fac_toc_count",
            "om_facilities_fleets": "fac_om_sites",
            "labs_rd_units": "fac_labs",
            "resource_centers": "fac_resource_centers",
        }
        values.update(
            {
                subaspect: {
                    "current_value": str(answers.get(question_id, "")),
                    "source_basis": "Calculated from Survey-Based Updates",
                }
                for subaspect, question_id in mapping.items()
                if str(answers.get(question_id, "")).strip()
            }
        )
        testbed_parts = [
            str(answers.get("fac_testbed_presence") or "").strip(),
            str(answers.get("fac_testbed_extent") or "").strip(),
        ]
        testbed_value = " | ".join(part for part in testbed_parts if part)
        if testbed_value:
            values["testbeds_pilot_corridors"] = {
                "current_value": testbed_value,
                "source_basis": "Calculated from Survey-Based Updates",
            }
        return values

    return {}


def deployment_upload_values(default_value_items):
    values = {}
    for item in default_value_items:
        subaspect_key = DOMAIN_NAME_TO_SUBASPECT_KEY.get(item.get("domain_name"))
        if not subaspect_key:
            continue
        values[subaspect_key] = {
            "current_value": f"{item.get('scored_agency_count', 0)} scored agencies",
            "unified_score": format_number(item.get("default_value")),
            "source_basis": "Calculated from Upload",
        }
    return values


def legislation_upload_values(analysis):
    if not analysis:
        return {}
    return {
        "legislative_support": {
            "current_value": (
                f"{analysis.get('totalBills', 0)} bills; average raw score "
                f"{format_number(analysis.get('averageRawScore'))}"
            ),
            "unified_score": format_number(analysis.get("unifiedScore")),
            "source_basis": "Calculated from Upload",
        }
    }
