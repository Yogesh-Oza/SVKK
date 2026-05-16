/**
 * System role slugs that cannot be deleted, renamed, or stripped of critical permissions.
 */
export function getProtectedRoleSlugs(): string[] {
  const raw = process.env.PROTECTED_ROLE_SLUGS ?? "super-admin";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isProtectedRoleSlug(slug: string): boolean {
  return getProtectedRoleSlugs().includes(slug);
}
