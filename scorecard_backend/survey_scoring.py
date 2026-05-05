import io
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd


SPECIAL_NO_RESPONSE = -9999
SPECIAL_SKIP_LOGIC = -8888
VALID_FORMATS = {"boolean", "numeric", "multiple choice"}
QUESTION_ID_RE = re.compile(r"^\s*(\d{1,3})([A-Za-z]{0,2})\s*$")
FILENAME_RE = re.compile(
    r"^(?P<year>\d{4})_(?P<survey_type>AM|FM|TM)(?:_(?P<scope>Local|State))?_data\.xlsx$",
    re.IGNORECASE,
)

DEFAULT_DOMAIN_ORDER = [
    "Active Traffic and Demand Management",
    "Connected, Automated, and Emerging Vehicle Technology",
    "ITS Program Planning and Operational Support",
    "Road Weather Information and Response",
    "Safety Enforcement and Incident Response",
    "Signal Management and Intersection Control",
    "Traffic Monitoring and Data Collection",
    "Transit and Fleet ITS Technology",
    "Traveler Information and User Services",
    "Vulnerable Road User Safety Applications",
    "Work Zone ITS and Queue Warning",
]

STATE_CODE_MAP = {
    "Texas": "TX",
    "New Jersey": "NJ",
}

STATE_COLS = ["Matched_State", "State"]
AGENCY_ID_COLS = ["AgencyID", "Agency Number", "AgencyNumber"]
AGENCY_NAME_COLS = ["AgencyName", "Agency Name"]
AGENCY_TYPE_COLS = ["AgencyType", "Agency Type"]
METRO_COLS = ["MetroArea", "metroarea"]
REGION_COLS = ["Region", "region"]

TX_METRO_PATTERNS = (
    re.compile(r"\btx\b", re.IGNORECASE),
    re.compile(r"\baustin\b", re.IGNORECASE),
    re.compile(r"\bdallas\b", re.IGNORECASE),
    re.compile(r"\bfort worth\b", re.IGNORECASE),
    re.compile(r"\bhouston\b", re.IGNORECASE),
    re.compile(r"\bsan antonio\b", re.IGNORECASE),
    re.compile(r"\bel paso\b", re.IGNORECASE),
    re.compile(r"\bbeaumont\b", re.IGNORECASE),
    re.compile(r"\bport arthur\b", re.IGNORECASE),
    re.compile(r"\bmcallen\b", re.IGNORECASE),
    re.compile(r"\bedinburg\b", re.IGNORECASE),
    re.compile(r"\bmission\b", re.IGNORECASE),
)

NJ_METRO_PATTERNS = (
    re.compile(r"\bnj\b", re.IGNORECASE),
    re.compile(r"new jersey", re.IGNORECASE),
    re.compile(r"northern new jersey", re.IGNORECASE),
    re.compile(r"\btrenton\b", re.IGNORECASE),
    re.compile(r"\bcamden\b", re.IGNORECASE),
    re.compile(r"allentown-bethlehem-easton, pa-nj", re.IGNORECASE),
    re.compile(r"philadelphia.*-nj", re.IGNORECASE),
    re.compile(r"new york.*-nj", re.IGNORECASE),
)

DOMAIN_MATCHES_PATH = Path(__file__).resolve().parent / "data" / "survey" / "domain_question_matches_long.csv"


@dataclass(frozen=True)
class VariableMeta:
    survey_file: str
    main_q_id: str
    main_question: str
    item_question: str
    answer_variable: str
    variable_format: str
    values_raw: str
    value_labels_raw: str
    polarity: str


def norm_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def collapse_spaces(value: Any) -> str:
    return re.sub(r"\s+", " ", norm_text(value)).strip()


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def parse_question_id(value: Any) -> str:
    text = norm_text(value)
    if not text:
        return ""
    if re.fullmatch(r"\d+\.0", text):
        text = str(int(float(text)))
    match = QUESTION_ID_RE.fullmatch(text)
    if not match:
        return ""
    return f"{int(match.group(1))}{match.group(2).lower()}"


def parse_number(value: Any) -> float | None:
    text = norm_text(value)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_allowed_values(values_raw: Any) -> list[int]:
    out = []
    for token in re.split(r"\s*,\s*", norm_text(values_raw)):
        if not token:
            continue
        try:
            out.append(int(float(token)))
        except ValueError:
            continue
    return out


