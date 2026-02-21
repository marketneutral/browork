---
name: chart-generator
description: Create charts and visualizations from data files and save them as images.
---

# Chart Generator

Create charts and visualizations from the target data file(s).

## Steps

1. Read the input data file and understand its structure
2. Determine the most appropriate chart type based on the data:
   - Time series → line chart
   - Categories → bar chart
   - Proportions → pie chart
   - Correlations → scatter plot
3. Ask the user for preferences if the chart type is ambiguous
4. Generate the chart using Python (matplotlib or similar)
5. Apply clean, professional formatting:
   - Clear axis labels and title
   - Legend if multiple series
   - Grid lines for readability
   - Appropriate color palette
6. Save the chart as a PNG image in the output/ directory
7. Describe the chart and key takeaways to the user

## Rules

- Never modify original files — write charts to the output/ directory
- Use a professional, clean visual style (avoid 3D effects, excessive colors)
- Label all axes with units where applicable
- Use readable font sizes (minimum 10pt for labels)
- Include a descriptive title on every chart
- If the dataset is too large to visualize directly, aggregate or sample it first
- Save at 150 DPI minimum for readability
