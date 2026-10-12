type Level = "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;

/**
 * Minimal structured logger. Emits one JSON line per event so platform log
 * drains can index the fields. Callers pass only non-sensitive fields (error
 * codes, route names), never tokens, emails or raw database messages.
 */
function write(level: Level, event: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
