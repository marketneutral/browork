import { Sparkles } from "lucide-react";

interface SkillBadgeProps {
  skill: string;
  label: string;
}

/** Friendly names for skill display */
const SKILL_LABELS: Record<string, string> = {
  "data-cleaning": "Clean Data",
  "excel-merge": "Merge Files",
  "financial-report": "Financial Report",
  "chart-generator": "Chart Generator",
  "pivot-table": "Pivot Table",
  "data-validation": "Data Validation",
};

export function SkillBadge({ skill, label }: SkillBadgeProps) {
  const displayLabel = SKILL_LABELS[skill] ?? label ?? skill;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-medium mb-1 animate-fade-in">
      <Sparkles size={12} />
      Workflow: {displayLabel}
    </span>
  );
}
