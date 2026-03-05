import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
  subtext?: string;
}

export function StatCard({ label, value, icon: Icon, color = "text-primary", subtext }: StatCardProps) {
  return (
    <div className="glass rounded-xl p-5 animate-fade-in-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-foreground-secondary">{label}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
          {subtext && <p className="mt-1 text-xs text-foreground-tertiary">{subtext}</p>}
        </div>
        <div className={`rounded-lg bg-surface-glass p-2.5 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