def parse_value_labels(value_labels_raw: Any) -> dict[int, str]:
    labels = {}
    for part in re.split(r"\s*;\s*", norm_text(value_labels_raw)):
        if "=" not in part:
            continue
        left, right = part.split("=", 1)
        try:
            code = int(float(left.strip()))
        except ValueError:
            continue
        labels[code] = right.strip()
    return labels


def percentage_midpoint(label: str) -> float | None:
    nums = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*%", label)]
    if not nums:
        return None
    if len(nums) >= 2:
        return (nums[0] + nums[1]) / 2.0
    return nums[0]


def is_missing_option_label(label: str) -> bool:
    text = normalize_space(label)
    if not text:
        return False
    return any(cue in text for cue in ("no response", "skip logic", "no answer", "not answered"))


def detect_question_header_row(df: pd.DataFrame) -> int:
    for idx in range(len(df)):
        row_vals = [norm_text(v).lower() for v in df.iloc[idx].tolist() if norm_text(v)]
        row_text = " | ".join(row_vals)
        if "q#" in row_text and "question" in row_text:
            return idx
    raise ValueError("Could not find question header row in survey dictionary sheet.")


def find_column(headers: list[str], needle: str) -> int | None:
    for idx, value in enumerate(headers):
        if needle in value:
            return idx
    return None


def infer_polarity(main_question: str, item_question: str) -> str:
    text = f" {normalize_space(main_question)} | {normalize_space(item_question)} "
    negative_cues = [
        " no ",
        "no ",
        "don't know",
        "do not",
        "none",
        "not ",
        "no response",
        "skip logic",
        "not applicable",
    ]
    if "[exclusive]" in text and (" no " in text or "don't know" in text):
        return "negative"
    if any(cue in text for cue in negative_cues):
        if "does your agency" in text and ("deploy" in text or "use" in text or "operate" in text):
            return "positive"
        return "negative"
    return "positive"


def clean_cell(value: Any) -> Any:
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


def clean_record(record: dict[str, Any]) -> dict[str, Any]:
    cleaned = {}
    for key, value in record.items():
        clean_key = str(key).strip()
        if not clean_key:
            continue
        clean_value = clean_cell(value)
        if clean_value is None:
            continue
        cleaned[clean_key] = clean_value
    return cleaned


def parse_survey_filename(filename: str) -> dict[str, str] | None:
    match = FILENAME_RE.match(Path(filename).name)
    if not match:
        return None
    return {
        "survey_year": match.group("year"),
        "agency_type": match.group("survey_type").upper(),
        "survey_scope": (match.group("scope") or "").title(),
    }


def extract_variable_metadata_from_sheet(raw_df: pd.DataFrame, workbook_name: str) -> list[VariableMeta]:
    header_row = detect_question_header_row(raw_df)
    headers = [norm_text(v).lower() for v in raw_df.iloc[header_row].tolist()]

    q_col = find_column(headers, "q#")
    question_col = find_column(headers, "question")
    survey_var_col = find_column(headers, "survey variable name")
    data_file_var_col = find_column(headers, "data file variable name")
    format_col = find_column(headers, "variable format")
    values_col = find_column(headers, "values")
    value_labels_col = find_column(headers, "value labels")

    if q_col is None or question_col is None:
        raise ValueError(f"Missing Q#/Question columns in {workbook_name}")
    if survey_var_col is None and data_file_var_col is None:
        raise ValueError(f"Missing answer variable columns in {workbook_name}")
    if format_col is None:
        raise ValueError(f"Missing Variable Format column in {workbook_name}")

    data = raw_df.iloc[header_row + 1 :].copy().reset_index(drop=True)
    metas = []
    current_q_id = ""
    current_main_question = ""

    for _, row in data.iterrows():
        q_value = row.iloc[q_col] if q_col < len(row) else None
        q_id = parse_question_id(q_value)
        if q_id:
            current_q_id = q_id

        question_value = row.iloc[question_col] if question_col < len(row) else None
        question_text = norm_text(question_value)
        if q_id and question_text:
            current_main_question = question_text

        if not current_q_id:
            continue

        survey_var = norm_text(row.iloc[survey_var_col] if survey_var_col is not None and survey_var_col < len(row) else None)
        data_file_var = norm_text(row.iloc[data_file_var_col] if data_file_var_col is not None and data_file_var_col < len(row) else None)
        answer_variable = data_file_var or survey_var
        if not answer_variable:
            continue

        variable_format = norm_text(row.iloc[format_col] if format_col < len(row) else None)
        if variable_format.lower() not in VALID_FORMATS:
            continue

        values_raw = norm_text(row.iloc[values_col] if values_col is not None and values_col < len(row) else None)
        value_labels_raw = norm_text(row.iloc[value_labels_col] if value_labels_col is not None and value_labels_col < len(row) else None)
        item_question = question_text or current_main_question

        metas.append(
            VariableMeta(
                survey_file=workbook_name,
                main_q_id=current_q_id,
                main_question=current_main_question,
                item_question=item_question,
                answer_variable=answer_variable,
                variable_format=variable_format,
                values_raw=values_raw,
                value_labels_raw=value_labels_raw,
                polarity=infer_polarity(current_main_question, item_question),
            )
        )

    return metas


