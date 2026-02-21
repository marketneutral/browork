---
name: data-cleaning
description: Clean and standardize financial data files. Handles column renaming, date normalization, currency formatting, and deduplication.
---

# Data Cleaning

Clean and standardize the target data file(s) in the working directory.

## Steps

1. Read the input file and detect its format (CSV, XLSX, TSV, etc.)
2. Report a summary of the file: row count, column names, data types detected
3. Standardize column headers to snake_case (e.g., "Revenue (USD)" → "revenue_usd")
4. Normalize date columns to YYYY-MM-DD format
5. Format currency/numeric columns: remove symbols, ensure consistent decimal places
6. Remove fully duplicate rows; report how many were removed
7. Identify and flag rows with missing values in key columns
8. Save the cleaned output to the output/ directory with a descriptive filename (e.g., cleaned_<original_name>.csv)
9. Print a summary of all changes made

## Rules

- Never modify the original file — always write to the output/ directory
- Preserve all original columns unless the user explicitly asks to drop some
- If the file has multiple sheets (XLSX), process the first sheet unless told otherwise
- Use UTF-8 encoding for all output files
- If column headers are missing, auto-generate them as col_1, col_2, etc.
- When in doubt about a transformation, ask the user before proceeding
