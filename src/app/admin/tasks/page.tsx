import type { Metadata } from "next";
import { Suspense } from "react";
import { ScheduleForm } from "@/components/admin/operations-forms";
import { TaskForm } from "@/components/admin/task-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { frequencyLabel } from "@/lib/formatting/progression";
import type { AdminTask } from "@/lib/validation/admin";
import { AdminService } from "@/services/admin";

export const metadata: Metadata = { title: "Missions" };

const STATUS_STYLES: Record<AdminTask["status"], string> = {
  published: "bg-success-surface text-success-text",
  draft: "bg-warning-surface text-warning-text",
  archived: "bg-background text-muted",
};

export default function AdminTasksPage() {
  return (
    <>
      <PageHeader
        title="Missions"
        description="Create, edit, schedule, publish and archive missions. Players see a published mission only inside its schedule."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <TasksContent />
      </Suspense>
    </>
  );
}

async function TasksContent() {
  const { supabase } = await getAdminOrNotFound("/admin/tasks");
  const tasks = await new AdminService(supabase).listTasks();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-primary">New mission</summary>
          <div className="mt-4">
            <TaskForm />
          </div>
        </details>
      </Card>
      {tasks.map((task) => (
        <Card key={task.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">{task.title}</CardTitle>
              <p className="text-xs text-muted">
                {frequencyLabel(task.frequency)} · {formatCount(task.target)} {task.objectiveType} ·{" "}
                {formatCoins(task.rewardCoins)} + {formatCount(task.xpReward)} XP · {formatCount(task.claimsTotal)} claims (
                {formatCount(task.claimsLast7Days)} in 7 days)
              </p>
            </div>
            <div className="flex items-center gap-2">
              {task.status === "published" && task.live === false ? (
                <span className="rounded-full bg-warning-surface px-2.5 py-1 text-xs font-semibold text-warning-text">
                  not live
                </span>
              ) : null}
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[task.status]}`}>{task.status}</span>
            </div>
          </div>
          {task.publishAt || task.unpublishAt ? (
            <p className="text-xs text-muted">
              Schedule: {task.publishAt ? `from ${formatDateTimeUtc(task.publishAt)}` : "live once published"}
              {task.unpublishAt ? ` until ${formatDateTimeUtc(task.unpublishAt)}` : ""}
            </p>
          ) : null}
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-primary">Schedule</summary>
            <div className="mt-4">
              <ScheduleForm taskId={task.id} publishAt={task.publishAt} unpublishAt={task.unpublishAt} />
            </div>
          </details>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-primary">Edit</summary>
            <div className="mt-4">
              <TaskForm task={task} />
            </div>
          </details>
        </Card>
      ))}
    </div>
  );
}
