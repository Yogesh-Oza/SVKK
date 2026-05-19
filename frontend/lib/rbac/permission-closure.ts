/** Mirrors backend `domain/permissions/dependencies.ts` for client-side role saves. */
export const PERMISSION_DEPENDENCIES: Record<string, readonly string[]> = {
  "policy:update": ["policy:read"],
  "policy:delete": ["policy:read"],
  "policy:create": ["policy:read", "calculation:live"],
  "claim:update": ["claim:read"],
  "claim:delete": ["claim:read"],
  "claim:create": ["claim:read"],
  "admin:charts": ["calculation:live"],
  "roles:manage": ["users:manage"],
};

export const WILDCARD_PERMISSION = "*:*";

const POLICY_ACCESS_KEYS = ["policy:read", "policy:create", "policy:update", "policy:delete"] as const;
const POLICY_SCOPE_KEYS = ["policy:scope_all", "policy:scope_village", "policy:scope_own"] as const;

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

export function hasPolicyAccess(keys: Set<string>): boolean {
  return POLICY_ACCESS_KEYS.some((k) => keys.has(k));
}

export function hasPolicyScope(keys: Set<string>): boolean {
  return keys.has(WILDCARD_PERMISSION) || POLICY_SCOPE_KEYS.some((k) => keys.has(k));
}

export function policyScopeValidationMessage(keys: Set<string>): string | null {
  if (!hasPolicyAccess(keys) || hasPolicyScope(keys)) {
    return null;
  }
  return "Policy permissions require a scope: select one under Policy scope (All, Village, or Own).";
}

export function pickExclusiveScope(
  key: string,
  checked: boolean,
  selected: Set<string>,
  family: readonly string[],
): Set<string> {
  const next = new Set(selected);
  if (!checked) {
    next.delete(key);
    return next;
  }
  for (const k of family) {
    next.delete(k);
  }
  next.add(key);
  return next;
}

export { POLICY_SCOPE_KEYS };
