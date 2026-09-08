# Smart Mill — Auth / Users Implementation Status

## Verified implementation work

This document records the current security direction for the Users/Auth rebuild.

### Canonical identity model

- `auth.users.id` is the authenticated user identity.
- `mill_memberships.mill_id` is the canonical tenant identity.
- `mills` is the tenant record and owns subscription state.
- `profiles` stores personal/profile data, not tenant identity.
- `user_roles` is reserved for platform-level roles such as `platform_admin`.

### Security requirements

- Platform Admin must remain unattached to any mill and must remain able to log in.
- Passwords must never be stored in plaintext.
- Administrative password visibility, if required by the UI, must use an encrypted credential vault whose encryption key is stored only as a Supabase/Edge Function secret.
- The frontend must never receive the vault encryption key or encrypted password payloads.
- Normal employee deletion must not hard-delete `auth.users`; accounts should be disabled/archived so historical mill data remains intact.
- RLS is the authorization boundary; localStorage, `effectiveUserId`, and legacy employee-owner identifiers must never be treated as security authority.

## Current verified code state

The repository still contains legacy account-management paths that require migration before the Users/Auth rebuild can be considered complete. In particular, `MillDetails.tsx` currently contains legacy profile/employee-PIN fallbacks and mixed owner-user versus mill-ID lookups.

## Next implementation sequence

1. Secure credential-vault schema and server-side secret handling.
2. Move account creation/reveal/update operations behind authorized server-side operations.
3. Replace destructive account deletion with disable/archive semantics.
4. Make `mill_memberships.mill_id` the only tenant selector in account management.
5. Make `mills.subscription_status` canonical.
6. Add Platform Admin to the account-management view without changing the existing Platform Admin account.
7. Run typecheck/build and database authorization checks.

No password or secret is stored in this document.
