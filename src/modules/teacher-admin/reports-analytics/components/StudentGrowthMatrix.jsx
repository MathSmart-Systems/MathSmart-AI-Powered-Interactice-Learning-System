import { Badge } from "@/components/ui/badge";
import { monitoringStatus } from "../utils/labels";

export function StudentGrowthMatrix({ dashboard }) {
  const learners = dashboard?.priority_learners ?? [];

  if (learners.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="border-b border-border p-6">
          <h3 className="font-display text-base font-semibold text-foreground">
            Student Growth Matrix
          </h3>
          <p className="text-xs text-muted-foreground">
            No learner data available yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="border-b border-border p-6">
        <h3 className="font-display text-base font-semibold text-foreground">
          Priority Learners
        </h3>
        <p className="text-xs text-muted-foreground">
          Learners who need support or have active interventions.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-muted-foreground">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-semibold">Student</th>
              <th scope="col" className="px-4 py-3 font-semibold">Section</th>
              <th scope="col" className="px-4 py-3 text-center font-semibold">Diagnostic</th>
              <th scope="col" className="px-4 py-3 text-center font-semibold">Current</th>
              <th scope="col" className="px-4 py-3 text-center font-semibold">Competencies Mastered</th>
              <th scope="col" className="px-4 py-3 text-center font-semibold">Modules Done</th>
              <th scope="col" className="px-4 py-3 text-center font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {learners.map((row) => {
              const status = monitoringStatus(row.monitoring_status);
              return (
                <tr key={row.student_id} className="hover:bg-secondary/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{row.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">{row.learner_id}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-muted-foreground">
                    {row.section_name}
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-medium">
                    {row.diagnostic_score != null ? `${row.diagnostic_score}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={
                        row.overall_mastery != null && row.overall_mastery >= 80
                          ? "font-mono font-bold text-xs text-emerald-700"
                          : row.overall_mastery != null && row.overall_mastery >= 50
                            ? "font-mono font-bold text-xs text-amber-700"
                            : "font-mono font-bold text-xs text-rose-700"
                      }
                    >
                      {row.overall_mastery != null ? `${row.overall_mastery}%` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-medium">
                    {row.competencies_mastered ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-medium">
                    {row.modules_completed_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
