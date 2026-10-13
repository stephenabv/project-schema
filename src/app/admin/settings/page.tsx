import type { Metadata } from "next";
import { Suspense } from "react";
import {
  FeatureFlagsForm,
  MaintenanceForm,
} from "@/components/admin/operations-forms";
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
      <PageHeader
        title="Settings"
        description="Reward values, features and maintenance mode, all enforced by the server."
      />
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>Tap policy</CardTitle>
          <p className="mt-1 text-xs text-muted">
            {settings.tapPolicyUpdatedAt
              ? `Last changed ${formatDateTimeUtc(settings.tapPolicyUpdatedAt)}${
                  settings.tapPolicyUpdatedBy
                    ? ` by ${settings.tapPolicyUpdatedBy}`
                    : ""
                }.`
              : "Using the default policy."}{" "}
            Rewards are virtual coins with no monetary value.
          </p>
        </div>
        <TapPolicyForm policy={settings.tapPolicy} />
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle>Features</CardTitle>
            <p className="mt-1 text-xs text-muted">
              A turned-off feature disappears for players and its rewards or
              purchases are refused by the database.
            </p>
          </div>
          <FeatureFlagsForm flags={settings.featureFlags} />
        </Card>
        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle>Maintenance mode</CardTitle>
            <p className="mt-1 text-xs text-muted">
              Pauses every tap, claim, bonus, purchase and generator action.
              Admin balance adjustments still work.
            </p>
          </div>
          <MaintenanceForm maintenance={settings.maintenance} />
        </Card>
      </div>
    </div>
  );
}
