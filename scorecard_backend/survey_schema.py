SURVEY_SCHEMA_VERSION = 1

TOPIC_KEYS = {
    "benefit_cost": "benefit_cost",
    "deployment_coverage": "deployment_coverage",
    "policy_legislation": "policy_legislation",
    "project_planning": "project_planning",
    "facility": "facility",
}

TOPIC_LABELS = {
    TOPIC_KEYS["benefit_cost"]: "ITS Benefit and Cost",
    TOPIC_KEYS["deployment_coverage"]: "ITS Depolyment Coverage",
    TOPIC_KEYS["policy_legislation"]: "ITS Policy and Legislation",
    TOPIC_KEYS["project_planning"]: "ITS Project and Planning",
    TOPIC_KEYS["facility"]: "ITS Facility",
}

QUESTION_IDS = {
    TOPIC_KEYS["benefit_cost"]: {
        "evaluation_year": "bc_eval_year",
        "existing_mobility_benefit": "bc_existing_mobility_benefit",
        "existing_safety_benefit": "bc_existing_safety_benefit",
        "existing_environment_benefit": "bc_existing_environment_benefit",
        "new_mobility_benefit": "bc_new_mobility_benefit",
        "new_safety_benefit": "bc_new_safety_benefit",
        "new_environment_benefit": "bc_new_environment_benefit",
        "existing_om_cost_total": "bc_existing_om_cost_total",
        "new_cost_total": "bc_new_cost_total",
    },
    TOPIC_KEYS["deployment_coverage"]: {
        "base_type": "cvg_base_type",
        "total_units": "cvg_total_units",
        "domains_present": "cvg_domains_present",
        "signal_management_pct": "cvg_pct_signal_management",
        "traffic_monitoring_pct": "cvg_pct_traffic_monitoring",
        "vru_safety_pct": "cvg_pct_vru_safety",
        "traveler_information_pct": "cvg_pct_traveler_information",
        "atdm_pct": "cvg_pct_atdm",
        "safety_enforcement_pct": "cvg_pct_safety_enforcement",
        "road_weather_pct": "cvg_pct_road_weather",
        "work_zone_pct": "cvg_pct_work_zone",
        "transit_fleet_pct": "cvg_pct_transit_fleet",
        "connected_automated_pct": "cvg_pct_connected_automated",
        "program_support_pct": "cvg_pct_program_support",
    },
    TOPIC_KEYS["policy_legislation"]: {
        "policy_presence": "doc_policy_presence",
        "legislation_volume": "doc_legislation_volume",
        "legislation_mix": "doc_legislation_mix",
        "legislation_restrictive_count": "doc_legislation_restrictive_count",
        "legislation_neutral_count": "doc_legislation_neutral_count",
        "legislation_supportive_count": "doc_legislation_supportive_count",
        "legislation_better_supportive_count": "doc_legislation_better_supportive_count",
        "legislation_strong_supportive_count": "doc_legislation_strong_supportive_count",
        "tech_doc_maturity_pct": "doc_tech_doc_maturity_pct",
        "tech_eval_count": "doc_tech_eval_count",
    },
    TOPIC_KEYS["project_planning"]: {
        "award_count": "plan_award_count",
        "award_programs": "plan_award_programs",
        "award_funding": "plan_award_funding",
        "planned_project_count": "plan_doc_count",
        "corridor_miles": "plan_corridor_miles",
        "planning_sources": "plan_doc_sources",
    },
    TOPIC_KEYS["facility"]: {
        "toc_count": "fac_toc_count",
        "om_sites": "fac_om_sites",
        "labs": "fac_labs",
        "resource_centers": "fac_resource_centers",
        "testbed_presence": "fac_testbed_presence",
        "testbed_extent": "fac_testbed_extent",
        "staff_support": "fac_staff_support",
    },
}
