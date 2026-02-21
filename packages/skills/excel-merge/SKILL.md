---
name: excel-merge
description: Merge multiple Excel or CSV files by shared key columns such as date, ticker, or ID.
---

# Excel / CSV Merge

Merge two or more data files by matching on shared key columns.

## Steps

1. Identify all input files to merge (from user message or working directory)
2. Read each file and report column names and row counts
3. Detect shared key columns across the files (e.g., date, ticker, id)
4. Ask the user to confirm the merge key if ambiguous
5. Perform the merge (default: outer join to preserve all rows)
6. Report any rows that did not match across files
7. Save the merged output to output/ with a descriptive filename
8. Print a summary: total rows, columns, and any unmatched records

## Rules

- Never modify original files — write merged output to the output/ directory
- Default to outer join; use inner join only if the user requests it
- If key columns have different names across files, map them (e.g., "Date" ↔ "date" ↔ "trade_date")
- Handle date format mismatches across files (normalize before merging)
- Preserve column order: key columns first, then columns from each file in input order
- Add a source_file column if the user asks to track which file each row came from
