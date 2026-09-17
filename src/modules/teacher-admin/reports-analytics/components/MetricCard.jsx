import { cn } from "cn";

export function MetricCard({ label, value, icon: Icon, iconColor, detail, detailColor }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="mb-2 flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-semibold">{label}</span>
        {Icon ? <Icon className={cn("size-4", iconColor)} aria-hidden="true" /> : null}
      </div>
      <p className="font-display text-3xl font-extrabold text-foreground">{value}</p>
      {detail ? (
        <p className={cn("mt-1 text-xs font-medium", detailColor ?? "text-muted-foreground")}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}
