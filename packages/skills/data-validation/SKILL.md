---
name: data-validation
description: Check data files for missing values, outliers, format inconsistencies, and other quality issues.
---

# Data Validation

Validate the target data file for quality issues and inconsistencies.

## Steps

1. Read the input data file and detect its structure
2. Check for missing values: report count and percentage per column
3. Check for duplicate rows and report findings
4. Validate data types: ensure numeric columns contain only numbers, dates are valid, etc.
5. Detect outliers in numeric columns (values beyond 3 standard deviations)
6. Check for format inconsistencies within columns (mixed date formats, inconsistent casing)
7. Validate referential integrity if multiple related columns exist (e.g., region and sub-region)
8. Generate a validation report summarizing all findings with severity levels:
   - **Error**: Data that is clearly wrong (invalid dates, negative counts)
   - **Warning**: Potential issues (outliers, missing values)
   - **Info**: Observations (unique value counts, data distribution)
9. Save the report to the output/ directory as a Markdown file

## Rules

- Never modify original files — this skill only reports issues, it does not fix them
- Suggest the Data Cleaning workflow for fixing identified issues
- Report row numbers for specific issues so the user can locate them
- For large files (>10,000 rows), sample and note the sampling approach
- Flag columns that are entirely empty
- Detect common financial data issues: negative revenues, future dates, currency symbol mixing
