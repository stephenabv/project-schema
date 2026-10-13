import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { FilterActions, FilterBar, FilterField, FilterInput, FilterSelect } from "@/components/ui/filter-bar";
import { formatCount } from "@/lib/formatting/coins";
import { STATUS_LABELS, type ConversionStatus, type PayoutStatus } from "@/lib/validation/redemption";

/** Status and reference/player search for the conversion and payout queues (GET form, so URLs are shareable). */
export function RequestFilters({
  basePath,
  statuses,
  status,
  q,
}: {
  basePath: string;
  statuses: readonly (ConversionStatus | PayoutStatus)[];
  status?: string;
  q?: string;
}) {
  return (
    <FilterBar action={basePath} label="Filter requests" role="search" actions={<FilterActions resetHref={basePath} />}>
      <FilterField label="Status">
        <FilterSelect name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="open">Open (needs action)</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
      </FilterField>
      <FilterField label="Reference or player" grow={2}>
        <FilterInput name="q" defaultValue={q} maxLength={64} placeholder="CNV-…, PAY-… or username" />
      </FilterField>
    </FilterBar>
  );
}

export function Pager({
  basePath,
  page,
  pageSize,
  total,
  params,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const search = new URLSearchParams(
      Object.entries({ ...params, page: p > 1 ? String(p) : undefined }).filter((e): e is [string, string] => Boolean(e[1])),
    );
    return `${basePath}${search.size ? `?${search}` : ""}`;
  };
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">
        {formatCount(total)} request{total === 1 ? "" : "s"} · page {formatCount(Math.min(page, pages))} of {formatCount(pages)}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClass("ghost")}>
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className={buttonClass("secondary")}>
            Next
          </Link>
        ) : null}
      </span>
    </nav>
  );
}
