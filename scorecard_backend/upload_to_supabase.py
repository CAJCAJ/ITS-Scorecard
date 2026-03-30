import os
import pandas as pd
from supabase import create_client
import math

SUPABASE_URL = "https://ivustulljgjkhpikzitj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2dXN0dWxsamdqa2hwaWt6aXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MTA0ODksImV4cCI6MjA4OTM4NjQ4OX0.0sz-uap_Xvv9v6cpXdfsVyGa5fqfo_2ATr27aJ7eM0M"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

FILES = {
    "tx_bills": os.path.join(BASE_DIR, "TX Categorized Legislation bills.xlsx"),
    "nj_bills": os.path.join(BASE_DIR, "NJ Categorized Legislation bills.xlsx"),
    "tx_state_data": os.path.join(BASE_DIR, "data", "states", "Texas.xlsx"),
    "nj_state_data": os.path.join(BASE_DIR, "data", "states", "New Jersey.xlsx"),
}

COLUMN_MAP = {
    "Title": "title",
    "Bill Info": "bill_info",
    "Author": "author",
    "Version": "version",
    "Date": "date",
    "Vehicle Type": "vehicle_type",
    "State": "state",
    "Synopsis": "synopsis",
    "Category": "category",
}

def clean_value(val):
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    if hasattr(val, 'date'):  # pandas Timestamp
        return val.date().isoformat()
    return val

def upload(table, filepath):
    print(f"Reading {filepath}...")
    df = pd.read_excel(filepath)
    df = df.rename(columns=COLUMN_MAP)

    # Keep only columns that exist in the table
    valid_cols = [c for c in COLUMN_MAP.values() if c in df.columns]
    df = df[valid_cols]

    rows = []
    for _, row in df.iterrows():
        rows.append({col: clean_value(row[col]) for col in valid_cols})

    # Upload in batches of 500
    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        result = supabase.table(table).insert(batch).execute()
        print(f"  Inserted rows {i + 1}–{i + len(batch)}")

    print(f"Done uploading to {table}. Total rows: {len(rows)}\n")

for table, filepath in FILES.items():
    upload(table, filepath)

print("All data uploaded successfully.")
