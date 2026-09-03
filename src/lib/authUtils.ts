/**
 * Multi-tenant username utilities.
 *
 * Internal email schema:
 *   Mill owner  →  their real email (e.g. owner@gmail.com)
 *   Cashier     →  {millCode}_{username}@mill.local  (e.g. tomeh_ahmad@mill.local)
 *
 * The mill_code is a short identifier assigned to each mill by the admin.
 */

/**
 * Convert a plain username + mill code into the internal Supabase email.
 * If `input` already contains '@', it is returned as-is (mill owner email).
 */
export function normalizeUsernameToEmail(input: string, millCode?: string): string {
  const clean = input.trim();
  if (!clean) return "";

  // Already an email (mill owner)
  if (clean.includes("@")) {
    return clean.toLowerCase();
  }

  const lower = clean.toLowerCase();

  // If a mill code is provided (cashier creation flow), prefix it
  if (millCode && millCode.trim()) {
    const code = millCode.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${code}_${lower}@mill.local`;
  }

  // Plain username without mill code — used for legacy single-tenant users
  // and as a fallback before lookup
  if (/^[a-z0-9_.-]+$/.test(lower)) {
    return `${lower}@mill.local`;
  }

  // Unicode / Arabic characters safe encoding
  const encoded = encodeURIComponent(lower).replace(/%/g, "_").toLowerCase();
  return `u_${encoded}@mill.local`;
}

/**
 * Extract the human-readable username from an internal email.
 * tomeh_ahmad@mill.local  → ahmad
 * ahmad@mill.local        → ahmad
 * owner@gmail.com         → owner@gmail.com (unchanged)
 */
export function getDisplayUsername(
  emailOrUsername?: string | null,
  displayName?: string | null
): string {
  if (displayName && displayName.trim()) return displayName;
  if (!emailOrUsername) return "";

  if (emailOrUsername.endsWith("@mill.local")) {
    const raw = emailOrUsername.replace("@mill.local", "");

    // Handle {millcode}_{username} pattern — extract username part
    const underscoreIdx = raw.indexOf("_");
    if (underscoreIdx !== -1) {
      const possibleUsername = raw.substring(underscoreIdx + 1);
      // If there's another underscore it could be part of username — keep all after first _
      if (possibleUsername) return possibleUsername;
    }

    // Handle unicode-encoded u_ prefix
    if (raw.startsWith("u_")) {
      try {
        return decodeURIComponent(raw.substring(2).replace(/_/g, "%"));
      } catch {
        return raw;
      }
    }

    return raw;
  }

  return emailOrUsername;
}

/**
 * Extract the mill code from an internal cashier email.
 * tomeh_ahmad@mill.local → tomeh
 * ahmad@mill.local → null (no mill code)
 */
export function getMillCodeFromEmail(email: string): string | null {
  if (!email.endsWith("@mill.local")) return null;
  const raw = email.replace("@mill.local", "");
  const underscoreIdx = raw.indexOf("_");
  if (underscoreIdx !== -1) {
    return raw.substring(0, underscoreIdx);
  }
  return null;
}

/**
 * Look up a cashier's internal email by plain username via Supabase RPC.
 * Returns:
 *   { email: string }  — found exactly one match
 *   { ambiguous: true } — multiple mills have same username (user must specify)
 *   { notFound: true }  — no match at all
 */
export async function lookupCashierEmail(
  supabase: any,
  username: string
): Promise<
  | { email: string; ambiguous?: never; notFound?: never }
  | { ambiguous: true; email?: never; notFound?: never }
  | { notFound: true; email?: never; ambiguous?: never }
> {
  const { data, error } = await supabase.rpc("lookup_cashier_by_username", {
    p_username: username.trim().toLowerCase(),
  });

  if (error || !data || data.length === 0) {
    return { notFound: true };
  }

  const row = data[0];
  if (row.ambiguous) {
    return { ambiguous: true };
  }
  if (row.found_email) {
    return { email: row.found_email };
  }

  return { notFound: true };
}
