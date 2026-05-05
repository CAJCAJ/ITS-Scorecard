export const SURVEY_SCHEMA_VERSION = 1;

export const TOPIC_KEYS = {
  BENEFIT_COST: "benefit_cost",
  DEPLOYMENT_COVERAGE: "deployment_coverage",
  POLICY_LEGISLATION: "policy_legislation",
  PROJECT_PLANNING: "project_planning",
  FACILITY: "facility",
};

export const LEGACY_TOPIC_LABEL_TO_KEY = {
  "ITS Benefit and Cost": TOPIC_KEYS.BENEFIT_COST,
  "ITS Depolyment Coverage": TOPIC_KEYS.DEPLOYMENT_COVERAGE,
  "ITS Policy and Legislation": TOPIC_KEYS.POLICY_LEGISLATION,
  "ITS Project and Planning": TOPIC_KEYS.PROJECT_PLANNING,
  "ITS Facility": TOPIC_KEYS.FACILITY,
};

export const TOPIC_DEFINITIONS = [
  {
    key: TOPIC_KEYS.BENEFIT_COST,
    label: "ITS Benefit and Cost",
    questions: [
      {
        id: "bc_eval_year",
        label: "What evaluation year are these benefit and cost values for?",
        type: "number",
        placeholder: "e.g. 2024",
      },
      {
        id: "bc_existing_mobility_benefit",
        label: "What is the annual monetized mobility benefit from existing ITS systems?",
        type: "text",
        placeholder: "e.g. 1250000",
      },
      {
        id: "bc_existing_safety_benefit",
        label: "What is the annual monetized safety benefit from existing ITS systems?",
        type: "text",
        placeholder: "e.g. 980000",
      },
      {
        id: "bc_existing_environment_benefit",
        label: "What is the annual monetized environmental benefit from existing ITS systems?",
        type: "text",
        placeholder: "e.g. 175000",
      },
      {
        id: "bc_new_mobility_benefit",
        label: "What is the annual monetized mobility benefit from newly deployed ITS systems?",
        type: "text",
        placeholder: "e.g. 650000",
      },
      {
        id: "bc_new_safety_benefit",
        label: "What is the annual monetized safety benefit from newly deployed ITS systems?",
        type: "text",
        placeholder: "e.g. 420000",
      },
      {
        id: "bc_new_environment_benefit",
        label: "What is the annual monetized environmental benefit from newly deployed ITS systems?",
        type: "text",
        placeholder: "e.g. 110000",
      },
      {
        id: "bc_existing_om_cost_total",
        label: "What is the total annual ITS operations, maintenance, and repair cost for existing systems?",
        type: "text",
        placeholder: "e.g. 1450000",
      },
      {
        id: "bc_new_cost_total",
        label: "What is the total annual design, planning, testing, and deployment cost for new ITS systems?",
        type: "text",
        placeholder: "e.g. 2100000",
      },
    ],
  },
  {
    key: TOPIC_KEYS.DEPLOYMENT_COVERAGE,
    label: "ITS Depolyment Coverage",
    questions: [
      {
        id: "cvg_base_type",
        label: "What is the primary coverage base for this agency?",
        type: "select",
        options: [
          "Signalized intersections",
          "Roadway / freeway miles",
          "Mixed infrastructure base",
        ],
      },
      {
        id: "cvg_total_units",
        label: "How many total ITS-applicable infrastructure units are in the agency inventory?",
        type: "number",
        placeholder: "e.g. total intersections or total miles",
      },
      {
        id: "cvg_domains_present",
        label: "Which ITS deployment domains are currently represented in the agency survey?",
        type: "multiselect",
        options: [
          "Signal Management and Intersection Control",
          "Traffic Monitoring and Data Collection",
          "Vulnerable Road User Safety Applications",
          "Traveler Information and User Services",
          "Active Traffic and Demand Management",
          "Safety Enforcement and Incident Response",
          "Road Weather Information and Response",
          "Work Zone ITS and Queue Warning",
          "Transit and Fleet ITS Technology",
          "Connected, Automated, and Emerging Vehicle Technology",
          "ITS Program Planning and Operational Support",
        ],
      },
      {
        id: "cvg_pct_signal_management",
        label: "What percentage of the applicable infrastructure base currently has Signal Management and Intersection Control deployed?",
        type: "number",
        placeholder: "Enter 0-100",
      },
      {
        id: "cvg_pct_traffic_monitoring",
        label: "What percentage of the applicable infrastructure base currently has Traffic Monitoring and Data Collection deployed?",
        type: "number",
        placeholder: "Enter 0-100",
      },
      {
        id: "cvg_pct_vru_safety",
        label: "What percentage of eligible locations currently has Vulnerable Road User Safety Applications deployed?",
        type: "number",
        placeholder: "Enter 0-100",
      },
      {
        id: "cvg_pct_traveler_information",
        label: "What percentage of the applicable infrastructure base currently has Traveler Information and User Services deployed?",
        type: "number",
        placeholder: "Enter 0-100",
      },
      {
        id: "cvg_pct_atdm",
        label: "What percentage of the applicable infrastructure base currently has Active Traffic and Demand Management deployed?",
        type: "number",
        placeholder: "Enter 0-100",
      },
      {
        id: "cvg_pct_safety_enforcement",
        label: "What percentage of the applicable infrastructure base currently has Safety Enforcement and Incident Response deployed?",
        type: "number",
        placeholder: "Enter 0-100",
      },
      {
        id: "cvg_pct_road_weather",
        label: "What percentage of the applicable infrastructure base currently has Road Weather Information and Response deployed?",
        type: "number",
        placeholder: "Enter 0-100",
      },
      {
        id: "cvg_pct_work_zone",
        label: "What percentage of the applicable infrastructure base currently has Work Zone ITS and Queue Warning deployed?",
        type: "number",
        placeholder: "Enter 0-100",
      },
      {
        id: "cvg_pct_transit_fleet",
        label: "What percentage of the applicable fleet or service base currently uses Transit and Fleet ITS Technology?",
        type: "number",
        placeholder: "Enter 0-100",
      },
      {
        id: "cvg_pct_connected_automated",
        label: "What percentage of the applicable infrastructure or program base currently supports Connected, Automated, and Emerging Vehicle Technology?",
        type: "number",
        placeholder: "Enter 0-100",
      },
      {
        id: "cvg_pct_program_support",
        label: "What percentage of ITS Program Planning and Operational Support capability is currently in place?",
        type: "number",
        placeholder: "Enter 0-100",
      },
    ],
  },
  {
    key: TOPIC_KEYS.POLICY_LEGISLATION,
    label: "ITS Policy and Legislation",
    questions: [
      {
        id: "doc_policy_presence",
        label: "Which foundational ITS policy or planning documents currently exist?",
        type: "multiselect",
        options: [
          "Vision Zero program",
          "ITS strategic deployment plan",
          "Autonomous vehicle task force",
          "Connected / automated vehicle task force",
          "Regional ITS architecture",
        ],
      },
      {
        id: "doc_legislation_volume",
        label: "How many ITS-relevant legislative documents were reviewed for this update cycle?",
        type: "number",
        placeholder: "e.g. 12",
      },
      {
        id: "doc_legislation_mix",
        label: "What best describes the current legislative environment for ITS deployment?",
        type: "select",
        options: [
          "Mostly restrictive",
          "Mostly neutral",
          "Mixed but leaning supportive",
          "Strongly supportive",
        ],
      },
      {
        id: "doc_legislation_restrictive_count",
        label: "How many evaluated legislative documents were restrictive to ITS deployment?",
        type: "number",
        placeholder: "e.g. 1",
      },
      {
        id: "doc_legislation_neutral_count",
        label: "How many evaluated legislative documents were neutral or not ITS-relevant?",
        type: "number",
        placeholder: "e.g. 4",
      },
      {
        id: "doc_legislation_supportive_count",
        label: "How many evaluated legislative documents were supportive of ITS deployment?",
        type: "number",
        placeholder: "e.g. 3",
      },
      {
        id: "doc_legislation_better_supportive_count",
        label: "How many evaluated legislative documents were better supportive of ITS deployment?",
        type: "number",
        placeholder: "e.g. 2",
      },
      {
        id: "doc_legislation_strong_supportive_count",
        label: "How many evaluated legislative documents were strongly supportive of ITS deployment?",
        type: "number",
        placeholder: "e.g. 2",
      },
      {
        id: "doc_tech_doc_maturity_pct",
        label: "What percentage of evaluated ITS technology areas have clear supporting policy, regulation, or official operational documentation?",
        type: "number",
        placeholder: "Enter 0-100",
      },
      {
        id: "doc_tech_eval_count",
        label: "How many ITS technology areas were evaluated for documentation maturity?",
        type: "number",
        placeholder: "e.g. 10",
      },
    ],
  },
  {
    key: TOPIC_KEYS.PROJECT_PLANNING,
    label: "ITS Project and Planning",
    questions: [
      {
        id: "plan_award_count",
        label: "How many federally recognized ITS-related awards or grants has the agency secured?",
        type: "number",
        placeholder: "e.g. 2",
      },
      {
        id: "plan_award_programs",
        label: "Which funding programs are represented in current ITS awards?",
        type: "multiselect",
        options: [
          "ATCMTD / ATTAIN",
          "SMART",
          "CMAQ",
          "RAISE / BUILD",
          "INFRA",
          "ADS / connected vehicle pilot",
          "Other federal ITS-supportive program",
        ],
      },
      {
        id: "plan_award_funding",
        label: "What is the approximate total funding associated with those ITS awards?",
        type: "text",
        placeholder: "e.g. $8.5M",
      },
      {
        id: "plan_doc_count",
        label: "How many planned ITS projects are identified in current planning documentation?",
        type: "number",
        placeholder: "e.g. 6",
      },
      {
        id: "plan_corridor_miles",
        label: "How many corridor miles are associated with planned ITS deployment?",
        type: "number",
        placeholder: "e.g. 24",
      },
      {
        id: "plan_doc_sources",
        label: "Which planning document sources include ITS initiatives?",
        type: "multiselect",
        options: [
          "Metropolitan transportation plan",
          "Transportation improvement program",
          "Capital improvement program",
          "Regional ITS architecture",
          "Corridor study",
          "Other adopted planning report",
        ],
      },
    ],
  },
  {
    key: TOPIC_KEYS.FACILITY,
    label: "ITS Facility",
    questions: [
      {
        id: "fac_toc_count",
        label: "How many traffic or transportation operations centers support the agency?",
        type: "number",
        placeholder: "e.g. 1",
      },
      {
        id: "fac_om_sites",
        label: "How many ITS operations and maintenance facilities or dedicated support fleets are available?",
        type: "number",
        placeholder: "e.g. 3",
      },
      {
        id: "fac_labs",
        label: "How many ITS laboratories, R&D units, or simulation environments are available?",
        type: "number",
        placeholder: "e.g. 2",
      },
      {
        id: "fac_resource_centers",
        label: "How many ITS research and resource centers or consortia are available?",
        type: "number",
        placeholder: "e.g. 1",
      },
      {
        id: "fac_testbed_presence",
        label: "What kind of ITS testing environment is available?",
        type: "select",
        options: [
          "No dedicated testbed",
          "Closed-course or limited pilot site",
          "Open-road pilot corridor",
          "Both closed and open test environments",
        ],
      },
      {
        id: "fac_testbed_extent",
        label: "If a test corridor exists, what is its approximate instrumented length or coverage?",
        type: "text",
        placeholder: "e.g. 12 corridor miles or 4 intersections",
      },
      {
        id: "fac_staff_support",
        label: "How would you describe current staff and institutional support for ITS operations and maintenance?",
        type: "select",
        options: [
          "Minimal",
          "Adequate for current needs",
          "Strong and scalable",
          "Advanced with dedicated specialty teams",
        ],
      },
    ],
  },
];

export const TOPIC_LABELS = Object.fromEntries(
  TOPIC_DEFINITIONS.map((topic) => [topic.key, topic.label])
);

export const TOPIC_OPTIONS = TOPIC_DEFINITIONS.map((topic) => ({
  key: topic.key,
  label: topic.label,
}));

export const QUESTION_BANK = Object.fromEntries(
  TOPIC_DEFINITIONS.map((topic) => [topic.key, topic.questions])
);

export function getTopicLabel(topicKey) {
  return TOPIC_LABELS[topicKey] || topicKey;
}
