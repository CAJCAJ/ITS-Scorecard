"""Normalize uploaded benefit/cost records for the scorecard API."""

from collections import Counter


BC_COMPONENT_LABELS = {
    "bc_existing_mobility_benefit": "Existing Mobility Benefit",
    "bc_existing_safety_benefit": "Existing Safety Benefit",
    "bc_existing_environment_benefit": "Existing Environmental Benefit",
    "bc_new_mobility_benefit": "New Mobility Benefit",
    "bc_new_safety_benefit": "New Safety Benefit",
    "bc_new_environment_benefit": "New Environmental Benefit",
    "bc_existing_om_cost_total": "Existing ITS O&M Cost",
    "bc_new_cost_total": "New ITS Deployment Cost",
}

BC_COMPONENT_KEYS = tuple(BC_COMPONENT_LABELS)
BC_COST_COMPONENT_KEYS = {
    "bc_existing_om_cost_total",
    "bc_new_cost_total",
}
BC_PROVENANCE_TYPES = {
    "Exact_Dataset",
    "Authorized_Derived",
    "Mock_Default",
}


def _get(record, *keys):
    for key in keys:
        if key in record and record[key] not in (None, ""):
            return record[key]
    return None


def _text(value):
    return str(value or "").strip()


def _parse_bool(value):
    if isinstance(value, bool):
        return value
    return _text(value).lower() in {"1", "true", "yes", "y"}


def _split_values(value):
    if isinstance(value, list):
        parts = value
    else:
        parts = _text(value).replace("\n", ";").split(";")
    return [part.strip() for part in parts if str(part).strip()]


def _unique(values):
    return list(dict.fromkeys(value for value in values if value))


def is_long_benefit_cost_record(record):
    return _text(_get(record, "component_key", "Component Key")) in BC_COMPONENT_LABELS


def validate_long_benefit_cost_records(records):
    """Return human-readable validation errors for normalized long-format rows."""
    if not records or not any(
        _text(_get(row, "component_key", "Component Key")) for row in records
    ):
        return []

    errors = []
    groups = {}
    for row_number, row in enumerate(records, start=2):
        state = _text(_get(row, "state", "State"))
        year = _text(_get(row, "survey_year", "Survey Year"))
        component_key = _text(_get(row, "component_key", "Component Key"))
        provenance_type = _text(_get(row, "provenance_type", "Provenance Type"))
        value = _get(row, "value", "Value")

        if not state or not year:
            errors.append(f"Row {row_number} is missing state or survey_year.")
            continue
        if component_key not in BC_COMPONENT_LABELS:
            errors.append(f"Row {row_number} has an unsupported component_key.")
            continue
        try:
            if float(str(value).replace(",", "").replace("$", "")) < 0:
                raise ValueError
        except (TypeError, ValueError):
            errors.append(f"Row {row_number} has an invalid nonnegative value.")
        if provenance_type not in BC_PROVENANCE_TYPES:
            errors.append(f"Row {row_number} has an unsupported provenance_type.")
        if _parse_bool(_get(row, "review_required", "Review Required")) != (
            provenance_type == "Mock_Default"
        ):
            errors.append(
                f"Row {row_number} review_required must be true only for Mock_Default values."
            )
        groups.setdefault((state.lower(), year), []).append(component_key)

    expected = set(BC_COMPONENT_KEYS)
    for (state, year), component_keys in groups.items():
        found = set(component_keys)
        duplicates = sorted(key for key, count in Counter(component_keys).items() if count > 1)
        missing = sorted(expected - found)
        if missing:
            errors.append(f"{state} {year} is missing components: {', '.join(missing)}.")
        if duplicates:
            errors.append(f"{state} {year} has duplicate components: {', '.join(duplicates)}.")

    return errors[:25]


def aggregate_long_benefit_cost_records(records):
    """Collapse the eight normalized component rows into the legacy scoring shape."""
    if not records or not all(is_long_benefit_cost_record(row) for row in records):
        return None

    aggregated = {
        "state": _get(records[0], "state", "State"),
        "survey_year": _get(records[0], "survey_year", "Survey Year"),
        "dataset_version": _get(records[0], "dataset_version", "Dataset Version"),
    }
    details = []
    all_technologies = []
    benefit_urls = []
    cost_urls = []
    derivation_methods = []

    for row in records:
        component_key = _text(_get(row, "component_key", "Component Key"))
        aggregated[component_key] = _get(row, "value", "Value")
        technologies = _split_values(_get(row, "technologies", "Technologies"))
        source_url = _text(_get(row, "source_url", "Source URL"))
        derivation_method = _text(_get(row, "derivation_method", "Derivation Method"))
        all_technologies.extend(technologies)
        if source_url:
            (cost_urls if component_key in BC_COST_COMPONENT_KEYS else benefit_urls).append(
                source_url
            )
        if derivation_method:
            derivation_methods.append(derivation_method)

        details.append(
            {
                "component_key": component_key,
                "component_label": _text(
                    _get(row, "component_label", "Component Label")
                )
                or BC_COMPONENT_LABELS[component_key],
                "value": _get(row, "value", "Value"),
                "provenance_type": _text(
                    _get(row, "provenance_type", "Provenance Type")
                ),
                "review_required": _parse_bool(
                    _get(row, "review_required", "Review Required")
                ),
                "evidence_scope": _text(_get(row, "evidence_scope", "Evidence Scope")),
                "source_title": _text(_get(row, "source_title", "Source Title")),
                "source_url": source_url,
                "source_publication_year": _get(
                    row, "source_publication_year", "Source Publication Year"
                ),
                "source_value_note": _text(
                    _get(row, "source_value_note", "Source Value Note")
                ),
                "derivation_method": derivation_method,
                "technologies": technologies,
                "original_mock_value": _get(
                    row, "original_mock_value", "Original Mock Value"
                ),
                "mock_default_method": _text(
                    _get(row, "mock_default_method", "Mock Default Method")
                ),
                "notes": _text(_get(row, "notes", "Notes")),
            }
        )

    provenance_counts = dict(Counter(item["provenance_type"] for item in details))
    aggregated.update(
        {
            "evidence_level": "; ".join(provenance_counts),
            "benefit_source_urls": "; ".join(_unique(benefit_urls)),
            "cost_source_urls": "; ".join(_unique(cost_urls)),
            "conversion_basis": "; ".join(_unique(derivation_methods)),
            "source_notes": "Component-level source, scope, and review metadata are included.",
            "_component_details": details,
            "_technologies_considered": _unique(all_technologies),
            "_provenance_counts": provenance_counts,
            "_review_required": any(item["review_required"] for item in details),
            "_review_component_keys": [
                item["component_key"] for item in details if item["review_required"]
            ],
        }
    )
    return aggregated
