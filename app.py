import hashlib
import io
from datetime import timedelta
from typing import Dict, List

import altair as alt
import pandas as pd
import streamlit as st
from streamlit.runtime.uploaded_file_manager import UploadedFile

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

CATEGORY_COLUMN = "Category"
SOURCE_ID_COLUMN = "Source Id"
SOURCE_NAME_COLUMN = "Source"
DATE_COLUMN = "Transaction Date"


@st.cache_data(show_spinner=False)
def _read_csv(content: bytes) -> pd.DataFrame:
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

    df[CATEGORY_COLUMN] = "Uncategorized"
    return df


def _initialise_state() -> None:
    if "transactions" not in st.session_state:
        st.session_state.transactions = pd.DataFrame(columns=list(REQUIRED_COLUMNS) + [CATEGORY_COLUMN, SOURCE_ID_COLUMN, SOURCE_NAME_COLUMN])
    if "sources" not in st.session_state:
        st.session_state.sources: Dict[str, str] = {}
    if "custom_categories" not in st.session_state:
        st.session_state.custom_categories: List[str] = []


def _store_uploaded_files(files: List[UploadedFile]) -> None:
    for uploaded in files:
        content = uploaded.getvalue()
        file_hash = hashlib.md5(content).hexdigest()
        if file_hash in st.session_state.sources:
            continue

        try:
            df = _read_csv(content)
        except Exception as exc:
            st.error(f"Could not import {uploaded.name}: {exc}")
            continue

        df[SOURCE_ID_COLUMN] = file_hash
        df[SOURCE_NAME_COLUMN] = uploaded.name

        st.session_state.transactions = pd.concat(
            [st.session_state.transactions, df], ignore_index=True
        )
        st.session_state.sources[file_hash] = uploaded.name


def _delete_source(selected_name: str) -> None:
    for source_id, name in list(st.session_state.sources.items()):
        if name == selected_name:
            st.session_state.transactions = st.session_state.transactions[
                st.session_state.transactions[SOURCE_ID_COLUMN] != source_id
            ].reset_index(drop=True)
            del st.session_state.sources[source_id]
            break


def _category_options() -> List[str]:
    categories = set(st.session_state.transactions.get(CATEGORY_COLUMN, pd.Series()).unique())
    categories.update(st.session_state.custom_categories)
    categories.discard("Uncategorized")
    return ["Uncategorized", *sorted(cat for cat in categories if isinstance(cat, str))]


def _bulk_categorise(category: str, mask: pd.Series) -> None:
    st.session_state.transactions.loc[mask, CATEGORY_COLUMN] = category


def _render_summary(filtered: pd.DataFrame) -> None:
    debit_total = filtered["Debit Amount"].sum()
    credit_total = filtered["Credit Amount"].sum()
    net = credit_total - debit_total

    left, middle, right = st.columns(3)
    left.metric("Total Spent", f"£{debit_total:,.2f}")
    middle.metric("Total Received", f"£{credit_total:,.2f}")
    right.metric("Net", f"£{net:,.2f}")

    if not filtered.empty:
        by_category = (
            filtered.groupby(CATEGORY_COLUMN)["Debit Amount"].sum().reset_index().sort_values("Debit Amount", ascending=False)
        )
        by_category_chart = (
            alt.Chart(by_category)
            .mark_bar()
            .encode(x=alt.X("Debit Amount", title="Total Spent (£)"), y=alt.Y(CATEGORY_COLUMN, sort="-x"))
        )
        st.altair_chart(by_category_chart, use_container_width=True)

        trend_chart = (
            alt.Chart(
                filtered.assign(Date=filtered[DATE_COLUMN].dt.date)
                .groupby("Date")
                .agg({"Debit Amount": "sum", "Credit Amount": "sum"})
                .reset_index()
            )
            .transform_fold(["Debit Amount", "Credit Amount"], as_=["Type", "Amount"])
            .mark_line(point=True)
            .encode(x="Date:T", y="Amount:Q", color="Type:N")
        )
        st.altair_chart(trend_chart, use_container_width=True)

        category_breakdown = (
            filtered.groupby(CATEGORY_COLUMN)[["Debit Amount", "Credit Amount"]]
            .sum()
            .reset_index()
            .sort_values("Debit Amount", ascending=False)
        )
    else:
        st.info("No data available for the selected filters.")
        category_breakdown = pd.DataFrame(columns=[CATEGORY_COLUMN, "Debit Amount", "Credit Amount"])

    st.subheader("Category Breakdown")
    st.dataframe(category_breakdown, use_container_width=True)


_initialise_state()
st.set_page_config(page_title="Financial Tracker", layout="wide")
st.title("Financial Tracker")

st.sidebar.header("Data Management")
uploaded_files = st.sidebar.file_uploader(
    "Upload transaction CSV files",
    type=["csv"],
    accept_multiple_files=True,
)
if uploaded_files:
    _store_uploaded_files(uploaded_files)

if st.session_state.sources:
    source_to_delete = st.sidebar.selectbox(
        "Remove an imported file",
        ["-"] + list(st.session_state.sources.values()),
        key="delete_select",
    )
    if source_to_delete != "-" and st.sidebar.button("Delete selected file"):
        _delete_source(source_to_delete)
        st.sidebar.success(f"Removed {source_to_delete}")

