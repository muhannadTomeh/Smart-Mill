import { supabase } from "@/integrations/supabase/client";

export interface AdminAccountItem {
  user_id: string;
  display_name: string;
  username: string;
  role: 'platform_admin' | 'mill_owner' | 'mill_employee' | string;
  mill_id: string | null;
  mill_name: string;
  mill_code: string | null;
  status: string;
  is_active: boolean;
  has_vault_credential: boolean;
  created_at: string;
}

/**
 * Decrypts and reveals a single user's credential on-demand via the authorized server-side Edge Function.
 * Encryption key is NEVER accessible to the client or browser, and passwords are never loaded on page load.
 */
export async function revealCredential(userId: string): Promise<string | null> {
  if (!userId) return null;

  try {
    // 1. Primary: Server-side Edge Function with secret-based AES-256-GCM
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('credential-vault', {
      body: { action: 'reveal', user_id: userId }
    });

    if (!edgeError && edgeData) {
      if (edgeData.error) {
        throw new Error(edgeData.error);
      }
      return edgeData.password ?? null;
    }

    // 2. Fallback: Secure RPC if Edge Function is in local setup
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_reveal_credential' as any, {
      p_user_id: userId
    });

    if (!rpcError && rpcData) {
      return rpcData;
    }

    if (edgeError) {
      console.warn("credential-vault edge function error:", edgeError);
      throw edgeError;
    }

    return null;
  } catch (err: any) {
    throw new Error(err.message || "تعذر فك تشفير كلمة المرور للحساب");
  }
}

/**
 * Stores or updates an encrypted password in the server Credential Vault.
 */
export async function storeCredential(userId: string, password: string): Promise<void> {
  if (!userId || !password) return;

  try {
    const { data, error } = await supabase.functions.invoke('credential-vault', {
      body: { action: 'store', user_id: userId, password }
    });

    if (error || data?.error) {
      console.warn("Could not store credential via Edge Function:", error || data?.error);
    }
  } catch (err) {
    console.warn("storeCredential exception:", err);
  }
}

/**
 * Fetches all administrative accounts (Platform Admin, Mill Owners, Cashiers)
 * WITHOUT returning any plaintext passwords.
 */