def parse_survey_workbook(filename: str, content: bytes) -> dict[str, Any]:
    file_meta = parse_survey_filename(filename)
    if not file_meta:
        raise ValueError(
            "Survey files must follow the pattern YYYY_AM_data.xlsx, YYYY_TM_data.xlsx, or YYYY_FM_data.xlsx."
        )

    excel_file = pd.ExcelFile(io.BytesIO(content))
    if len(excel_file.sheet_names) < 2:
        raise ValueError("Survey uploads must contain at least two worksheets.")

    dictionary_sheet_name = excel_file.sheet_names[0]
    answers_sheet_name = excel_file.sheet_names[1]

    dictionary_df = pd.read_excel(io.BytesIO(content), sheet_name=0, header=None, dtype=object)
    answers_df = pd.read_excel(io.BytesIO(content), sheet_name=1, dtype=object)
    answers_df = answers_df.dropna(how="all").dropna(axis=1, how="all")

    metadata_entries = extract_variable_metadata_from_sheet(dictionary_df, Path(filename).name)
    metadata_rows = [
        {
            "sheet_name": dictionary_sheet_name,
            "sheet_role": "dictionary",
            "row_data": {
                "survey_file": entry.survey_file,
                "main_q_id": entry.main_q_id,
                "main_question": entry.main_question,
                "item_question": entry.item_question,
                "answer_variable": entry.answer_variable,
                "variable_format": entry.variable_format,
                "values_raw": entry.values_raw,
                "value_labels_raw": entry.value_labels_raw,
                "polarity": entry.polarity,
            },
        }
        for entry in metadata_entries
    ]

    answer_rows = [
        {
            "sheet_name": answers_sheet_name,
            "sheet_role": "answers",
            "row_data": clean_record(record),
        }
        for record in answers_df.to_dict(orient="records")
    ]
    answer_rows = [row for row in answer_rows if row["row_data"]]

    return {
        **file_meta,
        "sheet_names": [dictionary_sheet_name, answers_sheet_name],
        "metadata_rows": metadata_rows,
        "answer_rows": answer_rows,
        "keywords": [entry.answer_variable for entry in metadata_entries[:8]],
    }


def normalize_state(value: Any) -> str | None:
    text = norm_text(value).upper()
    if text in {"NJ", "NEW JERSEY"}:
        return "NJ"
    if text in {"TX", "TEXAS"}:
        return "TX"
    return None


def classify_by_metro(value: Any) -> str | None:
    text = norm_text(value)
    if not text:
        return None
    if any(pattern.search(text) for pattern in TX_METRO_PATTERNS):
        return "TX"
    if any(pattern.search(text) for pattern in NJ_METRO_PATTERNS):
        return "NJ"
    return None


def extract_target_state_rows(answer_df: pd.DataFrame, state_name: str) -> pd.DataFrame:
    if answer_df.empty:
        return pd.DataFrame()

    out = answer_df.copy()
    lower_map = {str(col).strip().lower(): col for col in out.columns}
    if "state" in lower_map:
        selected = out[lower_map["state"]].map(normalize_state)
        basis = "State"
    elif "metroarea" in lower_map:
        selected = out[lower_map["metroarea"]].map(classify_by_metro)
        basis = "MetroArea"
    else:
        return pd.DataFrame()

    out.insert(0, "Matched_State", selected.fillna(""))
    out.insert(1, "Match_Basis", basis)
    state_code = STATE_CODE_MAP[state_name]
    filtered = out[out["Matched_State"] == state_code].copy()
    return filtered.where(filtered.notna(), "")


