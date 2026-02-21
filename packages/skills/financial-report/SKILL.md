---
name: financial-report
description: Generate summary reports with key financial metrics including YoY growth, QoQ changes, and margin calculations.
---

# Financial Report

Generate a financial summary report from the target data file(s).

## Steps

1. Read the input data file(s) and identify financial columns (revenue, cost, profit, etc.)
2. Detect the time dimension (date, quarter, year) and group data accordingly
3. Calculate key metrics:
   - Period totals and averages
   - Year-over-Year (YoY) growth rates
   - Quarter-over-Quarter (QoQ) changes
   - Margins (gross margin, operating margin) if cost data is available
4. Generate a formatted summary table with the calculated metrics
5. Highlight notable trends (largest growth, declines, outliers)
6. Save the report as a Markdown file in output/ (e.g., report_<dataset>.md)
7. Optionally save the underlying calculations as a CSV for further analysis

## Rules

- Never modify original files — write reports to the output/ directory
- Format all percentages to 1 decimal place (e.g., 12.3%)
- Format currency with commas and 2 decimal places (e.g., 1,234,567.89)
- Use negative signs (not parentheses) for negative values
- Clearly label the time period and currency units in the report
- If the data lacks enough periods for YoY/QoQ, note this and skip those calculations
- When data is ambiguous, state assumptions clearly in the report
