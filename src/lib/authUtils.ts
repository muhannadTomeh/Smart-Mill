/**
 * Utility to support plain text usernames (e.g. "ahmad", "cashier1", "علي")
 * alongside standard emails without any formatting restrictions or verification emails.
 */
export function normalizeUsernameToEmail(input: string): string {
  const clean = input.trim();
  if (!clean) return "";
  
  if (clean.includes("@")) {
    return clean.toLowerCase();
  }

  // Pure alphanumeric / underscores / hyphens / dots
  const lower = clean.toLowerCase();
  if (/^[a-z0-9_.-]+$/.test(lower)) {
    return `${lower}@mill.local`;
  }

  // Unicode / Arabic characters safe encoding
  const encoded = encodeURIComponent(lower).replace(/%/g, "_").toLowerCase();
  return `u_${encoded}@mill.local`;
}

/**
 * Returns the human-readable username from an email if it was an internal username
 */
export function getDisplayUsername(emailOrUsername?: string | null, displayName?: string | null): string {
  if (displayName && displayName.trim()) return displayName;
  if (!emailOrUsername) return "";
  
  if (emailOrUsername.endsWith("@mill.local")) {
    const raw = emailOrUsername.replace("@mill.local", "");
    if (raw.startsWith("u_")) {
      try {
        const decoded = decodeURIComponent(raw.substring(2).replace(/_/g, "%"));
        return decoded;
      } catch {
        return raw;
      }
    }
    return raw;
  }

  return emailOrUsername;
}
