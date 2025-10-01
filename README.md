# Financial Tracker

This Flask application lets you import one or more bank statement CSV files, filter transactions by type (for example, `BGC` fo
r salary payments or `FPI` for standing orders), and review income/spending totals directly in the browser.

## Features

- Upload any number of CSV statements that share the following columns: `Transaction Date`, `Transaction Type`, `Sort Code`, `Ac
count Number`, `Transaction Description`, `Debit Amount`, `Credit Amount`, and `Balance`.
- See a running table of all imported transactions and the original file each row came from.
- Filter by transaction type to focus on deposits such as BGC salary payments or FPI transfers.
- View instant totals for money received, money spent, and the resulting net figure for the filtered data.
- Clear imported data at any time without restarting the server.

## Getting started

1. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Run the Flask app:
   ```bash
   flask --app app.py run --host=0.0.0.0 --port=8000
   ```

3. Open `http://localhost:8000` in your browser, upload CSV files, and filter transactions by type.

## CSV format

Ensure your CSV files use `DD/MM/YYYY` for the transaction date and contain the columns listed above. Monetary values can includ
e the `£` symbol and commas; they are cleaned during import.
