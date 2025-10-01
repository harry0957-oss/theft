import io
import os
import uuid
from typing import Dict, List, Optional

import pandas as pd
from flask import (
    Flask,
    flash,
    get_flashed_messages,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

REQUIRED_COLUMNS = {
    "Transaction Date": "Transaction Date",
    "Transaction Type": "Transaction Type",
    "Sort Code": "Sort Code",
    "Account Number": "Account Number",
    "Transaction Description": "Transaction Description",
    "Debit Amount": "Debit Amount",
    "Credit Amount": "Credit Amount",
    "Balance": "Balance",
}

DATE_COLUMN = "Transaction Date"
SESSION_DATA: Dict[str, pd.DataFrame] = {}


def _format_currency(value: float) -> str:
    return f"{value:,.2f}"


def _read_csv(content: bytes, source_name: str) -> pd.DataFrame:
    buffer = io.BytesIO(content)
    df = pd.read_csv(buffer)
    df.columns = [col.strip() for col in df.columns]

    missing_columns = [name for name in REQUIRED_COLUMNS if name not in df.columns]
    if missing_columns:
        raise ValueError(
            "CSV is missing required columns: " + ", ".join(missing_columns)
        )

    df[DATE_COLUMN] = pd.to_datetime(df[DATE_COLUMN], dayfirst=True, errors="coerce")
    if df[DATE_COLUMN].isna().any():
        raise ValueError("Some transaction dates could not be parsed. Ensure dates use DD/MM/YYYY format.")

    for column in ["Debit Amount", "Credit Amount", "Balance"]:
        df[column] = (
            df[column]
            .astype(str)
            .str.replace(",", "")
            .str.replace("£", "", regex=False)
            .str.strip()
        )
        df[column] = pd.to_numeric(df[column], errors="coerce").fillna(0.0)

    df["Source"] = source_name
    return df


def _get_session_id() -> str:
    if "session_id" not in session:
        session["session_id"] = uuid.uuid4().hex
    return session["session_id"]


def _get_transactions() -> Optional[pd.DataFrame]:
    session_id = _get_session_id()
    return SESSION_DATA.get(session_id)


def _store_transactions(data: pd.DataFrame) -> None:
    session_id = _get_session_id()
    SESSION_DATA[session_id] = data


def _clear_transactions() -> None:
    session_id = _get_session_id()
    SESSION_DATA.pop(session_id, None)


app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key")


@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        files = request.files.getlist("files")
        valid_files = [file for file in files if file and file.filename]

        if not valid_files:
            flash("Please select at least one CSV file to upload.", "error")
            return redirect(url_for("index"))

        frames: List[pd.DataFrame] = []
        for file in valid_files:
            try:
                frames.append(_read_csv(file.read(), file.filename))
            except Exception as exc:  # pylint: disable=broad-except
                flash(f"Could not import {file.filename}: {exc}", "error")

        if not frames:
            return redirect(url_for("index"))

        combined = pd.concat(frames, ignore_index=True)
        combined.sort_values(DATE_COLUMN, inplace=True)
        _store_transactions(combined)
        flash(f"Imported {len(frames)} file(s) successfully.", "success")
        return redirect(url_for("index"))

    transactions = _get_transactions()
    selected_type = request.args.get("transaction_type", "all")
    filtered = None
    transaction_types: List[str] = []
    summary = None
    table_rows: List[Dict[str, str]] = []

    if transactions is not None and not transactions.empty:
        transaction_types = sorted(transactions["Transaction Type"].dropna().unique())
        filtered = transactions.copy()
        if selected_type != "all":
            filtered = filtered[filtered["Transaction Type"] == selected_type]

        if filtered.empty:
            flash("No transactions match the selected filters.", "info")
        else:
            debit_total = filtered["Debit Amount"].sum()
            credit_total = filtered["Credit Amount"].sum()
            summary = {
                "debit": _format_currency(debit_total),
                "credit": _format_currency(credit_total),
                "net": _format_currency(credit_total - debit_total),
            }

            display = filtered.copy()
            display[DATE_COLUMN] = display[DATE_COLUMN].dt.strftime("%d/%m/%Y")
            display["Debit Amount"] = display["Debit Amount"].map(_format_currency)
            display["Credit Amount"] = display["Credit Amount"].map(_format_currency)
            display["Balance"] = display["Balance"].map(_format_currency)

            columns = [
                DATE_COLUMN,
                "Transaction Type",
                "Transaction Description",
                "Debit Amount",
                "Credit Amount",
                "Balance",
                "Source",
            ]
            table_rows = display[columns].to_dict(orient="records")

    return render_template(
        "index.html",
        transactions_available=transactions is not None and not transactions.empty,
        transaction_types=transaction_types,
        selected_type=selected_type,
        summary=summary,
        table_rows=table_rows,
        messages=get_flashed_messages(with_categories=True),
    )


@app.post("/clear")
def clear_transactions():
    _clear_transactions()
    flash("Cleared imported transactions.", "success")
    return redirect(url_for("index"))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=True)
