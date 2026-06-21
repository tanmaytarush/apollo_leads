import { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  iconClass?: string;
  valueClass?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  iconClass = "bg-surface-overlay text-gray-400",
  valueClass = "text-white",
  className = "",
}: StatCardProps) {
  return (
    <div
      className={`bg-surface-raised border border-surface-border rounded-2xl p-5 shadow-card
        flex items-center gap-4 transition-colors ${className}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">{label}</p>
        <p className={`text-[2rem] font-semibold tabular-nums leading-tight mt-0.5 ${valueClass}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