def choose_first(row: pd.Series, columns: list[str]) -> str:
    for column in columns:
        if column not in row.index:
            continue
        text = collapse_spaces(row[column])
        if text:
            return text
    return ""


def normalize_name_key(value: str) -> str:
    text = collapse_spaces(value).lower().replace("&", "and")
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def build_agency_identity(row: pd.Series) -> dict[str, str]:
    matched_state = choose_first(row, STATE_COLS)
    agency_id = choose_first(row, AGENCY_ID_COLS)
    agency_name = choose_first(row, AGENCY_NAME_COLS)
    agency_type = choose_first(row, AGENCY_TYPE_COLS)
    metro_area = choose_first(row, METRO_COLS)
    region = choose_first(row, REGION_COLS)

    if agency_name:
        key_core = normalize_name_key(agency_name)
    elif agency_id:
        key_core = f"agency_id_{normalize_name_key(agency_id)}"
    else:
        key_core = f"unknown_{normalize_name_key(metro_area or region or matched_state)}"

    agency_key = "__".join(part for part in [matched_state or "UNK", key_core] if part)
    display_name = agency_name or (f"Agency {agency_id}" if agency_id else agency_key)
    return {
        "agency_key": agency_key,
        "state": matched_state,
        "agency_id": agency_id,
        "agency_name": display_name,
        "agency_type": agency_type,
        "metro_area": metro_area,
        "region": region,
    }


def compute_variable_stats(df: pd.DataFrame, meta: VariableMeta) -> dict[str, Any]:
    if meta.answer_variable not in df.columns:
        return {"Observed_Min": "", "Observed_Max": "", "Allowed_Min": "", "Allowed_Max": ""}

    valid_values = []
    labels = parse_value_labels(meta.value_labels_raw)
    for raw in df[meta.answer_variable].tolist():
        num = parse_number(raw)
        if num is None:
            continue
        as_int = int(num)
        if as_int in {SPECIAL_NO_RESPONSE, SPECIAL_SKIP_LOGIC}:
            continue
        if meta.variable_format.lower() == "multiple choice" and is_missing_option_label(labels.get(as_int, "")):
            continue
        valid_values.append(float(num))

    observed_min = min(valid_values) if valid_values else ""
    observed_max = max(valid_values) if valid_values else ""

    allowed_min = ""
    allowed_max = ""
    fmt = meta.variable_format.lower()
    if fmt == "boolean":
        allowed_min, allowed_max = 0, 1
    elif fmt == "multiple choice":
        allowed_codes = [
            code
            for code in parse_allowed_values(meta.values_raw)
            if code not in {SPECIAL_NO_RESPONSE, SPECIAL_SKIP_LOGIC}
            and not is_missing_option_label(labels.get(code, ""))
        ]
        if allowed_codes:
            allowed_min = min(allowed_codes)
            allowed_max = max(allowed_codes)

    return {
        "Observed_Min": observed_min,
        "Observed_Max": observed_max,
        "Allowed_Min": allowed_min,
        "Allowed_Max": allowed_max,
    }


def build_multichoice_option_scores(meta: VariableMeta) -> dict[int, float]:
    labels = parse_value_labels(meta.value_labels_raw)
    allowed_codes = [
        code
        for code in parse_allowed_values(meta.values_raw)
        if code not in {SPECIAL_NO_RESPONSE, SPECIAL_SKIP_LOGIC}
        and not is_missing_option_label(labels.get(code, ""))
    ]
    if not allowed_codes:
        return {}

    pct_map = {code: percentage_midpoint(labels.get(code, "")) for code in allowed_codes}
    if all(value is not None for value in pct_map.values()):
        out = {code: max(0.0, min(1.0, float(pct) / 100.0)) for code, pct in pct_map.items()}
        return {code: 1.0 - score for code, score in out.items()} if meta.polarity == "negative" else out

    ordered = sorted(set(allowed_codes))
    if len(ordered) == 1:
        base = {ordered[0]: 1.0}
    else:
        denom = float(len(ordered) - 1)
        base = {code: idx / denom for idx, code in enumerate(ordered)}
    return {code: 1.0 - base[code] for code in ordered} if meta.polarity == "negative" else base


