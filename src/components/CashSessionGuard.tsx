/**
 * Compatibility wrapper retained for operational pages that historically
 * required an open drawer session. Cash sessions are now optional metadata,
 * so this wrapper intentionally never blocks a canonical business operation.
 */
export function CashSessionGuard({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

/** Cash operations are never blocked merely because no drawer session is open. */
export function useCashSessionBlocked() {
  return false;
}
