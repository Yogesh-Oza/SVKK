/** Enable with NEXT_PUBLIC_SVKK_DEBUG_POLICY=true or in development. */
export function isPolicyUpdateDebugEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_SVKK_DEBUG_POLICY === "true"
  );
}

export function debugPolicyUpdate(label: string, data: Record<string, unknown>): void {
  if (!isPolicyUpdateDebugEnabled()) return;
  console.debug(`[svkk:policy-update] ${label}`, data);
}