def score_answer(raw_value: Any, meta: VariableMeta, stats: dict[str, Any]) -> tuple[float, bool]:
    number = parse_number(raw_value)
    if number is None:
        return 0.0, False

    as_int = int(number)
    if as_int in {SPECIAL_NO_RESPONSE, SPECIAL_SKIP_LOGIC}:
        return 0.0, False

    fmt = meta.variable_format.lower()
    if fmt == "boolean":
        if as_int not in {0, 1}:
            return 0.0, False
        score = 1.0 if as_int == 1 else 0.0
        if meta.polarity == "negative":
            score = 1.0 - score
        return score, True

    if fmt == "numeric":
        observed_min = stats["Observed_Min"]
        observed_max = stats["Observed_Max"]
        if observed_min == "" or observed_max == "" or float(observed_max) == float(observed_min):
            base = 1.0
        else:
            base = (float(number) - float(observed_min)) / (float(observed_max) - float(observed_min))
            base = max(0.0, min(1.0, base))
        if meta.polarity == "negative":
            base = 1.0 - base
        return float(base), True

    if fmt == "multiple choice":
        option_scores = build_multichoice_option_scores(meta)
        labels = parse_value_labels(meta.value_labels_raw)
        if is_missing_option_label(labels.get(as_int, "")):
            return 0.0, False
        if as_int in option_scores:
            return float(option_scores[as_int]), True
        return 0.0, False

    return 0.0, False


def load_domain_matches() -> pd.DataFrame:
    df = pd.read_csv(DOMAIN_MATCHES_PATH, dtype=object).fillna("")
    required = {"file", "year", "question_id", "domain", "weight_priority"}
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f"Domain match data missing columns: {sorted(missing)}")
    out = df[list(required)].drop_duplicates().copy()
    out["file"] = out["file"].map(collapse_spaces)
    out["year"] = out["year"].map(collapse_spaces)
    out["question_id"] = out["question_id"].map(collapse_spaces)
    out["domain"] = out["domain"].map(collapse_spaces)
    out["weight_priority"] = out["weight_priority"].map(collapse_spaces)
    return out


def aggregate_domain_scores(item_df: pd.DataFrame) -> pd.DataFrame:
    if item_df.empty:
        return pd.DataFrame()

    group_cols = [
        "agency_key",
        "state",
        "agency_id",
        "agency_name",
        "agency_type",
        "metro_area",
        "region",
        "survey_year",
        "domain_name",
    ]

    rows = []
    for keys, group in item_df.groupby(group_cols, dropna=False):
        included = group[group["included_in_domain_total"] == True].copy()
        observed_domain_score = None
        if not included.empty:
            observed_domain_score = float(included["unified_item_score"].astype(float).mean())

        row = {column: value for column, value in zip(group_cols, keys)}
        row.update(
            {
                "weight_priority": collapse_spaces(group["weight_priority"].iloc[0]) if "weight_priority" in group else "",
                "observed_domain_score": observed_domain_score,
                "included_item_count": int(len(included)),
            }
        )
        rows.append(row)

    return pd.DataFrame(rows)


def build_default_seed_table(domain_df: pd.DataFrame) -> pd.DataFrame:
    if domain_df.empty:
        return pd.DataFrame()

    years = sorted(domain_df["survey_year"].dropna().astype(str).unique().tolist())
    rows = []
    for year in years:
        year_df = domain_df[domain_df["survey_year"] == year]
        for domain_name in DEFAULT_DOMAIN_ORDER:
            subset = year_df[
                (year_df["domain_name"] == domain_name)
                & year_df["observed_domain_score"].notna()
            ].copy()
            if not subset.empty:
                default_value = float(subset["observed_domain_score"].astype(float).median())
                criterion = "median_observed_domain_score_same_year"
                is_policy_fallback = False
            else:
                default_value = 0.0
                criterion = "policy_fallback_zero_no_scored_agencies"
                is_policy_fallback = True

            rows.append(
                {
                    "survey_year": year,
                    "domain_name": domain_name,
                    "default_value": round(default_value, 6),
                    "criterion": criterion,
                    "scored_agency_count": int(subset["agency_key"].nunique()),
                    "is_policy_fallback": is_policy_fallback,
                }
            )

    return pd.DataFrame(rows)


