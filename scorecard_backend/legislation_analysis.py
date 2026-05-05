import math
import re
from datetime import datetime


LEGISLATION_CATEGORY_ORDER = [
    "Traffic Safety",
    "Autonomous Vehicle",
    "Infrastructure",
    "Pedestrian/VRU",
    "Data Collection",
]

LEGISLATION_SCORE_LABELS = {
    -1: "Restrictive",
    0: "No Relevant ITS Support",
    1: "Supportive",
    2: "Better Supportive",
    3: "Strongly Supportive",
}

ITS_RELEVANCE_TERMS = (
    "its",
    "intelligent transportation",
    "autonomous",
    "automated",
    "connected vehicle",
    "traffic management",
    "traveler information",
    "incident",
    "signal",
    "pedestrian",
    "bicycle",
    "vru",
    "data",
    "sensor",
    "monitoring",
    "school bus",
    "infrastructure",
    "queue",
    "road weather",
)

CATEGORY_KEYWORDS = {
    "Traffic Safety": (
        "traffic safety",
        "transport safety",
        "safety",
        "crash",
        "collision",
        "incident",
        "emergency",
        "school bus",
        "speed",
        "enforcement",
        "queue",
        "work zone",
        "motorcycle",
        "traffic management",
    ),
    "Autonomous Vehicle": (
        "autonomous",
        "automated",
        "self-driving",
        "driverless",
        "connected vehicle",
        "av ",
        "av_",
        "v2x",
        "v2v",
        "v2i",
    ),
    "Infrastructure": (
        "infrastructure",
        "bridge",
        "roadway",
        "highway",
        "road weather",
        "signal",
        "intersection",
        "corridor",
        "transportation system",
        "transit",
        "fleet",
        "lane",
    ),
    "Pedestrian/VRU": (
        "pedestrian",
        "bike",
        "bicycle",
        "bicyclist",
        "crosswalk",
        "wheelchair",
        "scooter",
        "micromobility",
        "personal conveyance",
        "vulnerable road user",
        "vru",
    ),
    "Data Collection": (
        "data",
        "database",
        "report",
        "reporting",
        "record",
        "records",
        "privacy",
        "telematics",
        "information",
        "monitoring",
        "sensor",
        "analytics",
    ),
}

RESTRICTIVE_PATTERNS = (
    r"\bprohibit(?:s|ed)?\b",
    r"\bban(?:s|ned)?\b",
    r"\bforbid(?:s|den)?\b",
    r"\bmoratorium\b",
    r"\brestrict(?:s|ed|ing)?\b",
    r"\bseverely limits?\b",
    r"\bmay not operate\b",
    r"\bnot authorize(?:d)?\b",
)

ITS_DEPLOYMENT_OBJECTS = (
    "autonomous",
    "automated",
    "driverless",
    "connected vehicle",
    "traffic control signal monitoring",
    "photo monitoring",
    "monitoring system",
    "speed camera",
    "red light camera",
    "event data recorder",
    "data collection",
    "sensor",
    "telematics",
    "deployment",
)

STRONG_SUPPORT_TERMS = (
    "appropriates",
    "appropriation",
    "grant program",
    "funding",
    "funds",
    "establishes",
    "creates",
    "statewide",
    "deployment",
    "implementation",
    "implements",
    "authorizes testing",
    "authorizes operation",
)

BETTER_SUPPORT_TERMS = (
    "requires",
    "requirement",
    "provides",
    "permits",
    "allows",
    "authorizes",
    "pilot program",
    "task force",
    "study",
    "commission",
    "plan",
    "planning",
    "expands",
    "revises",
)


def _combined_text(record):
    return " ".join(
        str(record.get(key) or "")
        for key in ("title", "synopsis", "vehicle_type", "bill_info", "category")
    ).strip().lower()


def _count_hits(text, terms):
    return sum(1 for term in terms if term in text)


def _has_restrictive_phrase(text):
    return any(re.search(pattern, text) for pattern in RESTRICTIVE_PATTERNS)


def _extract_year(date_value):
    if not date_value:
        return None

    try:
        return datetime.fromisoformat(str(date_value).replace("Z", "+00:00")).year
    except ValueError:
        pass

    match = re.search(r"(19|20)\d{2}", str(date_value))
    if match:
        return int(match.group(0))
    return None


