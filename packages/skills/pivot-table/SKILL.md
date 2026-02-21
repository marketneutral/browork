---
name: pivot-table
description: Create pivot-table-style summaries from flat data with customizable rows, columns, and aggregations.
---

# Pivot Table

Create a pivot-table summary from the target data file.

## Steps

1. Read the input data file and report available columns
2. Ask the user which columns to use for:
   - Row grouping (e.g., region, product)
   - Column grouping (e.g., quarter, month)
   - Values to aggregate (e.g., revenue, units)
   - Aggregation function (sum, average, count, min, max)
3. If the user has already specified these in their message, proceed directly
4. Build the pivot table with the specified configuration
5. Add row and column totals (grand total)
6. Format numbers appropriately (currency, percentages, integers)
7. Save the pivot table as a CSV in the output/ directory
8. Display the pivot table in a readable format

## Rules

- Never modify original files — write results to the output/ directory
- Default aggregation is SUM unless the user specifies otherwise
- Include grand totals for both rows and columns
- Handle missing values gracefully (treat as 0 for sums, exclude from averages)
- If the pivot would produce more than 50 columns, warn the user and suggest alternatives
- Sort rows by the row grouping column by default