def compute_default_values_for_year(
    survey_documents: list[dict[str, Any]],
    uploaded_rows: list[dict[str, Any]],
    state_name: str,
) -> list[dict[str, Any]]:
    if not survey_documents:
        return []

    rows_by_doc = {}
    for row in uploaded_rows:
        rows_by_doc.setdefault(row.get("document_id"), []).append(row)

    matches_df = load_domain_matches()
    item_rows = []

    for document in survey_documents:
        doc_rows = rows_by_doc.get(document["id"], [])
        if not doc_rows:
            continue

        metadata_rows = [
            row.get("row_data", {})
            for row in doc_rows
            if row.get("sheet_role") == "dictionary" and row.get("row_data")
        ]
        answer_rows = [
            row.get("row_data", {})
            for row in doc_rows
            if row.get("sheet_role") == "answers" and row.get("row_data")
        ]

        if not metadata_rows or not answer_rows:
            continue

        answer_df = pd.DataFrame(answer_rows).fillna("")
        filtered_answer_df = extract_target_state_rows(answer_df, state_name)
        if filtered_answer_df.empty:
            continue

        metadata = [
            VariableMeta(
                survey_file=meta_row.get("survey_file", document.get("original_name", "")),
                main_q_id=collapse_spaces(meta_row.get("main_q_id", "")),
                main_question=collapse_spaces(meta_row.get("main_question", "")),
                item_question=collapse_spaces(meta_row.get("item_question", "")),
                answer_variable=collapse_spaces(meta_row.get("answer_variable", "")),
                variable_format=collapse_spaces(meta_row.get("variable_format", "")),
                values_raw=norm_text(meta_row.get("values_raw", "")),
                value_labels_raw=norm_text(meta_row.get("value_labels_raw", "")),
                polarity=collapse_spaces(meta_row.get("polarity", "")) or "positive",
            )
            for meta_row in metadata_rows
            if meta_row.get("answer_variable")
        ]

        metadata_by_qid = {}
        for meta in metadata:
            metadata_by_qid.setdefault(meta.main_q_id, []).append(meta)

        file_name = Path(document.get("original_name") or document.get("filename") or "").name
        file_matches = matches_df[matches_df["file"].str.lower() == file_name.lower()].copy()
        if file_matches.empty:
            continue

        scored_metas = []
        seen = set()
        for match_row in file_matches.to_dict(orient="records"):
            domain = collapse_spaces(match_row["domain"])
            priority = collapse_spaces(match_row["weight_priority"])
            question_id = collapse_spaces(match_row["question_id"])
            for meta in metadata_by_qid.get(question_id, []):
                dedupe_key = (domain, question_id, meta.answer_variable, meta.item_question)
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                scored_metas.append((domain, priority, meta))

        if not scored_metas:
            continue

        unique_meta_by_var = {}
        for _, _, meta in scored_metas:
            unique_meta_by_var.setdefault(meta.answer_variable, meta)

        stats_by_var = {
            answer_variable: compute_variable_stats(filtered_answer_df, meta)
            for answer_variable, meta in unique_meta_by_var.items()
            if answer_variable in filtered_answer_df.columns
        }

        survey_year = str(document.get("survey_year") or "")
        for row_index, answer_row in filtered_answer_df.iterrows():
            agency = build_agency_identity(answer_row)
            for domain, priority, meta in scored_metas:
                if meta.answer_variable not in filtered_answer_df.columns:
                    continue
                stats = stats_by_var.get(meta.answer_variable, {"Observed_Min": "", "Observed_Max": "", "Allowed_Min": "", "Allowed_Max": ""})
                score, included = score_answer(answer_row[meta.answer_variable], meta, stats)
                item_rows.append(
                    {
                        **agency,
                        "survey_year": survey_year,
                        "domain_name": domain,
                        "weight_priority": priority,
                        "included_in_domain_total": included,
                        "unified_item_score": score,
                        "source_row_index": int(row_index),
                    }
                )

    item_df = pd.DataFrame(item_rows)
    if item_df.empty:
        return []

    domain_df = aggregate_domain_scores(item_df)
    if domain_df.empty:
        return []

    default_df = build_default_seed_table(domain_df)
    if default_df.empty:
        return []

    survey_year = str(survey_documents[0].get("survey_year") or "")
    results = []
    year_df = default_df[default_df["survey_year"] == survey_year]
    for domain_name in DEFAULT_DOMAIN_ORDER:
        subset = year_df[year_df["domain_name"] == domain_name]
        if subset.empty:
            continue
        row = subset.iloc[0]
        results.append(
            {
                "survey_year": survey_year,
                "state": state_name,
                "domain_name": domain_name,
                "default_value": float(row["default_value"]),
                "criterion": row["criterion"],
                "scored_agency_count": int(row["scored_agency_count"]),
                "is_policy_fallback": bool(row["is_policy_fallback"]),
            }
        )

    return results