if st.session_state.transactions.empty:
    st.info("Upload one or more CSV files to begin.")
    st.stop()

transactions = st.session_state.transactions.copy()
transactions[DATE_COLUMN] = pd.to_datetime(transactions[DATE_COLUMN])
transactions.sort_values(DATE_COLUMN, inplace=True)

st.sidebar.header("Filters")
min_date = transactions[DATE_COLUMN].min().date()
max_date = transactions[DATE_COLUMN].max().date()
default_start = max(min_date, max_date - timedelta(days=30))
default_range = (default_start, max_date)
date_range = st.sidebar.date_input(
    "Date range",
    value=default_range,
    min_value=min_date,
    max_value=max_date,
)
if not isinstance(date_range, tuple) or len(date_range) != 2:
    start_date, end_date = default_range
else:
    start_date, end_date = date_range

if start_date > end_date:
    start_date, end_date = end_date, start_date

category_options = _category_options()
selected_categories = st.sidebar.multiselect(
    "Categories",
    options=category_options,
    default=category_options,
)

with st.expander("Bulk categorise transactions"):
    new_category = st.text_input("Add a new category")
    if new_category:
        if new_category not in st.session_state.custom_categories:
            st.session_state.custom_categories.append(new_category)
        st.success(f"Added category '{new_category}'")

    available_categories = [cat for cat in _category_options() if cat != "Uncategorized"]
    if not available_categories:
        available_categories = ["Uncategorized"]

    selected_category = st.selectbox("Category to apply", options=available_categories)
    description_keyword = st.text_input(
        "Description contains (optional)",
        help="Apply the category to any transactions containing this text.",
    )
    transaction_type = st.selectbox(
        "Transaction type (optional)",
        options=["Any"] + sorted(transactions["Transaction Type"].unique().tolist()),
    )

    mask = pd.Series(True, index=transactions.index, dtype=bool)
    if description_keyword:
        mask &= transactions["Transaction Description"].str.contains(description_keyword, case=False, na=False)
    if transaction_type != "Any":
        mask &= transactions["Transaction Type"] == transaction_type

    st.write(f"Matching transactions: {int(mask.sum())}")
    if st.button("Apply category", disabled=mask.sum() == 0):
        _bulk_categorise(selected_category, mask)
        transactions = st.session_state.transactions.copy()
        transactions[DATE_COLUMN] = pd.to_datetime(transactions[DATE_COLUMN])
        transactions.sort_values(DATE_COLUMN, inplace=True)
        st.success("Category applied")

st.subheader("Categorise individually")
category_editor = st.data_editor(
    transactions[
        [
            DATE_COLUMN,
            "Transaction Description",
            "Transaction Type",
            "Debit Amount",
            "Credit Amount",
            CATEGORY_COLUMN,
            SOURCE_NAME_COLUMN,
        ]
    ],
    num_rows="fixed",
    hide_index=True,
    column_config={
        CATEGORY_COLUMN: st.column_config.SelectboxColumn(
            CATEGORY_COLUMN,
            options=_category_options(),
        )
    },
    key="category_editor",
)

st.session_state.transactions.loc[category_editor.index, CATEGORY_COLUMN] = category_editor[CATEGORY_COLUMN].values

transactions = st.session_state.transactions.copy()
transactions[DATE_COLUMN] = pd.to_datetime(transactions[DATE_COLUMN])
transactions.sort_values(DATE_COLUMN, inplace=True)

filtered_transactions = transactions[
    (transactions[DATE_COLUMN].dt.date >= start_date)
    & (transactions[DATE_COLUMN].dt.date <= end_date)
    & (transactions[CATEGORY_COLUMN].isin(selected_categories))
]

st.subheader("Filtered results")
st.dataframe(
    filtered_transactions[[
        DATE_COLUMN,
        "Transaction Type",
        "Transaction Description",
        "Debit Amount",
        "Credit Amount",
        CATEGORY_COLUMN,
        SOURCE_NAME_COLUMN,
    ]],
    use_container_width=True,
)

_render_summary(filtered_transactions)

st.subheader("Pay period view")
payday = st.date_input("Most recent payday", value=max_date)
cycle_length = st.number_input("Cycle length (days)", min_value=7, max_value=35, value=30)
period_start, period_end = payday, payday + timedelta(days=cycle_length - 1)

pay_period_mask = (
    (transactions[DATE_COLUMN].dt.date >= period_start)
    & (transactions[DATE_COLUMN].dt.date <= period_end)
)
pay_period_transactions = transactions[pay_period_mask]
st.write(f"Showing transactions from {period_start} to {period_end}")
st.dataframe(
    pay_period_transactions[[
        DATE_COLUMN,
        "Transaction Description",
        "Debit Amount",
        "Credit Amount",
        CATEGORY_COLUMN,
    ]],
    use_container_width=True,
)

if not pay_period_transactions.empty:
    _render_summary(pay_period_transactions)
else:
    st.info("No transactions in the selected pay period.")
