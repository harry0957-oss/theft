# Financial Tracker

This Streamlit application lets you import multiple bank statement CSV files, categorise your transactions, and analyse spending over custom date ranges or payday cycles.

## Features

- Upload any number of CSV statements that share the following columns: `Transaction Date`, `Transaction Type`, `Sort Code`, `Account Number`, `Transaction Description`, `Debit Amount`, `Credit Amount`, and `Balance`.
- Delete previously imported files to remove their transactions from the analysis.
- Bulk or individually categorise transactions with custom categories.
- Filter by date range and category to review spending and income.
- Visualise category totals and daily debit/credit trends.
- Review a payday cycle (payday to the day before the next payday) to assess monthly financial health.

## Getting started

1. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Run the Streamlit app:
   ```bash
   streamlit run app.py
   ```

3. Open the provided URL in your browser, upload CSV files, and begin categorising and analysing your transactions.

## CSV format

Ensure your CSV files use `DD/MM/YYYY` for the transaction date and contain the columns listed above. Monetary values can include the `£` symbol and commas; they are cleaned during import.
