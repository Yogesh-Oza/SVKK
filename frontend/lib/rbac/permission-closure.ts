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
export const POLICY_SCOPE_KEYS = ["policy:scope_all", "policy:scope_village", "policy:scope_own"] as const;
export const DASHBOARD_SCOPE_KEYS = ["dashboard:scope_all", "dashboard:scope_village"] as const;
export const MIS_SCOPE_KEYS = ["mis:scope_all", "mis:scope_village"] as const;
export const CLAIM_SCOPE_KEYS = ["claim:scope_all", "claim:scope_village"] as const;

export const VILLAGE_SCOPE_PERMISSION_KEYS = [
  "policy:scope_village",
  "claim:scope_village",
  "mis:scope_village",
  "dashboard:scope_village",
] as const;

const SCOPE_FAMILIES = [POLICY_SCOPE_KEYS, DASHBOARD_SCOPE_KEYS, MIS_SCOPE_KEYS, CLAIM_SCOPE_KEYS] as const;

export function roleRequiresGeo(keys: Set<string>): boolean {
  return VILLAGE_SCOPE_PERMISSION_KEYS.some((k) => keys.has(k));
}

export function scopeFamilyForKey(key: string): readonly string[] | null {
  for (const family of SCOPE_FAMILIES) {
    if ((family as readonly string[]).includes(key)) {
      return family;
    }
  }
  return null;
}

function countScopeHits(keys: Set<string>, family: readonly string[]): number {
  return family.filter((k) => keys.has(k)).length;
}

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

/** Mirrors backend `assertValidScopeSet` for client-side saves. */
export function permissionValidationMessage(keys: Set<string>): string | null {
  const policyHits = countScopeHits(keys, POLICY_SCOPE_KEYS);
  if (policyHits > 1) {
    return "Only one policy scope allowed: choose All policies, Village-scoped, or Own — not more than one.";
  }

  const dashHits = countScopeHits(keys, DASHBOARD_SCOPE_KEYS);
  if (dashHits > 1) {
    return "Only one dashboard scope allowed: choose Full dashboard or Village dashboard — not both.";
  }

  const misHits = countScopeHits(keys, MIS_SCOPE_KEYS);
  if (misHits > 1) {
    return "Only one MIS scope allowed: choose Full MIS or Village MIS — not both.";
  }

  const claimHits = countScopeHits(keys, CLAIM_SCOPE_KEYS);
  if (claimHits > 1) {
    return "Only one claim scope allowed: choose All claims or Village-scoped claims — not both.";
  }

  return policyScopeValidationMessage(keys);
}

/** Mirrors backend assertRoleGeoRequired when option IDs are known. */
export function geoValidationMessageWithSelection(
  keys: Set<string>,
  villageOptionIds: string[],
  areaOptionIds: string[],
): string | null {
  if (!roleRequiresGeo(keys)) return null;
  if (villageOptionIds.length === 0 && areaOptionIds.length === 0) {
    return "Village-scoped permissions require at least one allowed village or area.";
  }
  return null;
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

