export type CsvValue = string | number | boolean | null | undefined;

/**
 * Formula prefixes that spreadsheet apps execute. Cells starting with one are
 * prefixed with a quote so exported user text (usernames, reasons) cannot run
 * as a formula when an admin opens the file (CSV injection).
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV with CRLF line endings and a header row. */
export function toCsv<T>(columns: readonly { header: string; value: (row: T) => CsvValue }[], rows: readonly T[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
