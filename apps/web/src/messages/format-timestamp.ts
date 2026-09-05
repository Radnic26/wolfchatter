/**
 * `dd/MM/yyyy HH:mm`, assembled from the parts rather than from a locale's own pattern, so
 * the mockup's shape holds wherever the reader is. The zone is a parameter because the
 * default is the reader's own and a test cannot prove a format against a machine's clock.
 */
export function formatTimestamp(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    // `hour12: false` is the setting that turns midnight into 24:00 on some platforms.
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(iso));

  const field: Record<string, string> = {};
  for (const { type, value } of parts) field[type] = value;

  return `${field.day}/${field.month}/${field.year} ${field.hour}:${field.minute}`;
}
