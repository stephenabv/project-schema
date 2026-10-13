import type { Metadata } from "next";
import { Suspense } from "react";
import { signOutEverywhere } from "@/app/(app)/settings/actions";
import { PageHeader } from "@/components/layout/page-header";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Manage your account security." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const { user } = await getSessionOrRedirect("/settings");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <CardTitle>Change password</CardTitle>
        <ChangePasswordForm />
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2">
          <CardTitle>Account</CardTitle>
          <p className="text-sm">
            Signed in as <span className="font-semibold">{user.email}</span>
          </p>
          <p className="text-xs text-muted">
            Virtual Earn is a simulation. Coins have no monetary value and cannot be withdrawn, sold or exchanged.
          </p>
        </Card>
        <Card className="flex flex-col gap-3">
          <CardTitle>Sessions</CardTitle>
          <p className="text-sm text-muted">Signs you out on every device, including this one.</p>
          <form action={signOutEverywhere}>
            <Button type="submit" variant="secondary">
              Sign out everywhere
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
