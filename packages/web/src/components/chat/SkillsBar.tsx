import { useSkillsStore } from "../../stores/skills";
import {
  Sparkles,
  FileSpreadsheet,
  BarChart3,
  Merge,
  CheckCircle2,
  Table2,
} from "lucide-react";
import type { ReactNode } from "react";

/** Map skill names to icons and friendly labels */
const SKILL_UI: Record<string, { icon: ReactNode; label: string }> = {
  "data-cleaning": { icon: <Sparkles size={14} />, label: "Clean Data" },
  "excel-merge": { icon: <Merge size={14} />, label: "Merge Files" },
  "financial-report": {
    icon: <FileSpreadsheet size={14} />,
    label: "Report",
  },
  "chart-generator": { icon: <BarChart3 size={14} />, label: "Chart" },
  "pivot-table": { icon: <Table2 size={14} />, label: "Pivot Table" },
  "data-validation": {
    icon: <CheckCircle2 size={14} />,
    label: "Validate",
  },
};

interface SkillsBarProps {
  onInvokeSkill: (skillName: string) => void;
  disabled?: boolean;
}

export function SkillsBar({ onInvokeSkill, disabled }: SkillsBarProps) {
  const skills = useSkillsStore((s) => s.skills);
  const enabledSkills = skills.filter((s) => s.enabled);

  if (enabledSkills.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 overflow-x-auto">
      <span className="text-xs text-[var(--muted-foreground)] mr-1 shrink-0">
        Workflows:
      </span>
      {enabledSkills.map((skill) => {
        const ui = SKILL_UI[skill.name];
        return (
          <button
            key={skill.name}
            onClick={() => onInvokeSkill(skill.name)}
            disabled={disabled}
            title={skill.description}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {ui?.icon}
            {ui?.label ?? skill.name}
          </button>
        );
      })}
    </div>
  );
}
