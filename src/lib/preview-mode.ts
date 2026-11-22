const PROJECT_ID = "6ab06a73-9e5d-4a06-854b-efc1831a70e7";
const ZONES = ["lovable.app", "gpt-eng.com", "gptengineer.run"];

/** Host-based, never based on PROD: built previews also use production builds. */
export function isProjectPreview(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (["lovableproject.com", "lovableproject-dev.com"].some((zone) =>
    host === `${PROJECT_ID}.${zone}` ||
    new RegExp(`^${PROJECT_ID}-thr_[a-z0-9]+\\.${zone.replaceAll(".", "\\.")}$`).test(host),
  )) return true;
  return ZONES.some((zone) => {
    if (!host.endsWith(`.${zone}`)) return false;
    const labels = host.slice(0, -(zone.length + 1)).split(".");
    const first = labels[0];
    if (!first) return false;
    if (labels.length <= 2 && new RegExp(`^id-preview(?:-[a-z0-9]+)?--${PROJECT_ID}$`).test(first)) return true;
    if (labels.length === 1 && first === `project--${PROJECT_ID}-dev`) return true;
    return labels.length === 2 && new RegExp(`^live--${PROJECT_ID}(?:-thr_[a-z0-9]+)?$`).test(first);
  });
}
