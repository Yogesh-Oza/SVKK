/**
 * Permission dependencies — granting a key implicitly requires its dependencies.
 */
export const PERMISSION_DEPENDENCIES: Record<string, readonly string[]> = {
  "policy:update": ["policy:read"],
  "policy:delete": ["policy:read"],
  "policy:create": ["policy:read"],
  "claim:update": ["claim:read"],
  "claim:delete": ["claim:read"],
  "claim:create": ["claim:read"],
  "admin:charts": ["calculation:live"],
  "roles:manage": ["users:manage"],
};

/**
 * Resolves transitive dependency closure for selected permission keys.
 */
export function resolvePermissionClosure(selectedKeys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const queue = [...selectedKeys];

  while (queue.length > 0) {
    const key = queue.pop()!;
    if (out.has(key)) continue;
    out.add(key);
    const deps = PERMISSION_DEPENDENCIES[key];
    if (deps) {
      for (const d of deps) {
        if (!out.has(d)) queue.push(d);
      }
    }
  }
  return out;
}
