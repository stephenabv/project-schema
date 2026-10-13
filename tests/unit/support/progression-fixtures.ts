/** Contract-shaped fixtures for missions, claims and badges. */
const TASK = "5d7e9a1c-2b3f-4c6d-8e9f-0a1b2c3d4e5f";

export const mission = {
  id: TASK,
  slug: "tap-starter",
  title: "Tap starter",
  description: "Make 10 taps today",
  objectiveType: "taps",
  target: 10,
  progress: 10,
  rewardCoins: 50,
  xpReward: 20,
  frequency: "daily",
  periodKey: "2026-10-13",
  periodEndsAt: "2026-10-14T00:00:00+00:00",
  claimed: false,
  claimedAt: null,
  availableUntil: null,
};

export const claimResult = {
  success: true,
  duplicate: false,
  transactionId: "9b2f9c3e-1d4a-4c55-8a7e-0c3f4d2b1a90",
  taskId: TASK,
  rewardCoins: 50,
  xpReward: 20,
  balanceCoins: 560,
  xpTotal: 71,
  level: 2,
  unlockedAchievements: [{ slug: "first-mission", title: "First mission", icon: "target", rewardCoins: 50, xpReward: 20 }],
  currency: "VC",
  redeemable: false,
};

export const achievement = {
  slug: "hundred-taps",
  title: "Hundred taps",
  description: "Make 100 taps",
  icon: "mouse-pointer-click",
  metric: "total_taps",
  threshold: 100,
  progress: 40,
  rewardCoins: 100,
  xpReward: 25,
  unlocked: false,
  unlockedAt: null,
};

export const progression = {
  xpTotal: 71,
  level: 2,
  levelStartXp: 100,
  nextLevelXp: 300,
  totalTaps: 51,
  totalCoinsEarned: 560,
  missionsCompleted: 1,
  achievementsUnlocked: 2,
  achievementsTotal: 10,
  nextAchievement: achievement,
};
