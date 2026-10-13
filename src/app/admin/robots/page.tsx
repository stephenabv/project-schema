import type { Metadata } from "next";
import { Suspense } from "react";
import { RobotForm, RobotPolicyForm } from "@/components/admin/robot-forms";
import { PageHeader } from "@/components/layout/page-header";
import { RobotArt, TierBadge } from "@/components/robots/robot-art";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { coinsPerMinute, paybackHours, type AdminRobot } from "@/lib/validation/robots";
import { FinanceAdminService } from "@/services/finance-admin";

export const metadata: Metadata = { title: "Robots" };

const STATUS_STYLES: Record<AdminRobot["status"], string> = {
  active: "bg-success-surface text-success-text",
  draft: "bg-warning-surface text-warning-text",
  inactive: "bg-background text-muted",
  archived: "bg-background text-muted",
};

export default function AdminRobotsPage() {
  return (
    <>
      <PageHeader
        title="Robots"
        description="Robot catalogue, pricing, earning rates and limits. Changes apply to new purchases; owned robots keep the rate they were bought with."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <RobotsContent />
      </Suspense>
    </>
  );
}

async function RobotsContent() {
  const { supabase } = await getAdminOrNotFound("/admin/robots");
  const finance = new FinanceAdminService(supabase);
  const [{ robots, policy }, activity] = await Promise.all([finance.listRobots(), finance.robotActivity(25)]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <CardTitle>Limits</CardTitle>
        <RobotPolicyForm policy={policy} />
      </Card>
      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-primary">New robot</summary>
          <div className="mt-4">
            <RobotForm />
          </div>
        </details>
      </Card>
      {robots.map((robot) => (
        <Card key={robot.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <RobotArt imageKey={robot.imageKey} tier={robot.tier} size="sm" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold text-foreground">{robot.name}</CardTitle>
                  <TierBadge tier={robot.tier} />
                </div>
                <p className="text-xs text-muted">
                  {formatCoins(robot.priceCoins)} · {formatCount(robot.coinsPerHour)} VC/h ({coinsPerMinute(robot.coinsPerHour)}/min,{" "}
                  {formatCount(robot.coinsPerHour * 24)}/day) · payback {formatCount(paybackHours(robot.priceCoins, robot.coinsPerHour))} h ·
                  level {robot.levelRequired} · max {robot.maxPerUser} each
                </p>
                <p className="text-xs text-muted">
                  {formatCount(robot.unitsOwned)} owned by {formatCount(robot.owners)} players ({formatCount(robot.unitsActive)} working) ·{" "}
                  {formatCoins(robot.totalEarnedCoins)} earned
                </p>
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[robot.status]}`}>{robot.status}</span>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-primary">Edit</summary>
            <div className="mt-4">
              <RobotForm robot={robot} />
            </div>
          </details>
        </Card>
      ))}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-x-auto">
          <CardTitle className="mb-3">Recent purchases</CardTitle>
          <ActivityTable
            headers={["When", "Player", "Robot", "Price"]}
            rows={activity.purchases.map((p) => [
              formatDateTimeUtc(p.purchasedAt),
              p.username,
              `${p.robotName}${p.isActive ? "" : " (paused)"}`,
              formatCoins(p.priceCoins),
            ])}
          />
        </Card>
        <Card className="overflow-x-auto">
          <CardTitle className="mb-3">Recent robot earnings</CardTitle>
          <ActivityTable
            headers={["When", "Player", "Robot", "Paid"]}
            rows={activity.earnings.map((e) => [formatDateTimeUtc(e.createdAt), e.username, e.robotName, formatCoins(e.coins)])}
          />
        </Card>
      </div>
    </div>
  );
}

function ActivityTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Nothing yet.</p>;
  return (
    <table className="w-full min-w-[480px] text-left text-sm">
      <thead className="text-xs uppercase tracking-wide text-muted">
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col" className="py-2 pr-3 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className={`py-2 pr-3 ${j === 0 ? "whitespace-nowrap text-muted" : ""} ${j === row.length - 1 ? "tabular-nums" : ""}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
