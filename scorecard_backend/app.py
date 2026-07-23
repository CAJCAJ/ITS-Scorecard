import csv
import io
import json
import math
import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.utils import secure_filename

from benefit_cost_analysis import compute_benefit_cost_score
from benefit_cost_records import (
    aggregate_long_benefit_cost_records,
    is_long_benefit_cost_record,
    validate_long_benefit_cost_records,
)
from deployment_coverage_analysis import compute_deployment_coverage_score
from expert_review import (
    EXPERT_REVIEW_DOMAINS,
    apply_current_values,
    build_review_items,
    deployment_upload_values,
    get_domain_label,
    legislation_upload_values,
    survey_answer_values,
)
from facility_capacity_analysis import compute_facility_capacity_score
from legislation_analysis import analyze_legislation_records
from planning_analysis import compute_planning_score
from policy_legislation_analysis import compute_policy_legislation_score
from scorecard_processor import analyze_state_data
from supabase_config import create_supabase_client
from survey_scoring import (
    compute_default_values_for_year,
    compute_deployment_coverage_for_year,
    parse_survey_filename,
    parse_survey_workbook,
)

app = Flask(__name__)


def parse_cors_origins():
    raw_origins = os.getenv("CORS_ORIGINS", "").strip()
    if not raw_origins:
        return "*"
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


CORS(app, resources={r"/api/*": {"origins": parse_cors_origins()}})

supabase = create_supabase_client()
PRE_SURVEY_SCHEMA_PATHS = {
    "AM": os.path.join(os.path.dirname(__file__), "data", "pre_survey_2023_am_state_schema.json"),
    "FM": os.path.join(os.path.dirname(__file__), "data", "pre_survey_2023_fm_schema.json"),
    "TM": os.path.join(os.path.dirname(__file__), "data", "pre_survey_2023_tm_schema.json"),
}
PRE_SURVEY_TYPE_LABELS = {
    "AM": "Arterial Management",
    "FM": "Freeway Management",
    "TM": "Transit Management",
}

SURVEY_SCORE_COMPUTERS = {
    "benefit_cost": compute_benefit_cost_score,
    "deployment_coverage": compute_deployment_coverage_score,
    "policy_legislation": compute_policy_legislation_score,
    "project_planning": compute_planning_score,
    "facility": compute_facility_capacity_score,
}

DOCUMENT_CATEGORY_LABELS = {
    "benefit_cost": "ITS Benefit and Cost Data",
    "survey": "ITS Deployment Coverage Data",
    "legislation": "ITS Policy and Legislation Data",
    "planning": "ITS Project Planning Documents",
    "facility": "ITS Facility Documents",
}

STATE_DATASET_MAP = {
    "Texas": "tx_state_data",
    "New Jersey": "nj_state_data",
}

DATASET_STATE_MAP = {value: key for key, value in STATE_DATASET_MAP.items()}

FRONTEND_FIELD_MAP = {
    "title": "Title",
    "bill_info": "Bill Info",
    "author": "Author",
    "version": "Version",
    "date": "Date",
    "vehicle_type": "Vehicle Type",
    "state": "State",
    "synopsis": "Synopsis",
    "category": "Category",
}

COLUMN_ALIASES = {
    "title": "title",
    "billinfo": "bill_info",
    "author": "author",
    "version": "version",
    "date": "date",
    "vehicletype": "vehicle_type",
    "state": "state",
    "synopsis": "synopsis",
    "category": "category",
}


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"})


def normalize_token(value):
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def get_record_value(record, *keys):
    for key in keys:
        if key in record and record[key] not in (None, ""):
            return record[key]
    return None