export async function fetchAllAdminAccounts(): Promise<AdminAccountItem[]> {
  try {
    // 1. Primary: Call the secure RPC
    const { data, error } = await supabase.rpc('admin_get_all_accounts' as any);
    if (!error && data && Array.isArray(data)) {
      return (data as any[]).map(acc => ({
        ...acc,
        is_active: acc.is_active ?? (acc.status !== 'disabled'),
        status: acc.status || (acc.is_active ? 'active' : 'disabled')
      })) as AdminAccountItem[];
    }

    if (error) {
      console.warn("admin_get_all_accounts RPC returned error, using fallback queries:", error);
    }

    // 2. Fallback: Query tables directly
    const [adminRolesRes, millsRes, membershipsRes] = await Promise.all([
      supabase.from('user_roles').select('user_id').eq('role', 'platform_admin'),
      supabase.from('mills').select('id, name, mill_code, owner_user_id, subscription_status, created_at'),
      supabase.from('mill_memberships').select('id, user_id, mill_id, role, username, display_username, is_active, created_at, mills(name, mill_code)')
    ]);

    // Fetch profiles for all unique user IDs
    const userIds = new Set<string>();
    // Guarantee canonical Platform Admin ID is included
    userIds.add('7e29b3ea-ce6e-4dab-b2d7-80fc04af1114');
    (adminRolesRes.data || []).forEach((r: any) => userIds.add(r.user_id));
    (millsRes.data || []).forEach((m: any) => { if (m.owner_user_id) userIds.add(m.owner_user_id); });
    (membershipsRes.data || []).forEach((mem: any) => { if (mem.user_id) userIds.add(mem.user_id); });

    const profilesMap = new Map<string, any>();
    if (userIds.size > 0) {
      try {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, display_name, phone, mill_name, mill_code, is_active')
          .in('user_id', Array.from(userIds));
        (profs || []).forEach((p: any) => profilesMap.set(p.user_id, p));
      } catch (pErr) {
        console.warn("Could not query profiles map:", pErr);
      }
    }

    const accounts: AdminAccountItem[] = [];

    // 1) Platform Admins (never tied to a mill)
    const adminIds = new Set<string>();
    adminIds.add('7e29b3ea-ce6e-4dab-b2d7-80fc04af1114');
    (adminRolesRes.data || []).forEach((ar: any) => adminIds.add(ar.user_id));

    adminIds.forEach(adminId => {
      const p = profilesMap.get(adminId);
      accounts.push({
        user_id: adminId,
        display_name: p?.display_name || "مشرف النظام العام",
        username: p?.phone || "admin",
        role: 'platform_admin',
        mill_id: null,
        mill_name: '— بدون ارتباط بمعصرة (نظامي) —',
        mill_code: null,
        status: 'active',
        is_active: true,
        has_vault_credential: true,
        created_at: new Date().toISOString()
      });
    });

    // 2) Mill Owners
    (millsRes.data || []).forEach((m: any) => {
      if (m.owner_user_id && !adminIds.has(m.owner_user_id)) {
        const p = profilesMap.get(m.owner_user_id);
        const isActive = p?.is_active !== false;
        accounts.push({
          user_id: m.owner_user_id,
          display_name: p?.display_name || m.name || "صاحب المعصرة",
          username: m.mill_code || p?.phone || "owner",
          role: 'mill_owner',
          mill_id: m.id,
          mill_name: m.name,
          mill_code: m.mill_code,
          status: !isActive ? 'disabled' : (m.subscription_status || 'active'),
          is_active: isActive,
          has_vault_credential: true,
          created_at: m.created_at || new Date().toISOString()
        });
      }
    });

    // 3) Cashiers
    (membershipsRes.data || []).forEach((mem: any) => {
      if (mem.role === 'mill_employee' && !adminIds.has(mem.user_id)) {
        const p = profilesMap.get(mem.user_id);
        const isActive = mem.is_active !== false && p?.is_active !== false;
        accounts.push({
          user_id: mem.user_id,
          display_name: p?.display_name || mem.display_username || "موظف كاشير",
          username: mem.display_username || mem.username || p?.phone || "cashier",
          role: 'mill_employee',
          mill_id: mem.mill_id,
          mill_name: (mem.mills as any)?.name || "معصرة",
          mill_code: (mem.mills as any)?.mill_code || null,
          status: isActive ? 'active' : 'disabled',
          is_active: isActive,
          has_vault_credential: true,
          created_at: mem.created_at || new Date().toISOString()
        });
      }
    });

    return accounts;
  } catch (err: any) {
    console.error("Error fetching admin accounts:", err);
    return [];
  }
}

/**
 * Creates a cashier employee account using the Supabase Auth Admin API
 * with transactional rollback safety to prevent orphan auth records.
 */
