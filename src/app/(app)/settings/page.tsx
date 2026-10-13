import type { Metadata } from "next";
import { Suspense } from "react";
import { setLeaderboardVisibility, signOutEverywhere } from "@/app/(app)/settings/actions";
import { PageHeader } from "@/components/layout/page-header";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { ProfileService } from "@/services/profile";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Manage your account security and privacy." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const { supabase, user } = await getSessionOrRedirect("/settings");
  const profile = await new ProfileService(supabase).get(user.id);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
            Virtual coins can be converted to pesos on the Exchange page while cash-out is open. Payouts are reviewed and sent by hand.
          </p>
        </Card>
        <Card className="flex flex-col gap-3">
          <CardTitle>Leaderboard privacy</CardTitle>
          <p className="text-sm text-muted">
            {profile.leaderboardOptOut
              ? "You are hidden from leaderboards. Other players cannot see your username or score."
              : "Your username, level, score and cosmetics appear on leaderboards. Nothing else is shown."}
          </p>
          <form action={setLeaderboardVisibility}>
            <input type="hidden" name="optOut" value={profile.leaderboardOptOut ? "false" : "true"} />
            <Button type="submit" variant="secondary">
              {profile.leaderboardOptOut ? "Show me on leaderboards" : "Hide me from leaderboards"}
            </Button>
          </form>
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