def clean_value(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except TypeError:
            pass
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def maybe_promote_first_row_to_header(df):
    unnamed_count = sum(
        1 for col in df.columns if str(col).strip().lower().startswith("unnamed")
    )
    if df.empty or unnamed_count < max(1, len(df.columns) // 2):
        return df

    first_row = [str(clean_value(value) or "").strip() for value in df.iloc[0].tolist()]
    if sum(bool(value) for value in first_row) < max(2, len(first_row) // 2):
        return df

    promoted = df.iloc[1:].copy()
    promoted.columns = first_row
    return promoted


def read_tabular_records(filename, content):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "csv":
        df = pd.read_csv(io.BytesIO(content))
    elif ext in ("xlsx", "xls"):
        df = pd.read_excel(io.BytesIO(content))
    else:
        return []

    df = df.dropna(how="all").dropna(axis=1, how="all")
    df = maybe_promote_first_row_to_header(df)
    df = df.dropna(how="all").dropna(axis=1, how="all")

    records = []
    for _, row in df.iterrows():
        record = {}
        for raw_col, raw_value in row.items():
            cleaned = clean_value(raw_value)
            if cleaned is None:
                continue

            column_name = str(raw_col).strip()
            if not column_name or column_name.lower().startswith("unnamed"):
                continue

            canonical_name = COLUMN_ALIASES.get(normalize_token(column_name), column_name)
            record[canonical_name] = cleaned

        if any(value not in (None, "") for value in record.values()):
            records.append(record)

    return records


def extract_keywords_from_records(records):
    if not records:
        return []
    return [str(key).strip() for key in records[0].keys() if str(key).strip()][:8]


def infer_state_dataset(original_name, records):
    normalized_name = normalize_token(os.path.splitext(original_name)[0])
    hints = {
        "tx_state_data": ("Texas", ("txstatedata", "texasstatedata", "texas")),
        "nj_state_data": (
            "New Jersey",
            ("njstatedata", "newjerseystatedata", "newjersey", "newjerseytrafficsafety"),
        ),
    }

    for dataset_key, (state_name, tokens) in hints.items():
        if any(token in normalized_name for token in tokens):
            return state_name, dataset_key

    states_in_rows = {
        str(get_record_value(record, "state", "State")).strip()
        for record in records
        if get_record_value(record, "state", "State")
    }
    states_in_rows = {state for state in states_in_rows if state}

    if len(states_in_rows) == 1:
        state_name = states_in_rows.pop()
        dataset_key = STATE_DATASET_MAP.get(state_name)
        if dataset_key:
            return state_name, dataset_key

    return None, None


def infer_single_state_from_records(records):
    states_in_rows = {
        str(get_record_value(record, "state", "State")).strip()
        for record in records
        if get_record_value(record, "state", "State")
    }
    states_in_rows = {state for state in states_in_rows if state}
    if len(states_in_rows) == 1:
        return next(iter(states_in_rows))
    return None


def to_frontend(record):
    return {
        label: get_record_value(record, key, label)
        for key, label in FRONTEND_FIELD_MAP.items()
    }


def execute_paged_select(table, configure_query=None, page_size=1000):
    rows = []
    page = 0

    while True:
        query = supabase.table(table).select("*")
        if configure_query:
            query = configure_query(query)
        query = query.range(page * page_size, (page + 1) * page_size - 1)
        result = query.execute()
        batch = result.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        page += 1

    return rows


def get_latest_state_documents():
    survey_docs = execute_paged_select(
        "documents",
        lambda query: query.eq("doc_type", "survey").eq("data_kind", "state_dataset").eq("status", "uploaded").order("created_at", desc=True),
    )

    latest = {}
    for doc in survey_docs:
        dataset_key = doc.get("dataset_key")
        if dataset_key and dataset_key not in latest:
            latest[dataset_key] = doc

    return latest


def get_state_document(state_name):
    dataset_key = STATE_DATASET_MAP.get(state_name)
    if not dataset_key:
        return None
    return get_latest_state_documents().get(dataset_key)


def fetch_document_rows(document_id):
    row_entries = execute_paged_select(
        "uploaded_dataset_rows",
        lambda query: query.eq("document_id", document_id).order("row_index"),
    )
    return [entry.get("row_data", {}) for entry in row_entries]


def fetch_state_records(state_name):
    document = get_state_document(state_name)
    if not document:
        return []
    return fetch_document_rows(document["id"])


def fetch_all_state_records():
    state_records = {}
    for state_name, dataset_key in STATE_DATASET_MAP.items():
        document = get_latest_state_documents().get(dataset_key)
        if document:
            state_records[state_name] = fetch_document_rows(document["id"])
    return state_records


def get_legislation_documents_by_state():
    legislation_docs = execute_paged_select(
        "documents",
        lambda query: query.eq("doc_type", "legislation").eq("status", "uploaded").order("created_at", desc=True),
    )

    grouped = {}
    for doc in legislation_docs:
        document_state = doc.get("state")
        if not document_state:
            rows = fetch_document_rows(doc["id"])
            document_state = infer_single_state_from_records(rows)
        if document_state:
            grouped.setdefault(document_state, []).append(doc)
    return grouped


def get_latest_legislation_documents():
    return {
        state_name: documents[0]
        for state_name, documents in get_legislation_documents_by_state().items()
        if documents
    }


def get_legislation_documents(state_name):
    return get_legislation_documents_by_state().get(state_name, [])


def fetch_legislation_records(state_name):
    documents = get_legislation_documents(state_name)
    if not documents:
        return []

    records = []
    for document in documents:
        records.extend(fetch_document_rows(document["id"]))
    return records


def purge_expired_deleted_docs():
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        supabase.table("deleted_docs").delete().lt("deleted_at", cutoff).execute()
    except Exception:
        pass


def format_document_record(record):
    original_name = record.get("original_name") or record.get("filename") or ""
    table_name = os.path.splitext(original_name)[0] if original_name else ""
    doc_type = record.get("doc_type", "")

    formatted = dict(record)
    formatted["table_name"] = table_name
    formatted["category"] = DOCUMENT_CATEGORY_LABELS.get(doc_type, doc_type)
    formatted["status"] = "Uploaded"
    return formatted


def fetch_rows_for_documents(document_ids):
    all_rows = []
    for document_id in document_ids:
        all_rows.extend(
            execute_paged_select(
                "uploaded_dataset_rows",
                lambda query, doc_id=document_id: query.eq("document_id", doc_id).order("row_index"),
            )
        )
    return all_rows


@app.route("/api/states", methods=["GET"])
def get_states():
    return jsonify({"states": list(fetch_all_state_records().keys())})


@app.route("/api/legislation/states", methods=["GET"])
def get_legislation_states():
    return jsonify({"states": list(get_latest_legislation_documents().keys())})


@app.route("/api/data", methods=["GET"])
def get_data():
    state = request.args.get("state")
    records = fetch_state_records(state)
    if not records:
        return jsonify({"error": "State data not found. Upload the state dataset first."}), 404
    return jsonify([to_frontend(record) for record in records])


@app.route("/api/legislation/analysis", methods=["GET"])
def get_legislation_analysis():
    state = str(request.args.get("state", "")).strip()
    analysis_year = str(request.args.get("year", "")).strip()
    if not state:
        return jsonify({"error": "State is required."}), 400

    records = fetch_legislation_records(state)
    if not records:
        return jsonify({"error": "Legislation data not found for the selected state."}), 404

    result = analyze_legislation_records(records, analysis_year or None)
    result["state"] = state
    return jsonify(result)


@app.route("/api/bills", methods=["GET"])
def get_bills():
    state = request.args.get("state", "")
    version = request.args.get("version", "")
    category = request.args.get("category", "")
    vehicle_type = request.args.get("vehicleType", "")
    author = request.args.get("author", "")
    keyword = request.args.get("keyword", "")

    if state:
        records = fetch_state_records(state)
    else:
        records = [record for rows in fetch_all_state_records().values() for record in rows]

    if version:
        records = [
            record
            for record in records
            if str(get_record_value(record, "version", "Version") or "").strip().lower() == version.strip().lower()
        ]
    if category:
        records = [
            record
            for record in records
            if str(get_record_value(record, "category", "Category") or "").strip().lower() == category.strip().lower()
        ]
    if vehicle_type:
        records = [
            record
            for record in records
            if vehicle_type.strip().lower()
            in str(get_record_value(record, "vehicle_type", "Vehicle Type") or "").strip().lower()
        ]
    if author:
        records = [
            record
            for record in records
            if author.strip().lower() in str(get_record_value(record, "author", "Author") or "").lower()
        ]
    if keyword:
        records = [
            record
            for record in records
            if keyword.lower() in str(get_record_value(record, "title", "Title") or "").lower()
            or keyword.lower() in str(get_record_value(record, "synopsis", "Synopsis") or "").lower()
        ]

    return jsonify([to_frontend(record) for record in records])


@app.route("/api/bills/meta", methods=["GET"])
def get_bills_meta():
    all_records = [record for rows in fetch_all_state_records().values() for record in rows]

    states = sorted(
        {
            str(get_record_value(record, "state", "State")).strip()
            for record in all_records
            if get_record_value(record, "state", "State")
        }
    )
    vehicle_types = sorted(
        {
            vehicle_type.strip()
            for record in all_records
            for vehicle_type in str(get_record_value(record, "vehicle_type", "Vehicle Type") or "").split(",")
            if vehicle_type.strip()
        }
    )
    categories = sorted(
        {
            str(get_record_value(record, "category", "Category")).strip()
            for record in all_records
            if get_record_value(record, "category", "Category")
        }
    )

    return jsonify({"states": states, "vehicleTypes": vehicle_types, "categories": categories})


@app.route("/api/state-summary", methods=["GET"])
def get_state_summary():
    summary = []
    for state_name, records in fetch_all_state_records().items():
        total_rows = len(records)
        uploaded_doc = get_state_document(state_name)
        summary.append(
            {
                "state": state_name,
                "total": total_rows,
                "enacted": total_rows,
                "pending": 0,
                "datasetKey": uploaded_doc.get("dataset_key") if uploaded_doc else None,
            }
        )
    return jsonify(summary)


@app.route("/api/yearly-trends", methods=["GET"])
def get_yearly_trends():
    state = request.args.get("state")
    records = fetch_state_records(state)
    if not records:
        return jsonify({"error": "State not found"}), 404

    yearly_trends = {}
    for record in records:
        date_str = str(get_record_value(record, "date", "Date") or "")
        year = date_str[:4]
        if year.isdigit():
            yearly_trends[year] = yearly_trends.get(year, 0) + 1

    return jsonify([{"year": year, "count": count} for year, count in sorted(yearly_trends.items())])


@app.route("/api/top-authors", methods=["GET"])
def get_top_authors():
    state = request.args.get("state")
    records = fetch_state_records(state)
    if not records:
        return jsonify([])

    author_counts = {}
    for record in records:
        for author in str(get_record_value(record, "author", "Author") or "").split(","):
            author = author.strip()
            if author:
                author_counts[author] = author_counts.get(author, 0) + 1

    top_authors = sorted(author_counts.items(), key=lambda item: item[1], reverse=True)[:5]
    return jsonify([{"author": author, "bills": count} for author, count in top_authors])


@app.route("/api/longest-pending-bills", methods=["GET"])
def get_longest_pending_bills():
    state = request.args.get("state")
    records = fetch_state_records(state)
    if not records:
        return jsonify([])
    return jsonify([to_frontend(record) for record in records[:5]])


@app.route("/api/state-vehicle-types", methods=["GET"])
def get_state_vehicle_types():
    summary = {}
    for state_name, records in fetch_all_state_records().items():
        vehicle_types = set()
        for record in records:
            vehicle_text = str(get_record_value(record, "vehicle_type", "Vehicle Type") or "")
            vehicle_types.update(value.strip() for value in vehicle_text.split(",") if value.strip())
        summary[state_name] = {"totalVehicleTypes": len(vehicle_types)}
    return jsonify(summary)


@app.route("/api/state-scorecards", methods=["GET"])
def get_state_scorecards():
    results = {}
    for state_name, records in fetch_all_state_records().items():
        try:
            results[state_name] = analyze_state_data(records)
        except Exception as exc:
            results[state_name] = {"error": str(exc)}
    return jsonify(results)


@app.route("/api/deployment/default-values", methods=["GET"])
def get_deployment_default_values():
    try:
        survey_year = str(request.args.get("year", "")).strip()
        state_name = str(request.args.get("state", "")).strip()

        if not survey_year or not state_name:
            return jsonify({"error": "Both year and state are required."}), 400
        if state_name not in {"Texas", "New Jersey"}:
            return jsonify({"error": "State must be Texas or New Jersey."}), 400

        survey_documents = execute_paged_select(
            "documents",
            lambda query: query.eq("doc_type", "survey")
            .eq("data_kind", "survey_workbook")
            .eq("survey_year", survey_year)
            .eq("status", "uploaded")
            .order("created_at", desc=True),
        )

        if not survey_documents:
            return jsonify({"items": [], "message": f"No Data Found for Year {survey_year}"}), 200

        uploaded_rows = fetch_rows_for_documents([doc["id"] for doc in survey_documents])
        result = compute_deployment_coverage_for_year(
            survey_documents, uploaded_rows, state_name
        )
        result["source_documents"] = [
            format_document_record(document) for document in survey_documents
        ]
        if not result.get("items"):
            return jsonify({"items": [], "message": f"No Data Found for Year {survey_year}"}), 200

        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": f"Could not load deployment default values: {str(exc)}"}), 500


@app.route("/api/benefit-cost/score", methods=["GET", "POST"])
def get_benefit_cost_score():
    try:
        if request.method == "GET":
            state_name = str(request.args.get("state", "")).strip()
            survey_year = str(request.args.get("year", "")).strip()
            if not state_name or not survey_year:
                return jsonify({"error": "Both state and year are required."}), 400

            benefit_cost_record, document = find_latest_benefit_cost_record(
                state_name, survey_year
            )
            if benefit_cost_record:
                answers = benefit_cost_record_to_answers(benefit_cost_record)
                result = compute_benefit_cost_score(answers)
                result["source"] = "Calculated from Upload"
                result["state"] = state_name
                result["survey_year"] = survey_year
                result["dataset_version"] = get_record_value(
                    benefit_cost_record, "dataset_version", "Dataset Version"
                )
                result["evidence_level"] = get_record_value(
                    benefit_cost_record, "evidence_level", "Evidence Level"
                )
                result["benefit_source_urls"] = get_record_value(
                    benefit_cost_record, "benefit_source_urls", "Benefit Source URLs"
                )
                result["cost_source_urls"] = get_record_value(
                    benefit_cost_record, "cost_source_urls", "Cost Source URLs"
                )
                result["conversion_basis"] = get_record_value(
                    benefit_cost_record, "conversion_basis", "Conversion Basis"
                )
                result["source_notes"] = get_record_value(
                    benefit_cost_record, "source_notes", "Source Notes"
                )
                component_details = benefit_cost_record.get("_component_details", [])
                result["component_details"] = component_details
                result["technologies_considered"] = benefit_cost_record.get(
                    "_technologies_considered", []
                )
                result["provenance_counts"] = benefit_cost_record.get(
                    "_provenance_counts", {}
                )
                result["review_required"] = benefit_cost_record.get(
                    "_review_required", False
                )
                result["review_component_keys"] = benefit_cost_record.get(
                    "_review_component_keys", []
                )
                detail_by_key = {
                    detail.get("component_key"): detail for detail in component_details
                }
                for breakdown_item in result.get("breakdown", []):
                    detail = detail_by_key.get(breakdown_item.get("component_key"))
                    if detail:
                        breakdown_item["source_detail"] = detail
                result["document_id"] = document.get("id") if document else None
                return jsonify(result)

            submission, answers = fetch_latest_survey_update(
                "benefit_cost", state_name, survey_year
            )
            if answers:
                result = compute_benefit_cost_score(answers)
                result["source"] = "Calculated from Survey-Based Updates"
                result["state"] = state_name
                result["survey_year"] = survey_year
                result["submission_id"] = submission.get("id") if submission else None
                return jsonify(result)

            result = compute_benefit_cost_score({})
            result["source"] = "No Value Available"
            result["state"] = state_name
            result["survey_year"] = survey_year
            return jsonify(result)

        payload = request.get_json(silent=True) or {}
        answers = payload.get("answers", {}) if isinstance(payload, dict) else {}
        result = compute_benefit_cost_score(answers if isinstance(answers, dict) else {})
        result["source"] = "Provided Answers"
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": f"Could not calculate benefit/cost score: {str(exc)}"}), 500


@app.route("/api/survey-scores/<topic_key>", methods=["POST"])
def get_survey_score(topic_key):
    try:
        scorer = SURVEY_SCORE_COMPUTERS.get(topic_key)
        if not scorer:
            return jsonify({"error": "Unknown survey scoring topic."}), 404

        payload = request.get_json(silent=True) or {}
        answers = payload.get("answers", {}) if isinstance(payload, dict) else {}
        result = scorer(answers if isinstance(answers, dict) else {})
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": f"Could not calculate survey score: {str(exc)}"}), 500


def normalize_answer_for_storage(value):
    if isinstance(value, (list, dict)):
        return {"answer_text": None, "answer_number": None, "answer_json": value}

    text_value = "" if value is None else str(value).strip()
    number_value = None
    if text_value:
        try:
            number_value = float(text_value.replace(",", ""))
        except ValueError:
            number_value = None

    return {
        "answer_text": text_value,
        "answer_number": number_value,
        "answer_json": None,
    }


def normalize_pre_survey_type(value):
    survey_type = str(value or "AM").strip().upper()
    return survey_type if survey_type in PRE_SURVEY_SCHEMA_PATHS else "AM"


def load_pre_survey_schema(survey_type="AM"):
    normalized_type = normalize_pre_survey_type(survey_type)
    with open(PRE_SURVEY_SCHEMA_PATHS[normalized_type], "r", encoding="utf-8") as schema_file:
        schema = json.load(schema_file)
    schema["surveyType"] = normalized_type
    schema["surveyTypeLabel"] = PRE_SURVEY_TYPE_LABELS.get(
        normalized_type, schema.get("surveyTypeLabel", normalized_type)
    )
    schema["surveyTypeOptions"] = [
        {"value": key, "label": label} for key, label in PRE_SURVEY_TYPE_LABELS.items()
    ]
    return schema


def safe_csv_filename_part(value):
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in str(value or "").strip())
    cleaned = "_".join(part for part in cleaned.split("_") if part)
    return cleaned or "Agency"


def build_pre_survey_csv(schema, survey_year, agency_name, state_name, answers):
    columns = [
        "SurveyYear",
        "SurveyType",
        "AgencyName",
        "State",
        *schema.get("variables", []),
    ]
    row = {
        "SurveyYear": survey_year,
        "SurveyType": schema.get("surveyType", "AM"),
        "AgencyName": agency_name,
        "State": state_name,
    }
    for variable in schema.get("variables", []):
        value = answers.get(variable, "")
        if isinstance(value, (list, dict)):
            row[variable] = json.dumps(value, ensure_ascii=False)
        else:
            row[variable] = "" if value is None else str(value)

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    writer.writerow(row)
    return buffer.getvalue(), len(columns)


@app.route("/api/pre-survey/schema", methods=["GET"])
def get_pre_survey_schema():
    try:
        survey_type = normalize_pre_survey_type(request.args.get("survey_type"))
        return jsonify(load_pre_survey_schema(survey_type))
    except Exception as exc:
        return jsonify({"error": f"Could not load pre-survey schema: {str(exc)}"}), 500


@app.route("/api/pre-survey/submissions", methods=["POST"])
def save_pre_survey_submission():
    try:
        payload = request.get_json(silent=True) or {}
        survey_year = str(payload.get("survey_year") or "").strip()
        survey_type = normalize_pre_survey_type(payload.get("survey_type"))
        agency_name = str(payload.get("agency_name") or "").strip()
        state_name = str(payload.get("state") or "").strip()
        answers = payload.get("answers", {})

        schema = load_pre_survey_schema(survey_type)
        if survey_year not in set(schema.get("yearOptions", [])):
            return jsonify({"error": "Survey year must be 2024 or 2025."}), 400
        if not agency_name:
            return jsonify({"error": "Agency name is required."}), 400
        if not state_name:
            return jsonify({"error": "State is required from the current login session."}), 400
        if not isinstance(answers, dict):
            return jsonify({"error": "Answers must be an object keyed by survey variable."}), 400

        csv_content, column_count = build_pre_survey_csv(
            schema, survey_year, agency_name, state_name, answers
        )
        csv_filename = (
            f"{survey_year}_{safe_csv_filename_part(agency_name)}_"
            f"{schema.get('surveyType', survey_type)}_Pre_Survey.csv"
        )
        now = datetime.now(timezone.utc).isoformat()
        submission_row = {
            "id": str(uuid.uuid4()),
            "csv_filename": csv_filename,
            "state": state_name,
            "survey_year": survey_year,
            "agency_name": agency_name,
            "survey_type": schema.get("surveyType", survey_type),
            "agency_scope": schema.get("agencyScope", "State"),
            "source_workbook": schema.get("sourceWorkbook", "2023_AM_State_data.xlsx"),
            "csv_content": csv_content,
            "answers_json": answers,
            "status": "submitted",
            "created_at": now,
            "updated_at": now,
        }
        supabase.table("pre_survey_submissions").insert(submission_row).execute()

        return jsonify(
            {
                "message": "Pre-survey saved",
                "submission": submission_row,
                "csv_filename": csv_filename,
                "variable_count": len(schema.get("variables", [])),
                "column_count": column_count,
            }
        ), 201
    except Exception as exc:
        return jsonify({"error": f"Could not save pre-survey: {str(exc)}"}), 500


def fetch_latest_survey_update(topic_key, state_name, survey_year):
    try:
        result = (
            supabase.table("survey_update_submissions")
            .select("*")
            .eq("topic_key", topic_key)
            .eq("state", state_name)
            .eq("survey_year", str(survey_year))
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception:
        return None, {}
    if not result.data:
        return None, {}

    submission = result.data[0]
    try:
        answers_result = (
            supabase.table("survey_update_answers")
            .select("*")
            .eq("submission_id", submission["id"])
            .execute()
        )
    except Exception:
        return submission, {}

    answers = {}
    for row in answers_result.data or []:
        value = row.get("answer_json")
        if value is None and row.get("answer_text") not in (None, ""):
            value = row.get("answer_text")
        if value is None and row.get("answer_number") is not None:
            value = row.get("answer_number")
        answers[row.get("question_id")] = value

    return submission, answers


@app.route("/api/survey-updates/submissions/latest", methods=["GET"])
def get_latest_survey_update_submission():
    try:
        topic_key = str(request.args.get("topic_key", "")).strip()
        state_name = str(request.args.get("state", "")).strip()
        survey_year = str(request.args.get("year", "")).strip()

        if not topic_key or not state_name or not survey_year:
            return jsonify({"error": "topic_key, state, and year are required."}), 400

        submission, answers = fetch_latest_survey_update(topic_key, state_name, survey_year)
        return jsonify({"submission": submission, "answers": answers})
    except Exception as exc:
        return jsonify({"error": f"Could not load survey update answers: {str(exc)}"}), 500


@app.route("/api/survey-updates/submissions", methods=["POST"])
def save_survey_update_submission():
    try:
        payload = request.get_json(silent=True) or {}
        topic_key = str(payload.get("topic_key") or "").strip()
        topic_label = str(payload.get("topic_label") or "").strip()
        state_name = str(payload.get("state") or "").strip()
        survey_year = str(payload.get("survey_year") or "").strip()
        respondent_name = str(payload.get("respondent_name") or "").strip()
        answers = payload.get("answers", {})

        if not topic_key or topic_key not in SURVEY_SCORE_COMPUTERS:
            return jsonify({"error": "Unknown survey update topic."}), 400
        if not state_name or not survey_year:
            return jsonify({"error": "State and year are required."}), 400
        if not isinstance(answers, dict):
            return jsonify({"error": "Answers must be an object."}), 400

        now = datetime.now(timezone.utc).isoformat()
        submission_id = str(uuid.uuid4())
        submission_row = {
            "id": submission_id,
            "topic_key": topic_key,
            "topic_label": topic_label or get_domain_label(topic_key) or topic_key,
            "state": state_name,
            "survey_year": survey_year,
            "respondent_name": respondent_name,
            "status": "submitted",
            "created_at": now,
            "updated_at": now,
        }
        supabase.table("survey_update_submissions").insert(submission_row).execute()

        answer_rows = []
        for question_id, value in answers.items():
            stored = normalize_answer_for_storage(value)
            if (
                stored["answer_text"] in (None, "")
                and stored["answer_number"] is None
                and stored["answer_json"] in (None, [], {})
            ):
                continue
            answer_rows.append(
                {
                    "submission_id": submission_id,
                    "question_id": str(question_id),
                    **stored,
                }
            )

        if answer_rows:
            supabase.table("survey_update_answers").insert(answer_rows).execute()

        return jsonify(
            {
                "message": "Survey update answers saved",
                "submission": submission_row,
                "answer_count": len(answer_rows),
            }
        ), 201
    except Exception as exc:
        return jsonify({"error": f"Could not save survey update answers: {str(exc)}"}), 500


def get_uploaded_review_values(domain_key, state_name, survey_year):
    if domain_key == "benefit_cost":
        benefit_cost_record, _ = find_latest_benefit_cost_record(state_name, survey_year)
        if not benefit_cost_record:
            return {}
        answers = benefit_cost_record_to_answers(benefit_cost_record)
        return add_review_scores(domain_key, {
            "existing_mobility_benefit": {
                "current_value": str(get_record_value(benefit_cost_record, "bc_existing_mobility_benefit") or ""),
                "source_basis": "Calculated from Upload",
            },
            "existing_safety_benefit": {
                "current_value": str(get_record_value(benefit_cost_record, "bc_existing_safety_benefit") or ""),
                "source_basis": "Calculated from Upload",
            },
            "existing_environment_benefit": {
                "current_value": str(get_record_value(benefit_cost_record, "bc_existing_environment_benefit") or ""),
                "source_basis": "Calculated from Upload",
            },
            "new_mobility_benefit": {
                "current_value": str(get_record_value(benefit_cost_record, "bc_new_mobility_benefit") or ""),
                "source_basis": "Calculated from Upload",
            },
            "new_safety_benefit": {
                "current_value": str(get_record_value(benefit_cost_record, "bc_new_safety_benefit") or ""),
                "source_basis": "Calculated from Upload",
            },
            "new_environment_benefit": {
                "current_value": str(get_record_value(benefit_cost_record, "bc_new_environment_benefit") or ""),
                "source_basis": "Calculated from Upload",
            },
            "existing_om_cost": {
                "current_value": str(get_record_value(benefit_cost_record, "bc_existing_om_cost_total") or ""),
                "source_basis": "Calculated from Upload",
            },
            "new_deployment_cost": {
                "current_value": str(get_record_value(benefit_cost_record, "bc_new_cost_total") or ""),
                "source_basis": "Calculated from Upload",
            },
        }, answers)

    if domain_key == "deployment_coverage":
        survey_documents = execute_paged_select(
            "documents",
            lambda query: query.eq("doc_type", "survey")
            .eq("data_kind", "survey_workbook")
            .eq("survey_year", str(survey_year))
            .eq("status", "uploaded")
            .order("created_at", desc=True),
        )
        if not survey_documents:
            return {}
        uploaded_rows = fetch_rows_for_documents([doc["id"] for doc in survey_documents])
        default_values = compute_default_values_for_year(survey_documents, uploaded_rows, state_name)
        return deployment_upload_values(default_values)

    if domain_key == "policy_legislation":
        records = fetch_legislation_records(state_name)
        if not records:
            return {}
        return legislation_upload_values(analyze_legislation_records(records, survey_year))

    if domain_key == "project_planning":
        planning_record, _ = find_latest_planning_record(state_name, survey_year)
        if not planning_record:
            return {}
        answers = planning_record_to_answers(planning_record)
        return add_review_scores(domain_key, {
            "federal_awards": {
                "current_value": str(get_record_value(planning_record, "plan_award_count") or ""),
                "source_basis": "Calculated from Upload",
            },
            "award_funding": {
                "current_value": str(get_record_value(planning_record, "plan_award_funding") or ""),
                "source_basis": "Calculated from Upload",
            },
            "planned_projects": {
                "current_value": str(get_record_value(planning_record, "plan_doc_count") or ""),
                "source_basis": "Calculated from Upload",
            },
            "planned_corridor_miles": {
                "current_value": str(get_record_value(planning_record, "plan_corridor_miles") or ""),
                "source_basis": "Calculated from Upload",
            },
        }, answers)

    if domain_key == "facility":
        facility_record, _ = find_latest_facility_record(state_name, survey_year)
        if not facility_record:
            return {}
        answers = facility_record_to_answers(facility_record)
        testbed_parts = [
            str(get_record_value(facility_record, "fac_testbed_presence", "Facility Testbed Presence") or "").strip(),
            str(get_record_value(facility_record, "fac_testbed_extent", "Facility Testbed Extent") or "").strip(),
        ]
        return add_review_scores(domain_key, {
            "operations_centers": {
                "current_value": str(
                    get_record_value(facility_record, "fac_toc_count", "Facility TOC Count") or ""
                ),
                "source_basis": "Calculated from Upload",
            },
            "om_facilities_fleets": {
                "current_value": str(
                    get_record_value(facility_record, "fac_om_sites", "Facility O&M Sites") or ""
                ),
                "source_basis": "Calculated from Upload",
            },
            "labs_rd_units": {
                "current_value": str(
                    get_record_value(facility_record, "fac_labs", "Facility Labs") or ""
                ),
                "source_basis": "Calculated from Upload",
            },
            "resource_centers": {
                "current_value": str(
                    get_record_value(
                        facility_record,
                        "fac_resource_centers",
                        "Facility Resource Centers",
                    )
                    or ""
                ),
                "source_basis": "Calculated from Upload",
            },
            "testbeds_pilot_corridors": {
                "current_value": " | ".join(part for part in testbed_parts if part),
                "source_basis": "Calculated from Upload",
            },
        }, answers)

    return {}


def format_review_score(value):
    if value is None:
        return ""
    try:
        return f"{float(value):.3f}"
    except (TypeError, ValueError):
        return str(value or "")


def get_breakdown_value(score_result, label):
    for item in score_result.get("breakdown", []):
        if item.get("label") == label:
            return item.get("weighted_value")
    return None


def add_planning_review_scores(values_by_key, answers):
    score_result = compute_planning_score(answers)
    score_labels = {
        "federal_awards": "Federally Recognized Grants",
        "award_funding": "Award Funding",
        "planned_projects": "Planned ITS Projects",
        "planned_corridor_miles": "Planned Corridor Miles",
    }
    for subaspect_key, label in score_labels.items():
        if subaspect_key in values_by_key:
            values_by_key[subaspect_key]["unified_score"] = format_review_score(
                get_breakdown_value(score_result, label)
            )
    return values_by_key


def add_facility_review_scores(values_by_key, answers):
    score_result = compute_facility_capacity_score(answers)
    score_labels = {
        "operations_centers": ["Traffic Operations Centers"],
        "om_facilities_fleets": ["ITS O&M Facilities / Fleets"],
        "labs_rd_units": ["ITS Labs / R&D Units"],
        "resource_centers": ["ITS Resource Centers / Consortia"],
        "testbeds_pilot_corridors": ["Testbed Availability", "Testbed Extent Bonus"],
    }
    for subaspect_key, labels in score_labels.items():
        if subaspect_key not in values_by_key:
            continue
        total_score = sum(
            float(get_breakdown_value(score_result, label) or 0.0) for label in labels
        )
        values_by_key[subaspect_key]["unified_score"] = format_review_score(total_score)
    return values_by_key


def add_review_scores(domain_key, values_by_key, answers):
    if domain_key == "benefit_cost":
        score_result = compute_benefit_cost_score(answers)
        score_labels = {
            "existing_mobility_benefit": "Existing Mobility Benefit",
            "existing_safety_benefit": "Existing Safety Benefit",
            "existing_environment_benefit": "Existing Environmental Benefit",
            "new_mobility_benefit": "New Mobility Benefit",
            "new_safety_benefit": "New Safety Benefit",
            "new_environment_benefit": "New Environmental Benefit",
            "existing_om_cost": "Existing ITS O&M Cost",
            "new_deployment_cost": "New ITS Deployment Cost",
        }
        for subaspect_key, label in score_labels.items():
            if subaspect_key in values_by_key:
                values_by_key[subaspect_key]["unified_score"] = format_review_score(
                    get_breakdown_value(score_result, label)
                )
        return values_by_key

    if domain_key == "deployment_coverage":
        score_result = compute_deployment_coverage_score(answers)
        for item in score_result.get("breakdown", []):
            subaspect_key = None
            for domain_name, key in {
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
            }.items():
                if item.get("label") == domain_name:
                    subaspect_key = key
                    break
            if subaspect_key in values_by_key:
                values_by_key[subaspect_key]["unified_score"] = format_review_score(
                    item.get("weighted_value")
                )
        return values_by_key

    if domain_key == "policy_legislation":
        score_result = compute_policy_legislation_score(answers)
        score_labels = {
            "policy_document_presence": "Foundational Policy Documents",
            "legislative_support": "Legislative Support",
            "technology_documentation_maturity": "Technology Documentation Maturity",
        }
        for subaspect_key, label in score_labels.items():
            if subaspect_key in values_by_key:
                values_by_key[subaspect_key]["unified_score"] = format_review_score(
                    get_breakdown_value(score_result, label)
                )
        return values_by_key

    if domain_key == "project_planning":
        return add_planning_review_scores(values_by_key, answers)
    if domain_key == "facility":
        return add_facility_review_scores(values_by_key, answers)
    return values_by_key


def split_semicolon_values(value):
    if isinstance(value, list):
        return value
    text = str(value or "").strip()
    if not text:
        return []
    return [part.strip() for part in text.split(";") if part.strip()]


def benefit_cost_record_to_answers(record):
    return {
        "bc_eval_year": get_record_value(record, "survey_year", "Survey Year"),
        "bc_existing_mobility_benefit": get_record_value(
            record, "bc_existing_mobility_benefit", "Existing Mobility Benefit"
        ),
        "bc_existing_safety_benefit": get_record_value(
            record, "bc_existing_safety_benefit", "Existing Safety Benefit"
        ),
        "bc_existing_environment_benefit": get_record_value(
            record,
            "bc_existing_environment_benefit",
            "Existing Environmental Benefit",
        ),
        "bc_new_mobility_benefit": get_record_value(
            record, "bc_new_mobility_benefit", "New Mobility Benefit"
        ),
        "bc_new_safety_benefit": get_record_value(
            record, "bc_new_safety_benefit", "New Safety Benefit"
        ),
        "bc_new_environment_benefit": get_record_value(
            record, "bc_new_environment_benefit", "New Environmental Benefit"
        ),
        "bc_existing_om_cost_total": get_record_value(
            record, "bc_existing_om_cost_total", "Existing O&M Cost Total"
        ),
        "bc_new_cost_total": get_record_value(
            record, "bc_new_cost_total", "New Cost Total"
        ),
    }


def planning_record_to_answers(record):
    return {
        "plan_award_count": get_record_value(record, "plan_award_count", "Plan Award Count"),
        "plan_award_programs": split_semicolon_values(
            get_record_value(record, "plan_award_programs", "Plan Award Programs")
        ),
        "plan_award_funding": get_record_value(record, "plan_award_funding", "Plan Award Funding"),
        "plan_doc_count": get_record_value(record, "plan_doc_count", "Plan Doc Count"),
        "plan_corridor_miles": get_record_value(record, "plan_corridor_miles", "Plan Corridor Miles"),
        "plan_doc_sources": split_semicolon_values(
            get_record_value(record, "plan_doc_sources", "Plan Doc Sources")
        ),
    }


def get_award_name(record):
    return get_record_value(record, "Award Name", "award_name", "award_title", "Award Title")


def get_award_program(record):
    return get_record_value(record, "award_program", "Award Program", "program", "Program")


def get_award_amount(record):
    return get_record_value(record, "award_amount", "Award Amount", "amount", "Amount")


def get_award_recipient(record):
    return get_record_value(
        record,
        "award_recipient",
        "Award Recipient",
        "award_agency",
        "Award Agency",
        "recipient",
        "Recipient",
    )


def get_award_project(record):
    return get_record_value(
        record,
        "award_project",
        "Award Project",
        "project_title",
        "Project Title",
        "project",
        "Project",
    )


def is_planning_baseline_record(record):
    record_type = str(get_record_value(record, "record_type", "Record Type") or "").lower()
    return record_type == "planning_baseline"


def is_planning_award_record(record):
    if is_planning_baseline_record(record):
        return False
    record_type = str(get_record_value(record, "record_type", "Record Type") or "").lower()
    if record_type == "award":
        return True
    return bool(get_award_name(record) or get_award_program(record) or parse_money_value(get_award_amount(record)) > 0)


def max_numeric_record_value(records, *keys):
    values = [parse_money_value(get_record_value(record, *keys)) for record in records]
    return max(values) if values else 0.0


def aggregate_planning_award_records(records):
    award_rows = [record for record in records if is_planning_award_record(record)]
    programs = []
    recipients = []
    projects = []
    source_values = []
    source_notes = []
    evidence_levels = []
    total_funding = 0.0

    for record in award_rows:
        program = str(get_award_program(record) or "").strip()
        recipient = str(get_award_recipient(record) or "").strip()
        project = str(get_award_project(record) or get_award_name(record) or "").strip()
        source_url = get_record_value(record, "source_url", "Source URL", "source_urls", "Source URLs")
        note = get_record_value(record, "source_notes", "Source Notes")
        evidence = get_record_value(record, "evidence_level", "Evidence Level")

        if program and program not in programs:
            programs.append(program)
        if recipient and recipient not in recipients:
            recipients.append(recipient)
        if project and project not in projects:
            projects.append(project)
        if source_url:
            source_values.append(source_url)
        if note:
            source_notes.append(note)
        if evidence and evidence not in evidence_levels:
            evidence_levels.append(evidence)
        total_funding += parse_money_value(get_award_amount(record))

    merged = {}
    if records:
        merged.update(records[0])
    merged["dataset_version"] = get_record_value(
        merged, "dataset_version", "Dataset Version"
    ) or "Planning_Analysis_Default"
    merged["plan_award_count"] = len(award_rows)
    merged["plan_award_programs"] = "; ".join(programs)
    merged["plan_award_funding"] = round(total_funding, 2)
    merged["award_recipients"] = "; ".join(recipients)
    merged["award_projects"] = "; ".join(projects)
    merged["plan_doc_count"] = max_numeric_record_value(records, "plan_doc_count", "Plan Doc Count")
    merged["plan_corridor_miles"] = max_numeric_record_value(
        records, "plan_corridor_miles", "Plan Corridor Miles"
    )
    merged["plan_doc_sources"] = combine_planning_metadata(
        None,
        [
            get_record_value(record, "plan_doc_sources", "Plan Doc Sources")
            for record in records
            if get_record_value(record, "plan_doc_sources", "Plan Doc Sources")
        ],
    )
    merged["source_notes"] = combine_planning_metadata(None, source_notes)
    merged["source_urls"] = combine_planning_metadata(None, source_values)
    merged["evidence_level"] = "; ".join(evidence_levels) or get_record_value(
        merged, "evidence_level", "Evidence Level"
    )
    merged["_planning_award_rows"] = award_rows
    return merged


def parse_money_value(value):
    text = str(value or "").strip()
    if not text:
        return 0.0
    cleaned = re.sub(r"[^0-9.\-]", "", text.replace(",", ""))
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def infer_funding_level(program, source_notes):
    text = f"{program or ''} {source_notes or ''}".lower()
    if any(token in text for token in ("fhwa", "usdot", "federal", "smart", "atcmtd", "attain", "ss4a")):
        return "Federal"
    if any(token in text for token in ("state", "njdot", "department of transportation")):
        return "State"
    if any(token in text for token in ("local", "county", "municipal", "city", "township", "borough")):
        return "Local"
    return "Unspecified"


def infer_award_duration(record, program):
    for key in ("award_duration", "Award Duration", "duration", "Duration"):
        value = get_record_value(record, key)
        if value:
            return simplify_award_duration(value)

    program_text = str(program or "").upper()
    if program_text in {"SMART", "SS4A"}:
        return "1 year"
    if program_text in {"ATCMTD", "ATTAIN"}:
        return "multi-year"
    return "Not specified"


def simplify_award_duration(value):
    text = str(value or "").strip()
    if not text:
        return "Not specified"
    month_match = re.search(r"(\d+(?:\.\d+)?)\s*months?", text, re.IGNORECASE)
    if month_match:
        amount = month_match.group(1)
        unit = "month" if amount == "1" else "months"
        return f"{amount} {unit}"
    year_match = re.search(r"(\d+(?:\.\d+)?)\s*years?", text, re.IGNORECASE)
    if year_match:
        amount = year_match.group(1)
        unit = "year" if amount == "1" else "years"
        return f"{amount} {unit}"
    if "multi" in text.lower():
        return "multi-year"
    return text.split(",")[0].split("-")[0].strip() or "Not specified"


def duration_score(duration):
    text = str(duration or "").lower()
    number_match = re.search(r"(\d+(?:\.\d+)?)", text)
    if number_match:
        years = float(number_match.group(1))
        return min(1.0, years / 5.0)
    if "multi" in text or "deployment" in text:
        return 0.7
    if "planning" in text or "demo" in text or "1 year" in text:
        return 0.3
    return 0.2


def funding_level_score(level):
    normalized = str(level or "").strip().lower()
    if normalized == "federal":
        return 1.0
    if normalized == "state":
        return 0.7
    if normalized == "local":
        return 0.45
    return 0.35


def amount_score(amount):
    value = max(0.0, float(amount or 0.0))
    if value <= 0:
        return 0.0
    return min(1.0, math.log1p(value) / math.log1p(25_000_000))


def award_contribution_score(level, amount, duration):
    score = (
        0.45 * funding_level_score(level)
        + 0.40 * amount_score(amount)
        + 0.15 * duration_score(duration)
    )
    return round(min(1.0, max(0.0, score)), 6)


def planning_award_score_total(record):
    try:
        result = compute_planning_score(planning_record_to_answers(record))
        return float(result.get("award_score") or 0.0)
    except Exception:
        return 0.0


def normalize_award_detail_contributions(details, target_total):
    if not details:
        return details
    target_total = round(max(0.0, float(target_total or 0.0)), 6)
    raw_total = sum(float(detail.get("_raw_contribution_weight") or 0.0) for detail in details)
    if raw_total <= 0 or target_total <= 0:
        for detail in details:
            detail["unified_score_contribution"] = 0.0
            detail.pop("_raw_contribution_weight", None)
        return details

    running_total = 0.0
    for index, detail in enumerate(details):
        raw_weight = float(detail.get("_raw_contribution_weight") or 0.0)
        if index == len(details) - 1:
            contribution = round(max(0.0, target_total - running_total), 6)
        else:
            contribution = round(target_total * raw_weight / raw_total, 6)
            running_total = round(running_total + contribution, 6)
        detail["unified_score_contribution"] = contribution
        detail.pop("_raw_contribution_weight", None)
    return details


def split_equal_length_parts(value, fallback_count=1):
    parts = split_semicolon_values(value)
    if parts:
        return parts
    return [""] * max(1, int(fallback_count or 1))


def build_planning_award_details(record):
    award_rows = record.get("_planning_award_rows") if isinstance(record, dict) else None
    if award_rows:
        details = []
        for award_record in award_rows:
            program = get_award_program(award_record)
            amount = parse_money_value(get_award_amount(award_record))
            level = get_record_value(
                award_record, "funding_level", "Funding Level"
            ) or infer_funding_level(program, get_record_value(award_record, "source_notes", "Source Notes"))
            duration = infer_award_duration(award_record, program)
            title = get_award_name(award_record) or get_award_project(award_record)
            recipient = get_award_recipient(award_record)
            details.append(
                {
                    "funding_name": str(program or "").strip() or "Award Funding",
                    "awarded_project": program_funding_title(program, title),
                    "awarded_agency": program_award_agency(program, recipient),
                    "funding_level": level,
                    "amount": round(amount, 2),
                    "duration": duration,
                    "_raw_contribution_weight": award_contribution_score(
                        level, amount, duration
                    ),
                }
            )
        return normalize_award_detail_contributions(
            details, planning_award_score_total(record)
        )

    award_count = int(parse_money_value(get_record_value(record, "plan_award_count", "Plan Award Count")) or 0)
    if award_count <= 0:
        return []
    total_funding = parse_money_value(
        get_record_value(record, "plan_award_funding", "Plan Award Funding")
    )
    programs = split_equal_length_parts(
        get_record_value(record, "plan_award_programs", "Plan Award Programs"),
        award_count,
    )
    recipients = split_equal_length_parts(
        get_record_value(record, "award_recipients", "Award Recipients"),
        len(programs),
    )
    projects = split_equal_length_parts(
        get_record_value(record, "award_projects", "Award Projects"),
        len(programs),
    )
    source_notes = get_record_value(record, "source_notes", "Source Notes")
    program_amounts = parse_program_amounts(source_notes)

    detail_count = max(len(programs), len(recipients), len(projects), 1 if award_count else 0)
    if detail_count == 0:
        return []

    amount_per_detail = total_funding / detail_count if detail_count else 0.0
    details = []
    for index in range(detail_count):
        program = programs[index] if index < len(programs) else programs[-1]
        recipient = recipients[index] if index < len(recipients) else recipients[-1]
        project = projects[index] if index < len(projects) else projects[-1]
        level = infer_funding_level(program, source_notes)
        duration = infer_award_duration(record, program)
        amount = program_amounts.get(str(program or "").upper(), amount_per_detail)
        details.append(
            {
                "funding_name": str(program or "").strip() or "Award Funding",
                "awarded_project": program_funding_title(program, project),
                "awarded_agency": program_award_agency(program, recipient),
                "funding_level": level,
                "amount": round(amount, 2),
                "duration": duration,
                "_raw_contribution_weight": award_contribution_score(
                    level, amount, duration
                ),
            }
        )
    return normalize_award_detail_contributions(details, planning_award_score_total(record))


def find_reference_planning_award_record(state_name, survey_year):
    reference_path = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "planning_awards_2000_2023_official.csv",
        )
    )
    if not os.path.exists(reference_path):
        return None
    try:
        df = pd.read_csv(reference_path).fillna("")
    except Exception:
        return None

    state_key = str(state_name or "").strip().lower()
    year_key = str(survey_year or "").strip()
    matches = df[
        (df["state"].astype(str).str.strip().str.lower() == state_key)
        & (df["survey_year"].astype(str).str.strip() == year_key)
    ]
    if matches.empty:
        return None
    return matches.iloc[0].to_dict()


def parse_program_amounts(source_notes):
    text = str(source_notes or "")
    amounts = {}
    for program in ("SMART", "SS4A", "ATCMTD", "ATTAIN"):
        segment_match = re.search(rf"{program}[^.;]*", text, re.IGNORECASE)
        segment = segment_match.group(0) if segment_match else ""
        match = (
            re.search(r"totaling\s+\$?([0-9][0-9,]*(?:\.\d+)?)", segment, re.IGNORECASE)
            or re.search(r"\$([0-9][0-9,]*(?:\.\d+)?)", segment)
            or re.search(r"at\s+\$?([0-9][0-9,]*(?:\.\d+)?)", segment, re.IGNORECASE)
        )
        if match:
            amounts[program] = parse_money_value(match.group(1))
    return amounts


def program_award_agency(program, recipient):
    if recipient and str(recipient).strip():
        return str(recipient).strip()
    program_text = str(program or "").upper()
    if program_text in {"SMART", "SS4A"}:
        return "USDOT"
    if program_text in {"ATCMTD", "ATTAIN"}:
        return "FHWA"
    return "Not specified"


def program_funding_title(program, project):
    if project and str(project).strip():
        return str(project).strip()
    program_text = str(program or "").upper()
    labels = {
        "SMART": "SMART Grant",
        "SS4A": "Safe Streets and Roads for All",
        "ATCMTD": "Advanced Transportation and Congestion Management Technologies Deployment",
        "ATTAIN": "Advanced Transportation Technologies and Innovative Mobility Deployment",
    }
    return labels.get(program_text, str(program or "Award funding").strip())


def facility_record_to_answers(record):
    return {
        "fac_toc_count": get_record_value(record, "fac_toc_count", "Facility TOC Count"),
        "fac_om_sites": get_record_value(record, "fac_om_sites", "Facility O&M Sites"),
        "fac_labs": get_record_value(record, "fac_labs", "Facility Labs"),
        "fac_resource_centers": get_record_value(
            record, "fac_resource_centers", "Facility Resource Centers"
        ),
        "fac_testbed_presence": get_record_value(
            record, "fac_testbed_presence", "Facility Testbed Presence"
        ),
        "fac_testbed_extent": get_record_value(
            record, "fac_testbed_extent", "Facility Testbed Extent"
        ),
        "fac_staff_support": get_record_value(
            record, "fac_staff_support", "Facility Staff Support"
        ),
    }


def find_latest_record_by_doc_type(doc_type, state_name, survey_year):
    documents = execute_paged_select(
        "documents",
        lambda query: query.eq("doc_type", doc_type)
        .eq("status", "uploaded")
        .order("created_at", desc=True),
    )
    for document in documents:
        rows = fetch_document_rows(document["id"])
        matching_rows = [
            row
            for row in rows
            if str(get_record_value(row, "state", "State") or "").strip().lower()
            == state_name.strip().lower()
            and str(get_record_value(row, "survey_year", "Survey Year") or "").strip()
            == str(survey_year).strip()
        ]
        if matching_rows:
            return matching_rows[0], document
    return None, None


def record_value_present(value):
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return bool(value)
    return True


def combine_planning_metadata(existing_value, new_value):
    values = []
    for value in [existing_value, new_value]:
        if not record_value_present(value):
            continue
        if isinstance(value, list):
            parts = value
        else:
            parts = str(value).replace("\n", " ").split(";")
        for part in parts:
            text = str(part).strip()
            if text and text not in values:
                values.append(text)
    return "; ".join(values)


def find_matching_records_by_doc_type(doc_type, state_name, survey_year):
    documents = execute_paged_select(
        "documents",
        lambda query: query.eq("doc_type", doc_type)
        .eq("status", "uploaded")
        .order("created_at", desc=True),
    )
    matches = []
    for document in documents:
        rows = fetch_document_rows(document["id"])
        for row in rows:
            if (
                str(get_record_value(row, "state", "State") or "").strip().lower()
                == state_name.strip().lower()
                and str(get_record_value(row, "survey_year", "Survey Year") or "").strip()
                == str(survey_year).strip()
            ):
                matches.append((row, document))
                if doc_type != "planning":
                    break
    return matches


def merge_planning_records(matches):
    award_level_matches = [
        (record, document)
        for record, document in matches
        if is_planning_award_record(record) or is_planning_baseline_record(record)
    ]
    if award_level_matches:
        latest_document_id = None
        for record, document in award_level_matches:
            document_id = document.get("id") if document else None
            if document_id:
                latest_document_id = document_id
                break

        selected_matches = [
            (record, document)
            for record, document in award_level_matches
            if not latest_document_id or (document and document.get("id") == latest_document_id)
        ]
        selected_records = [record for record, _document in selected_matches]
        merged = aggregate_planning_award_records(selected_records)
        merged["_merged_document_ids"] = list(
            dict.fromkeys(
                document.get("id")
                for _record, document in selected_matches
                if document and document.get("id")
            )
        )
        return merged

    merged = {}
    document_ids = []
    for record, document in reversed(matches):
        document_id = document.get("id") if document else None
        if document_id:
            document_ids.append(document_id)
        for key, value in record.items():
            if not record_value_present(value):
                continue
            if key in {"source_notes", "Source Notes", "source_urls", "Source URLs"}:
                merged[key] = combine_planning_metadata(merged.get(key), value)
            else:
                merged[key] = value
    merged["_merged_document_ids"] = list(reversed(document_ids))
    return merged


def find_latest_planning_record(state_name, survey_year):
    matches = find_matching_records_by_doc_type("planning", state_name, survey_year)
    if not matches:
        return None, None
    return merge_planning_records(matches), matches[0][1]



def find_latest_facility_record(state_name, survey_year):
    return find_latest_record_by_doc_type("facility", state_name, survey_year)


def find_latest_benefit_cost_record(state_name, survey_year):
    documents = execute_paged_select(
        "documents",
        lambda query: query.eq("doc_type", "benefit_cost")
        .eq("status", "uploaded")
        .order("created_at", desc=True),
    )
    for document in documents:
        rows = fetch_document_rows(document["id"])
        matching_rows = [
            row
            for row in rows
            if str(get_record_value(row, "state", "State") or "").strip().lower()
            == state_name.strip().lower()
            and str(get_record_value(row, "survey_year", "Survey Year") or "").strip()
            == str(survey_year).strip()
        ]
        if not matching_rows:
            continue
        if any(is_long_benefit_cost_record(row) for row in matching_rows):
            aggregated = aggregate_long_benefit_cost_records(matching_rows)
            if aggregated:
                return aggregated, document
            continue
        return matching_rows[0], document
    return None, None


def fetch_rows_grouped_by_document(document_ids):
    grouped = {document_id: [] for document_id in document_ids}
    if not document_ids:
        return grouped

    def fetch_entries(document_id):
        return document_id, execute_paged_select(
            "uploaded_dataset_rows",
            lambda query, doc_id=document_id: query.eq(
                "document_id", doc_id
            ).order("row_index"),
        )

    with ThreadPoolExecutor(max_workers=min(4, len(document_ids))) as executor:
        futures = {
            executor.submit(fetch_entries, document_id): document_id
            for document_id in document_ids
        }
        for future in as_completed(futures):
            document_id = futures[future]
            try:
                _document_id, entries = future.result()
            except Exception:
                _document_id, entries = fetch_entries(document_id)
            grouped[_document_id] = entries
    return grouped


def document_record_rows(rows_by_document, document_id):
    return [
        entry.get("row_data", {})
        for entry in rows_by_document.get(document_id, [])
    ]


def record_matches_state_year(record, state_name, survey_year):
    return (
        str(get_record_value(record, "state", "State") or "").strip().lower()
        == state_name.strip().lower()
        and str(get_record_value(record, "survey_year", "Survey Year") or "").strip()
        == str(survey_year).strip()
    )


def find_benefit_cost_record_from_snapshot(
    documents, rows_by_document, state_name, survey_year
):
    for document in documents:
        matching_rows = [
            row
            for row in document_record_rows(rows_by_document, document["id"])
            if record_matches_state_year(row, state_name, survey_year)
        ]
        if not matching_rows:
            continue
        if any(is_long_benefit_cost_record(row) for row in matching_rows):
            aggregated = aggregate_long_benefit_cost_records(matching_rows)
            if aggregated:
                return aggregated
            continue
        return matching_rows[0]
    return None


def find_record_from_snapshot(documents, rows_by_document, state_name, survey_year):
    for document in documents:
        for row in document_record_rows(rows_by_document, document["id"]):
            if record_matches_state_year(row, state_name, survey_year):
                return row
    return None


def find_planning_record_from_snapshot(
    documents, rows_by_document, state_name, survey_year
):
    matches = []
    for document in documents:
        for row in document_record_rows(rows_by_document, document["id"]):
            if record_matches_state_year(row, state_name, survey_year):
                matches.append((row, document))
    return merge_planning_records(matches) if matches else None


def fetch_dashboard_survey_updates(state_name):
    try:
        submissions = execute_paged_select(
            "survey_update_submissions",
            lambda query: query.eq("state", state_name).order("updated_at", desc=True),
        )
    except Exception:
        return {}

    latest_submissions = {}
    for submission in submissions:
        key = (
            str(submission.get("topic_key") or "").strip(),
            str(submission.get("survey_year") or "").strip(),
        )
        if key[0] and key[1] and key not in latest_submissions:
            latest_submissions[key] = submission

    submission_ids = [
        submission.get("id")
        for submission in latest_submissions.values()
        if submission.get("id")
    ]
    answers_by_submission = {submission_id: [] for submission_id in submission_ids}
    try:
        for start in range(0, len(submission_ids), 100):
            submission_chunk = submission_ids[start : start + 100]
            answer_rows = execute_paged_select(
                "survey_update_answers",
                lambda query, ids=submission_chunk: query.in_("submission_id", ids),
            )
            for answer_row in answer_rows:
                answers_by_submission.setdefault(
                    answer_row.get("submission_id"), []
                ).append(answer_row)
    except Exception:
        return {}

    updates = {}
    for key, submission in latest_submissions.items():
        answers = {}
        for answer_row in answers_by_submission.get(submission.get("id"), []):
            value = answer_row.get("answer_json")
            if value is None and answer_row.get("answer_text") not in (None, ""):
                value = answer_row.get("answer_text")
            if value is None and answer_row.get("answer_number") is not None:
                value = answer_row.get("answer_number")
            answers[answer_row.get("question_id")] = value
        updates[key] = answers
    return updates


def dashboard_score_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def dashboard_deployment_score(result):
    coverage_score = dashboard_score_number(result.get("coverage_score"))
    if coverage_score is not None:
        return coverage_score

    scores = []
    for item in result.get("items", []):
        scored_agency_count = dashboard_score_number(item.get("scored_agency_count"))
        if item.get("is_policy_fallback") is True or not scored_agency_count:
            continue
        score = dashboard_score_number(item.get("default_value"))
        if score is not None:
            scores.append(score)
    return sum(scores) / len(scores) if scores else None


def dashboard_overall_score(domain_scores):
    scores = [score for score in domain_scores if score is not None]
    return sum(scores) / len(scores) if scores else None


@app.route("/api/dashboard/history", methods=["GET"])
def get_dashboard_history():
    try:
        state_name = str(request.args.get("state", "")).strip()
        if not state_name:
            return jsonify({"error": "State is required."}), 400
        if state_name not in {"Texas", "New Jersey"}:
            return jsonify({"error": "State must be Texas or New Jersey."}), 400

        trend_years = [str(year) for year in range(2000, 2024)]
        documents = execute_paged_select(
            "documents",
            lambda query: query.eq("status", "uploaded").order(
                "created_at", desc=True
            ),
        )
        documents_by_type = {
            doc_type: [
                document
                for document in documents
                if document.get("doc_type") == doc_type
            ]
            for doc_type in ("benefit_cost", "legislation", "planning", "facility")
        }
        deployment_documents = [
            document
            for document in documents
            if document.get("doc_type") == "survey"
            and document.get("data_kind") == "survey_workbook"
            and str(document.get("survey_year") or "") in trend_years
        ]
        relevant_documents = deployment_documents + [
            document
            for doc_type_documents in documents_by_type.values()
            for document in doc_type_documents
        ]
        relevant_document_ids = list(
            dict.fromkeys(
                document.get("id")
                for document in relevant_documents
                if document.get("id")
            )
        )
        rows_by_document = fetch_rows_grouped_by_document(relevant_document_ids)

        legislation_records = []
        for document in documents_by_type["legislation"]:
            records = document_record_rows(rows_by_document, document["id"])
            document_state = document.get("state") or infer_single_state_from_records(
                records
            )
            if str(document_state or "").strip().lower() == state_name.lower():
                legislation_records.extend(records)

        survey_updates = fetch_dashboard_survey_updates(state_name)
        history_rows = []
        for survey_year in trend_years:
            benefit_record = find_benefit_cost_record_from_snapshot(
                documents_by_type["benefit_cost"],
                rows_by_document,
                state_name,
                survey_year,
            )
            benefit_answers = (
                benefit_cost_record_to_answers(benefit_record)
                if benefit_record
                else survey_updates.get(("benefit_cost", survey_year), {})
            )
            benefit_result = compute_benefit_cost_score(benefit_answers)
            benefit_score = dashboard_score_number(
                benefit_result.get("unified_score")
            )

            year_deployment_documents = [
                document
                for document in deployment_documents
                if str(document.get("survey_year") or "") == survey_year
            ]
            year_deployment_rows = [
                entry
                for document in year_deployment_documents
                for entry in rows_by_document.get(document["id"], [])
            ]
            deployment_result = (
                compute_deployment_coverage_for_year(
                    year_deployment_documents, year_deployment_rows, state_name
                )
                if year_deployment_documents
                else {}
            )
            deployment_score = dashboard_deployment_score(deployment_result)

            legislation_result = (
                analyze_legislation_records(legislation_records, survey_year)
                if legislation_records
                else {}
            )
            legislation_score = dashboard_score_number(
                legislation_result.get("unifiedScore")
            )

            planning_record = find_planning_record_from_snapshot(
                documents_by_type["planning"],
                rows_by_document,
                state_name,
                survey_year,
            )
            planning_answers = (
                planning_record_to_answers(planning_record)
                if planning_record
                else survey_updates.get(("project_planning", survey_year), {})
            )
            planning_result = compute_planning_score(planning_answers)
            planning_score = dashboard_score_number(
                planning_result.get("unified_score")
            )

            facility_record = find_record_from_snapshot(
                documents_by_type["facility"],
                rows_by_document,
                state_name,
                survey_year,
            )
            facility_answers = (
                facility_record_to_answers(facility_record)
                if facility_record
                else survey_updates.get(("facility", survey_year), {})
            )
            facility_result = compute_facility_capacity_score(facility_answers)
            facility_score = dashboard_score_number(
                facility_result.get("unified_score")
            )

            history_rows.append(
                {
                    "year": survey_year,
                    "overall": dashboard_overall_score(
                        [
                            benefit_score,
                            deployment_score,
                            legislation_score,
                            planning_score,
                            facility_score,
                        ]
                    ),
                    "benefitCost": benefit_score,
                    "deployment": deployment_score,
                    "legislation": legislation_score,
                    "planning": planning_score,
                    "facility": facility_score,
                }
            )

        return jsonify(
            {
                "state": state_name,
                "start_year": trend_years[0],
                "end_year": trend_years[-1],
                "rows": history_rows,
            }
        )
    except Exception as exc:
        return jsonify({"error": f"Could not load dashboard history: {str(exc)}"}), 500


@app.route("/api/planning/score", methods=["GET", "POST"])
def get_planning_score():
    try:
        if request.method == "POST":
            payload = request.get_json(silent=True) or {}
            answers = payload.get("answers", {}) if isinstance(payload, dict) else {}
            result = compute_planning_score(answers if isinstance(answers, dict) else {})
            result["source"] = "Provided Answers"
            return jsonify(result)

        state_name = str(request.args.get("state", "")).strip()
        survey_year = str(request.args.get("year", "")).strip()
        if not state_name or not survey_year:
            return jsonify({"error": "Both state and year are required."}), 400

        planning_record, document = find_latest_planning_record(state_name, survey_year)
        if planning_record:
            answers = planning_record_to_answers(planning_record)
            result = compute_planning_score(answers)
            result["source"] = "Calculated from Upload"
            result["state"] = state_name
            result["survey_year"] = survey_year
            result["dataset_version"] = get_record_value(planning_record, "dataset_version", "Dataset Version")
            result["evidence_level"] = get_record_value(planning_record, "evidence_level", "Evidence Level")
            result["source_notes"] = get_record_value(planning_record, "source_notes", "Source Notes")
            result["document_id"] = document.get("id") if document else None
            result["document_ids"] = planning_record.get("_merged_document_ids") or []
            award_reference = (
                None
                if planning_record.get("_planning_award_rows")
                else find_reference_planning_award_record(state_name, survey_year)
            )
            award_detail_record = (
                award_reference
                if award_reference
                and parse_money_value(
                    get_record_value(award_reference, "plan_award_count", "Plan Award Count")
                )
                > 0
                else planning_record
            )
            result["award_details"] = build_planning_award_details(award_detail_record)
            return jsonify(result)

        submission, answers = fetch_latest_survey_update(
            "project_planning", state_name, survey_year
        )
        if answers:
            result = compute_planning_score(answers)
            result["source"] = "Calculated from Survey-Based Updates"
            result["state"] = state_name
            result["survey_year"] = survey_year
            result["submission_id"] = submission.get("id") if submission else None
            return jsonify(result)

        result = compute_planning_score({})
        result["source"] = "No Value Available"
        result["state"] = state_name
        result["survey_year"] = survey_year
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": f"Could not calculate planning score: {str(exc)}"}), 500


@app.route("/api/facility/score", methods=["GET", "POST"])
def get_facility_score():
    try:
        if request.method == "POST":
            payload = request.get_json(silent=True) or {}
            answers = payload.get("answers", {}) if isinstance(payload, dict) else {}
            result = compute_facility_capacity_score(answers if isinstance(answers, dict) else {})
            result["source"] = "Provided Answers"
            return jsonify(result)

        state_name = str(request.args.get("state", "")).strip()
        survey_year = str(request.args.get("year", "")).strip()
        if not state_name or not survey_year:
            return jsonify({"error": "Both state and year are required."}), 400

        facility_record, document = find_latest_facility_record(state_name, survey_year)
        if facility_record:
            answers = facility_record_to_answers(facility_record)
            result = compute_facility_capacity_score(answers)
            result["source"] = "Calculated from Upload"
            result["state"] = state_name
            result["survey_year"] = survey_year
            result["dataset_version"] = get_record_value(facility_record, "dataset_version", "Dataset Version")
            result["evidence_level"] = get_record_value(facility_record, "evidence_level", "Evidence Level")
            result["source_notes"] = get_record_value(facility_record, "source_notes", "Source Notes")
            result["document_id"] = document.get("id") if document else None
            return jsonify(result)

        submission, answers = fetch_latest_survey_update("facility", state_name, survey_year)
        if answers:
            result = compute_facility_capacity_score(answers)
            result["source"] = "Calculated from Survey-Based Updates"
            result["state"] = state_name
            result["survey_year"] = survey_year
            result["submission_id"] = submission.get("id") if submission else None
            return jsonify(result)

        result = compute_facility_capacity_score({})
        result["source"] = "No Value Available"
        result["state"] = state_name
        result["survey_year"] = survey_year
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": f"Could not calculate facility score: {str(exc)}"}), 500


@app.route("/api/expert-review/current-values", methods=["GET"])
def get_expert_review_current_values():
    try:
        review_year = str(request.args.get("year", "")).strip()
        state_name = str(request.args.get("state", "")).strip()
        domain_key = str(request.args.get("domain_key", "")).strip()

        if not review_year or not state_name or not domain_key:
            return jsonify({"error": "Year, state, and domain_key are required."}), 400
        if not get_domain_label(domain_key):
            return jsonify({"error": "Unknown review domain."}), 404

        items = build_review_items(domain_key)
        uploaded_values = get_uploaded_review_values(domain_key, state_name, review_year)
        items = apply_current_values(items, uploaded_values)

        submission, answers = fetch_latest_survey_update(domain_key, state_name, review_year)
        survey_values = survey_answer_values(domain_key, answers)
        survey_values = add_review_scores(domain_key, survey_values, answers)
        items = apply_current_values(items, survey_values)

        return jsonify(
            {
                "items": items,
                "survey_update_submission": submission,
                "source_priority": [
                    "Calculated from Survey-Based Updates",
                    "Calculated from Upload",
                    "Preloaded Baseline",
                    "No Value Available",
                ],
            }
        )
    except Exception as exc:
        return jsonify({"error": f"Could not resolve expert review values: {str(exc)}"}), 500


def format_expert_review_session(session, items=None):
    return {
        "id": session.get("id"),
        "reviewer_name": session.get("reviewer_name") or "",
        "review_year": session.get("review_year") or "",
        "state": session.get("state") or "",
        "domain_key": session.get("domain_key") or "",
        "domain_label": session.get("domain_label") or "",
        "dataset_version": session.get("dataset_version") or "",
        "status": session.get("status") or "draft",
        "overall_comment": session.get("overall_comment") or "",
        "created_at": session.get("created_at"),
        "updated_at": session.get("updated_at"),
        "submitted_at": session.get("submitted_at"),
        "items": items or [],
    }


def clean_review_item(raw_item):
    return {
        "subaspect_key": str(raw_item.get("subaspect_key") or "").strip(),
        "subaspect_label": str(raw_item.get("subaspect_label") or "").strip(),
        "current_value": str(raw_item.get("current_value") or "").strip(),
        "source_basis": str(raw_item.get("source_basis") or "").strip(),
        "expert_judgment": str(raw_item.get("expert_judgment") or "").strip(),
        "suggested_value": str(raw_item.get("suggested_value") or "").strip(),
        "confidence_level": str(raw_item.get("confidence_level") or "").strip(),
        "comment": str(raw_item.get("comment") or "").strip(),
        "recommend_method_change": bool(raw_item.get("recommend_method_change")),
    }


@app.route("/api/expert-review/subaspects", methods=["GET"])
def get_expert_review_subaspects():
    try:
        domain_key = str(request.args.get("domain_key", "")).strip()
        if domain_key:
            domain_label = get_domain_label(domain_key)
            if not domain_label:
                return jsonify({"error": "Unknown review domain."}), 404
            return jsonify(
                {
                    "domains": EXPERT_REVIEW_DOMAINS,
                    "domain_key": domain_key,
                    "domain_label": domain_label,
                    "items": build_review_items(domain_key),
                }
            )

        return jsonify({"domains": EXPERT_REVIEW_DOMAINS})
    except Exception as exc:
        return jsonify({"error": f"Could not load review subaspects: {str(exc)}"}), 500


@app.route("/api/expert-review/sessions/latest", methods=["GET"])
def get_latest_expert_review_session():
    try:
        review_year = str(request.args.get("year", "")).strip()
        state_name = str(request.args.get("state", "")).strip()
        domain_key = str(request.args.get("domain_key", "")).strip()

        if not review_year or not state_name or not domain_key:
            return jsonify({"error": "Year, state, and domain_key are required."}), 400

        result = (
            supabase.table("expert_review_sessions")
            .select("*")
            .eq("review_year", review_year)
            .eq("state", state_name)
            .eq("domain_key", domain_key)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )

        if not result.data:
            return jsonify({"session": None, "items": build_review_items(domain_key)})

        session = result.data[0]
        items_result = (
            supabase.table("expert_review_items")
            .select("*")
            .eq("session_id", session["id"])
            .order("id")
            .execute()
        )
        return jsonify(
            {
                "session": format_expert_review_session(session, items_result.data or []),
                "items": items_result.data or [],
            }
        )
    except Exception as exc:
        return jsonify({"error": f"Could not load expert review session: {str(exc)}"}), 500


@app.route("/api/expert-review/sessions", methods=["POST"])
def save_expert_review_session():
    try:
        payload = request.get_json(silent=True) or {}
        domain_key = str(payload.get("domain_key") or "").strip()
        domain_label = get_domain_label(domain_key)
        if not domain_label:
            return jsonify({"error": "Unknown review domain."}), 400

        review_year = str(payload.get("review_year") or "").strip()
        state_name = str(payload.get("state") or "").strip()
        if not review_year or not state_name:
            return jsonify({"error": "Review year and state are required."}), 400

        status = str(payload.get("status") or "draft").strip().lower()
        if status not in {"draft", "submitted"}:
            return jsonify({"error": "Status must be draft or submitted."}), 400

        now = datetime.now(timezone.utc).isoformat()
        session_id = str(payload.get("id") or "").strip() or str(uuid.uuid4())
        session_row = {
            "id": session_id,
            "reviewer_name": str(payload.get("reviewer_name") or "").strip(),
            "review_year": review_year,
            "state": state_name,
            "domain_key": domain_key,
            "domain_label": domain_label,
            "dataset_version": str(payload.get("dataset_version") or "").strip(),
            "status": status,
            "overall_comment": str(payload.get("overall_comment") or "").strip(),
            "updated_at": now,
            "submitted_at": now if status == "submitted" else None,
        }

        existing = (
            supabase.table("expert_review_sessions")
            .select("id, created_at")
            .eq("id", session_id)
            .execute()
        )
        if existing.data:
            supabase.table("expert_review_sessions").update(session_row).eq("id", session_id).execute()
            supabase.table("expert_review_items").delete().eq("session_id", session_id).execute()
        else:
            session_row["created_at"] = now
            supabase.table("expert_review_sessions").insert(session_row).execute()

        raw_items = payload.get("items", [])
        if not isinstance(raw_items, list):
            return jsonify({"error": "Review items must be a list."}), 400

        item_rows = []
        for raw_item in raw_items:
            if not isinstance(raw_item, dict):
                continue
            item = clean_review_item(raw_item)
            if not item["subaspect_key"] or not item["subaspect_label"]:
                continue
            item_rows.append({"session_id": session_id, **item})

        if item_rows:
            supabase.table("expert_review_items").insert(item_rows).execute()

        saved_session = (
            supabase.table("expert_review_sessions")
            .select("*")
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
        saved_items = (
            supabase.table("expert_review_items")
            .select("*")
            .eq("session_id", session_id)
            .order("id")
            .execute()
        )

        return jsonify(
            {
                "message": "Expert review saved",
                "session": format_expert_review_session(
                    saved_session.data[0], saved_items.data or []
                ),
            }
        )
    except Exception as exc:
        return jsonify({"error": f"Could not save expert review: {str(exc)}"}), 500


@app.route("/api/feedback", methods=["POST"])
def save_feedback_comment():
    try:
        payload = request.get_json(silent=True) or {}
        comment = str(payload.get("comment") or "").strip()
        agency_company = str(payload.get("agency_company") or "").strip()
        user_name = str(payload.get("user_name") or "").strip()
        email = str(payload.get("email") or "").strip()
        if not comment:
            return jsonify({"error": "Feedback comment is required."}), 400
        if not agency_company or not user_name or not email:
            return jsonify(
                {
                    "error": (
                        "Agency/Company, Username, and Email are required "
                        "before submitting feedback."
                    )
                }
            ), 400
        if "@" not in email:
            return jsonify({"error": "A valid feedback email is required."}), 400

        if len(comment) > 2000:
            return jsonify({"error": "Feedback comment must be 2000 characters or less."}), 400

        now = datetime.now(timezone.utc).isoformat()
        feedback_row = {
            "id": str(uuid.uuid4()),
            "page_path": str(payload.get("page_path") or "").strip()[:500],
            "section_block": str(payload.get("section_block") or "").strip()[:300],
            "section_id": str(payload.get("section_id") or "").strip()[:200],
            "state": str(payload.get("state") or "").strip()[:100],
            "agency_company": agency_company[:300],
            "user_name": user_name[:200],
            "email": email[:320],
            "account_user_name": str(payload.get("account_user_name") or "").strip()[:200],
            "comment": comment,
            "status": "new",
            "user_agent": str(request.headers.get("User-Agent") or "").strip()[:500],
            "created_at": now,
        }

        try:
            supabase.table("feedback_comments").insert(feedback_row).execute()
        except Exception as insert_error:
            error_text = str(insert_error).lower()
            extended_columns = (
                "agency_company",
                "email",
                "account_user_name",
                "section_block",
                "section_id",
            )
            schema_is_older = (
                "schema cache" in error_text
                and any(column in error_text for column in extended_columns)
            )
            if not schema_is_older:
                raise

            legacy_feedback_row = {
                key: value
                for key, value in feedback_row.items()
                if key not in extended_columns
            }
            legacy_feedback_row["comment"] = (
                f"Agency/Company: {agency_company}\n"
                f"Username: {user_name}\n"
                f"Email: {email}\n"
                f"Section: {feedback_row['section_block'] or 'General page feedback'}\n"
                f"Section ID: {feedback_row['section_id'] or 'N/A'}\n\n"
                f"{comment}"
            )
            supabase.table("feedback_comments").insert(legacy_feedback_row).execute()
        return jsonify({"message": "Feedback saved", "id": feedback_row["id"]}), 201
    except Exception as exc:
        return jsonify({"error": f"Could not save feedback: {str(exc)}"}), 500


@app.route("/api/documents/upload", methods=["POST"])
def upload_document():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files["file"]
        doc_type = request.form.get("doc_type", "survey")

        if file.filename == "":
            return jsonify({"error": "No file selected"}), 400

        original_name = file.filename
        filename = secure_filename(original_name)
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        file_content = file.read()

        records = []
        row_payloads = []
        keywords = []
        dataset_key = None
        state_name = None
        data_kind = None
        survey_year = None
        agency_type = None
        survey_scope = None

        if ext in ("csv", "xlsx", "xls"):
            records = read_tabular_records(filename, file_content)
            keywords = extract_keywords_from_records(records)

        if doc_type == "survey":
            if ext not in ("csv", "xlsx", "xls"):
                return jsonify({"error": "ITS Deployment Coverage Data uploads must be CSV or Excel files."}), 400

            survey_file_meta = parse_survey_filename(original_name)
            if survey_file_meta and ext in ("xlsx", "xls"):
                parsed_workbook = parse_survey_workbook(original_name, file_content)
                data_kind = "survey_workbook"
                survey_year = parsed_workbook["survey_year"]
                agency_type = parsed_workbook["agency_type"]
                survey_scope = parsed_workbook["survey_scope"]
                keywords = parsed_workbook["keywords"]
                row_payloads = parsed_workbook["metadata_rows"] + parsed_workbook["answer_rows"]
                records = [row["row_data"] for row in parsed_workbook["answer_rows"]]
            else:
                if not records:
                    return jsonify({"error": "No table rows were found in the uploaded file."}), 400

                state_name, dataset_key = infer_state_dataset(original_name, records)
                if not dataset_key:
                    return jsonify(
                        {
                            "error": "Survey uploads must either follow the YYYY_AM_data.xlsx pattern for ITS survey workbooks "
                            "or be identifiable as tx_state_data / nj_state_data uploads."
                        }
                    ), 400

                data_kind = "state_dataset"
                row_payloads = [{"row_data": row} for row in records]
        elif records:
            data_kind = "tabular_document"
            if doc_type == "legislation":
                state_name = infer_single_state_from_records(records)
                data_kind = "legislation_dataset"
            elif doc_type == "benefit_cost":
                validation_errors = validate_long_benefit_cost_records(records)
                if validation_errors:
                    return jsonify(
                        {
                            "error": "The normalized benefit/cost table is invalid.",
                            "details": validation_errors,
                        }
                    ), 400
                if any(is_long_benefit_cost_record(row) for row in records):
                    data_kind = "benefit_cost_component_dataset"
            row_payloads = [{"row_data": row} for row in records]

        doc_id = str(uuid.uuid4())
        document_row = {
            "id": doc_id,
            "filename": filename,
            "original_name": original_name,
            "doc_type": doc_type,
            "dataset_key": dataset_key,
            "data_kind": data_kind,
            "state": state_name,
            "survey_year": survey_year,
            "agency_type": agency_type,
            "survey_scope": survey_scope,
            "status": "uploaded",
            "row_count": len(records),
            "keywords": keywords,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        result = supabase.table("documents").insert(document_row).execute()
        if hasattr(result, "error") and result.error:
            return jsonify({"error": str(result.error)}), 500

        if row_payloads:
            batch = []
            for index, payload in enumerate(row_payloads, start=1):
                batch.append(
                    {
                        "document_id": doc_id,
                        "dataset_key": dataset_key,
                        "data_kind": data_kind,
                        "state": state_name,
                        "survey_year": survey_year,
                        "agency_type": agency_type,
                        "survey_scope": survey_scope,
                        "sheet_name": payload.get("sheet_name"),
                        "sheet_role": payload.get("sheet_role"),
                        "row_index": index,
                        "row_data": payload["row_data"],
                    }
                )

            batch_size = 200
            for start in range(0, len(batch), batch_size):
                supabase.table("uploaded_dataset_rows").insert(batch[start : start + batch_size]).execute()

        return jsonify({"message": "Uploaded successfully", "id": doc_id, "rowsStored": len(records)}), 201

    except Exception as exc:
        return jsonify({"error": f"Upload failed: {str(exc)}"}), 500


@app.route("/api/documents", methods=["GET"])
def get_documents():
    try:
        purge_expired_deleted_docs()
        result = supabase.table("documents").select("*").order("created_at", desc=True).execute()
        return jsonify([format_document_record(doc) for doc in result.data])
    except Exception as exc:
        return jsonify({"error": f"Could not fetch documents: {str(exc)}"}), 500


@app.route("/api/documents/<doc_id>", methods=["DELETE"])
def delete_document(doc_id):
    try:
        result = supabase.table("documents").select("*").eq("id", doc_id).execute()
        if not result.data:
            return jsonify({"error": "Document not found"}), 404

        doc = result.data[0]
        supabase.table("deleted_docs").insert(
            {
                **doc,
                "deleted_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()

        supabase.table("uploaded_dataset_rows").delete().eq("document_id", doc_id).execute()
        supabase.table("documents").delete().eq("id", doc_id).execute()

        return jsonify({"message": "Document moved to trash"}), 200

    except Exception as exc:
        return jsonify({"error": f"Delete failed: {str(exc)}"}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "").lower() in {"1", "true", "yes"}
    app.run(host="0.0.0.0", port=port, debug=debug)
