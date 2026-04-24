/**
 * Public API base including `/api/v1` (e.g. `http://localhost:4000/api/v1`).
 */
export function getSvkkApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    return "";
  }
  return base.replace(/\/$/, "");
}
