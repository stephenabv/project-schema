import { FilterActions, FilterBar, FilterField, FilterInput, FilterSelect } from "@/components/ui/filter-bar";
import { transactionTypeLabel } from "@/lib/formatting/transactions";
import { TRANSACTION_TYPES } from "@/lib/validation/transactions";

/** Plain GET form: filters live in the URL, so they are shareable and work without JS. */
export function LedgerFilters({ type, from, to }: { type?: string; from?: string; to?: string }) {
  return (
    <FilterBar action="/wallet" label="Filter activity" actions={<FilterActions resetHref="/wallet" />}>
      <FilterField label="Type" grow={2}>
        <FilterSelect name="type" defaultValue={type ?? ""}>
          <option value="">All types</option>
          {TRANSACTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {transactionTypeLabel(value)}
            </option>
          ))}
        </FilterSelect>
      </FilterField>
      <FilterField label="From" span="half">
        <FilterInput type="date" name="from" defaultValue={from} />
      </FilterField>
      <FilterField label="To" span="half">
        <FilterInput type="date" name="to" defaultValue={to} />
      </FilterField>
    </FilterBar>
  );
}
