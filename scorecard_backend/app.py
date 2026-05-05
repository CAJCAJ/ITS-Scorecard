import io
import math
import os
import uuid
from datetime import datetime, timedelta, timezone

import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.utils import secure_filename

from benefit_cost_analysis import compute_benefit_cost_score
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
from survey_scoring import compute_default_values_for_year, parse_survey_filename, parse_survey_workbook

app = Flask(__name__)
CORS(app)

supabase = create_supabase_client()

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


def get_latest_legislation_documents():
    legislation_docs = execute_paged_select(
        "documents",
        lambda query: query.eq("doc_type", "legislation").eq("status", "uploaded").order("created_at", desc=True),
    )

    latest = {}
    for doc in legislation_docs:
        document_state = doc.get("state")
        if not document_state:
            rows = fetch_document_rows(doc["id"])
            document_state = infer_single_state_from_records(rows)
        if document_state and document_state not in latest:
            latest[document_state] = doc
    return latest


def fetch_legislation_records(state_name):
    latest_docs = get_latest_legislation_documents()
    document = latest_docs.get(state_name)
    if not document:
        return []
    return fetch_document_rows(document["id"])


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
    if not state:
        return jsonify({"error": "State is required."}), 400

    records = fetch_legislation_records(state)
    if not records:
        return jsonify({"error": "Legislation data not found for the selected state."}), 404

    result = analyze_legislation_records(records)
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
        items = compute_default_values_for_year(survey_documents, uploaded_rows, state_name)
        if not items:
            return jsonify({"items": [], "message": f"No Data Found for Year {survey_year}"}), 200

        return jsonify({"items": items, "message": ""})
    except Exception as exc:
        return jsonify({"error": f"Could not load deployment default values: {str(exc)}"}), 500


@app.route("/api/benefit-cost/score", methods=["POST"])
def get_benefit_cost_score():
    try:
        payload = request.get_json(silent=True) or {}
        answers = payload.get("answers", {}) if isinstance(payload, dict) else {}
        result = compute_benefit_cost_score(answers if isinstance(answers, dict) else {})
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
        return legislation_upload_values(analyze_legislation_records(records))

    return {}


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
    app.run(host="0.0.0.0", port=5000, debug=True)
