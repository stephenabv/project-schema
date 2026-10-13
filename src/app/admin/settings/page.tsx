import type { Metadata } from "next";
import { Suspense } from "react";
import { TapPolicyForm } from "@/components/admin/tap-policy-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { AdminService } from "@/services/admin";

export const metadata: Metadata = { title: "Settings" };

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Reward values and limits enforced by the server for every tap." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const { supabase } = await getAdminOrNotFound("/admin/settings");
  const settings = await new AdminService(supabase).getSettings();

  return (
    <Card className="flex max-w-2xl flex-col gap-4">
      <div>
        <CardTitle>Tap policy</CardTitle>
        <p className="mt-1 text-xs text-muted">
          {settings.tapPolicyUpdatedAt
            ? `Last changed ${formatDateTimeUtc(settings.tapPolicyUpdatedAt)}${
                settings.tapPolicyUpdatedBy ? ` by ${settings.tapPolicyUpdatedBy}` : ""
              }.`
            : "Using the default policy."}{" "}
          Rewards are virtual coins with no monetary value.
        </p>
      </div>
      <TapPolicyForm policy={settings.tapPolicy} />
    </Card>
  );
}
