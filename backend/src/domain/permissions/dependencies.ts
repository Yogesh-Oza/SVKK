/**
 * Permission dependencies — granting a key implicitly requires its dependencies.
 */
export const PERMISSION_DEPENDENCIES: Record<string, readonly string[]> = {
  "policy:update": ["policy:read"],
  "policy:delete": ["policy:read"],
  "policy:restore": ["policy:read"],
  "policy:purge": ["policy:read"],
  "policy:export": ["policy:read"],
  /** Add-policy form loads premium charts via /calculation/reference/* */
  "policy:create": ["policy:read", "calculation:live"],
  "claim:update": ["claim:read"],
  "claim:delete": ["claim:read"],
  "claim:create": ["claim:read"],
  "claim:import": ["claim:read"],
  "claim:export": ["claim:read"],
  "wallet:opening": ["wallet:read"],
  "wallet:topup": ["wallet:read"],
  "wallet:debit": ["wallet:read"],
  "wallet:import": ["wallet:read"],
  "wallet:export": ["wallet:read"],
  "wallet:clear": ["wallet:read"],
  "admin:charts": ["calculation:live"],
  "future:lookup": ["future:read"],
  "admin:dropdowns:create": ["admin:dropdowns:read"],
  "admin:dropdowns:update": ["admin:dropdowns:read"],
  "admin:dropdowns:delete": ["admin:dropdowns:read"],
  "settings:update": ["settings:read"],
  "emailTemplates:update": ["emailTemplates:read"],
  "emailTemplates:send_test": ["emailTemplates:read"],
  "categoryForm:update": ["categoryForm:read"],
  "categoryForm:send_test": ["categoryForm:read"],
  "categoryForm:send": ["categoryForm:read"],
  "notifications:update": ["notifications:read"],
  "notifications:delete": ["notifications:read"],
  "users:create": ["users:read"],
  "users:update": ["users:read"],
  "users:delete": ["users:read"],
  "roles:create": ["roles:read"],
  "roles:update": ["roles:read"],
  "roles:clone": ["roles:read"],
  "roles:toggle": ["roles:read"],
  "roles:delete": ["roles:read"],
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
