type BadgeVariant = "success" | "warning" | "error" | "neutral" | "info";

const styles: Record<BadgeVariant, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  neutral: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

export function Badge({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

export function statusBadge(status: string) {
  const s = status.toUpperCase();
  if (s === "SENT") return <Badge variant="success">Sent</Badge>;
  if (s === "FAILED") return <Badge variant="error">Failed</Badge>;
  if (s === "SKIPPED") return <Badge variant="neutral">Skipped</Badge>;
  if (s === "PENDING") return <Badge variant="warning">Pending</Badge>;
  return <Badge variant="neutral">{status}</Badge>;
}

export function yesNoBadge(value: string) {
  return value.toUpperCase() === "YES" ? (
    <Badge variant="success">Yes</Badge>
  ) : (
    <Badge variant="neutral">No</Badge>
  );
}
