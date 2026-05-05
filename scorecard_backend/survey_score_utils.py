import re


def parse_positive_number(value):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    return numeric if numeric > 0 else 0.0


def parse_integer_count(value):
    return int(parse_positive_number(value))


def parse_percentage_fraction(value):
    numeric = parse_positive_number(value)
    return min(numeric, 100.0) / 100.0


def parse_first_number(value):
    if value is None:
        return 0.0
    match = re.search(r"(\d+(\.\d+)?)", str(value))
    return float(match.group(1)) if match else 0.0


def parse_money(value):
    if value is None:
        return 0.0

    text = str(value).strip()
    if not text:
        return 0.0

    multiplier = 1.0
    lowered = text.lower()
    if "million" in lowered or lowered.endswith("m"):
        multiplier = 1_000_000.0
    elif "billion" in lowered or lowered.endswith("b"):
        multiplier = 1_000_000_000.0
    elif "thousand" in lowered or lowered.endswith("k"):
        multiplier = 1_000.0

    cleaned = re.sub(r"[^0-9.\-]", "", text)
    if not cleaned or cleaned in {"-", ".", "-."}:
        return 0.0

    try:
        return max(float(cleaned) * multiplier, 0.0)
    except ValueError:
        return 0.0


def count_selected(values):
    return len(values) if isinstance(values, list) else 0
