// All activity days are UTC days, so dates are rendered in UTC everywhere to
// match the server's daily limits and chart buckets (and to avoid hydration
// mismatches between server and browser time zones).
const dateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const shortDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

export function formatDateTimeUtc(iso: string): string {
  return `${dateTime.format(new Date(iso))} UTC`;
}

/** "Oct 12" for a YYYY-MM-DD UTC day. */
export function formatShortDay(isoDay: string): string {
  return shortDay.format(new Date(`${isoDay}T00:00:00Z`));
}