def _is_enacted(version):
    version_text = str(version or "").strip().lower()
    return any(term in version_text for term in ("enacted", "signed", "chaptered", "adopted"))


def categorize_legislation(record):
    text = _combined_text(record)
    vehicle_text = str(record.get("vehicle_type") or "").strip().lower()

    category_scores = {}
    for category_name, terms in CATEGORY_KEYWORDS.items():
        category_scores[category_name] = _count_hits(text, terms)

    if "autonomous" in vehicle_text:
        category_scores["Autonomous Vehicle"] += 2
    if any(term in vehicle_text for term in ("pedestrian", "bike", "bicycle")):
        category_scores["Pedestrian/VRU"] += 2
    if any(term in vehicle_text for term in ("traffic", "safety", "incident")):
        category_scores["Traffic Safety"] += 1
    if any(term in vehicle_text for term in ("traveler information", "data")):
        category_scores["Data Collection"] += 1

    best_category = max(
        LEGISLATION_CATEGORY_ORDER,
        key=lambda name: (category_scores.get(name, 0), -LEGISLATION_CATEGORY_ORDER.index(name)),
    )
    return best_category


def score_legislation_support(record):
    text = _combined_text(record)
    relevant = any(term in text for term in ITS_RELEVANCE_TERMS) or "decision:" in text or "variable:" in text

    if not relevant:
        return 0

    if _has_restrictive_phrase(text) and any(
        term in text for term in ITS_DEPLOYMENT_OBJECTS
    ):
        return -1

    strong_hits = _count_hits(text, STRONG_SUPPORT_TERMS)
    better_hits = _count_hits(text, BETTER_SUPPORT_TERMS)
    decision_yes = "decision: yes" in text

    if strong_hits >= 2 or (strong_hits >= 1 and better_hits >= 1):
        return 3
    if strong_hits >= 1 or better_hits >= 2:
        return 2
    if better_hits >= 1 or decision_yes:
        return 1
    return 0


def analyze_legislation_records(records):
    yearly_counts = {}
    enacted_counts = {"Enacted": 0, "Not Enacted": 0}
    topic_counts = {name: 0 for name in LEGISLATION_CATEGORY_ORDER}
    score_counts = {score: 0 for score in (-1, 0, 1, 2, 3)}
    bill_rows = []

    for record in records:
        category = categorize_legislation(record)
        score = score_legislation_support(record)
        normalized_score = (score + 1) / 4
        enacted_label = "Enacted" if _is_enacted(record.get("version")) else "Not Enacted"
        year = _extract_year(record.get("date"))

        if year is not None:
            yearly_counts[year] = yearly_counts.get(year, 0) + 1
        enacted_counts[enacted_label] += 1
        topic_counts[category] += 1
        score_counts[score] += 1

        bill_rows.append(
            {
                "title": record.get("title"),
                "bill_info": record.get("bill_info"),
                "date": record.get("date"),
                "year": year,
                "version": record.get("version"),
                "category": category,
                "score": score,
                "score_label": LEGISLATION_SCORE_LABELS[score],
                "normalized_score": normalized_score,
                "synopsis": record.get("synopsis"),
            }
        )

    bill_rows.sort(key=lambda row: ((row.get("year") or 0), str(row.get("title") or "")), reverse=True)

    total_bills = len(bill_rows)
    average_raw_score = sum(row["score"] for row in bill_rows) / total_bills if total_bills else 0
    unified_score = (
        (average_raw_score ** 2) / (1 + average_raw_score ** 2)
        if total_bills
        else 0
    )

    return {
        "totalBills": total_bills,
        "averageRawScore": average_raw_score,
        "unifiedScore": unified_score,
        "yearlyCounts": [
            {"year": str(year), "count": count}
            for year, count in sorted(yearly_counts.items())
        ],
        "enactedCounts": [
            {"label": label, "count": enacted_counts[label]}
            for label in ("Enacted", "Not Enacted")
        ],
        "topicCounts": [
            {"label": label, "count": topic_counts[label]}
            for label in LEGISLATION_CATEGORY_ORDER
        ],
        "scoreCounts": [
            {"label": LEGISLATION_SCORE_LABELS[score], "score": score, "count": score_counts[score]}
            for score in (-1, 0, 1, 2, 3)
        ],
        "bills": bill_rows,
    }