export async function createEmployeeAccount(params: {
  millId: string;
  displayName: string;
  username: string;
  password: string;
  millCode?: string;
}): Promise<{ user_id: string; username: string }> {
  const { millId, displayName, username, password, millCode } = params;

  // 1. Primary: Edge Function using Supabase Auth Admin API
  try {
    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('admin-manage-user', {
      body: {
        action: 'create_employee',
        mill_id: millId,
        display_name: displayName,
        username,
        password,
        mill_code: millCode
      }
    });

    if (!edgeErr && edgeData?.success) {
      return {
        user_id: edgeData.user_id,
        username: edgeData.username
      };
    }

    if (edgeData?.error) {
      throw new Error(edgeData.error);
    }
  } catch (efEx: any) {
    if (!efEx.message?.includes('Failed to send') && !efEx.message?.includes('NetworkError') && !efEx.message?.includes('not found')) {
      throw efEx;
    }
    console.warn("Edge function fallback to admin_create_cashier RPC:", efEx.message);
  }

  // 2. Fallback: Database RPC
  const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_create_cashier', {
    p_parent_mill_id: millId,
    p_display_name: displayName,
    p_username: username,
    p_password: password,
    p_mill_code: millCode || 'mill'
  });

  if (rpcErr) {
    throw new Error(rpcErr.message || "فشل إنشاء حساب الموظف");
  }

  const createdUserId = (rpcData as any)?.user_id || (rpcData as any)?.id;
  // Also store in vault if possible
  if (createdUserId) {
    await storeCredential(createdUserId, password);
  }

  return {
    user_id: createdUserId,
    username
  };
}

/**
 * Non-destructive account lifecycle: toggles account active state (is_active).
 * Restores or disables user access without deleting historical invoices, transactions, or records.
 */
export async function toggleUserAccountActive(userId: string, isActive: boolean): Promise<void> {
  if (!userId) return;

  if (userId === '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114') {
    throw new Error("لا يمكن تعطيل حساب المشرف العام");
  }

  try {
    // 1. Primary: Edge Function
    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('admin-manage-user', {
      body: {
        action: 'toggle_active',
        user_id: userId,
        is_active: isActive
      }
    });

    if (!edgeErr && edgeData?.success) {
      return;
    }

    if (edgeData?.error) {
      throw new Error(edgeData.error);
    }
  } catch (efEx: any) {
    console.warn("Edge function toggle_active failed, falling back to RPC:", efEx.message);
  }

  // 2. Fallback: RPC
  try {
    const { error: rpcErr } = await supabase.rpc('admin_toggle_user_active' as any, {
      p_user_id: userId,
      p_is_active: isActive
    });

    if (!rpcErr) return;
  } catch (rpcEx) {
    console.warn("admin_toggle_user_active RPC error:", rpcEx);
  }

  // 3. Fallback: direct table updates
  await Promise.all([
    supabase.from('mill_memberships').update({ is_active: isActive } as any).eq('user_id', userId),
    supabase.from('profiles').update({ is_active: isActive } as any).eq('user_id', userId)
  ]);
}

/**
 * Updates a user account's name, username, and optionally password securely.
 */
export async function updateUserAccount(
  userId: string,
  displayName: string,
  username: string,
  password?: string
): Promise<void> {
  const cleanUsername = username.trim();
  const cleanName = displayName.trim();
  const cleanPass = password?.trim() || "";

  try {
    const { error } = await supabase.rpc('admin_update_user_credentials', {
      p_user_id: userId,
      p_display_name: cleanName,
      p_username: cleanUsername,
      p_password: cleanPass || null
    });

    if (error) {
      // Fallback: update profile directly
      if (error.message?.includes('function') && error.message?.includes('does not exist')) {
        await supabase
          .from('profiles')
          .update({
            display_name: cleanName,
            phone: cleanUsername
          })
          .eq('user_id', userId);
      } else {
        throw error;
      }
    }

    // If password provided, update credential vault via Edge Function
    if (cleanPass) {
      await storeCredential(userId, cleanPass);
    }
  } catch (err: any) {
    throw new Error(err.message || "فشل تحديث بيانات الحساب");
  }
}

/**
 * Non-destructive account removal:
 * Instead of destructive DELETE FROM auth.users which breaks foreign keys and deletes
 * historical financial and queue records, it disables/archives the account safely.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  if (userId === '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114') {
    throw new Error("لا يمكن حذف أو تعطيل حساب المشرف العام");
  }

  try {
    // Non-destructive deactivation
    await toggleUserAccountActive(userId, false);
  } catch (err: any) {
    throw new Error(err.message || "فشل تعطيل الحساب");
  }
}
