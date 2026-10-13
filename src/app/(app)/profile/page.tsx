import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/profile/avatar";
import { ProfileForm } from "@/components/profile/profile-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { formatShortDate } from "@/lib/formatting/dates";
import { ProfileService } from "@/services/profile";
import { ProgressionService } from "@/services/progression";
import { ShopService } from "@/services/shop";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile" description="Choose how you appear in Virtual Earn." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ProfileContent />
      </Suspense>
    </>
  );
}

async function ProfileContent() {
  const { supabase, user } = await getSessionOrRedirect("/profile");
  const [profile, progression, cosmetics] = await Promise.all([
    new ProfileService(supabase).get(user.id),
    new ProgressionService(supabase).get(),
    new ShopService(supabase).equipped(),
  ]);

  const stats = [
    { label: "Level", value: formatCount(progression.level) },
    { label: "Total XP", value: formatCount(progression.xpTotal) },
    { label: "Taps", value: formatCount(progression.totalTaps) },
    { label: "Virtual coins earned", value: formatCoins(progression.totalCoinsEarned) },
    { label: "Missions completed", value: formatCount(progression.missionsCompleted) },
    { label: "Badges", value: `${progression.achievementsUnlocked} / ${progression.achievementsTotal}` },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <ProfileForm username={profile.username} avatarKey={profile.avatarKey} />
      </Card>
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar avatarKey={profile.avatarKey} size="lg" frame={cosmetics.avatarFrame} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{profile.username}</p>
            {cosmetics.title ? <p className="text-xs font-semibold text-primary">{cosmetics.title}</p> : null}
            <p className="text-xs text-muted">Joined {formatShortDate(profile.createdAt)}</p>
          </div>
        </div>
        <CardTitle>Stats</CardTitle>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className="font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/shop" variant="secondary">
            Shop cosmetics
          </ButtonLink>
          <ButtonLink href="/leaderboard" variant="secondary">
            Leaderboard
          </ButtonLink>
          <ButtonLink href="/robots" variant="secondary">
            Robot Shop
          </ButtonLink>
          <ButtonLink href="/generator" variant="secondary">
            Generator
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
