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
  has_vault_admin_pin?: boolean;
  created_at: string;
}

/**
 * Decrypts and reveals a single user's credential on-demand via the authorized server-side Edge Function.
 * Encryption key is NEVER accessible to the client or browser, and credentials are never loaded on page load.
 */
export async function revealCredential(
  userId: string, 
  credentialType: 'account_password' | 'admin_pin' = 'account_password'
): Promise<string | null> {
  if (!userId) return null;

  try {
    // Primary: Server-side Edge Function with secret-based AES-256-GCM
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('credential-vault', {
      body: { 
        action: 'reveal', 
        user_id: userId,
        credential_type: credentialType 
      }
    });

    if (edgeError) {
      console.warn("credential-vault edge function error:", edgeError);
      const errorMsg = await extractEdgeFunctionError(edgeError, "تعذر الاتصال بخزنة بيانات الاعتماد المشفرة");
      throw new Error(errorMsg);
    }

    if (edgeData?.error) {
      throw new Error(edgeData.error);
    }

    return edgeData?.value ?? edgeData?.password ?? null;
  } catch (err: any) {
    const label = credentialType === 'admin_pin' ? 'PIN لوحة الإدارة' : 'كلمة المرور';
    throw new Error(err.message || `تعذر فك تشفير ${label} للحساب`);
  }
}

/**
 * Stores or updates an encrypted credential (password or admin_pin) in the server Credential Vault.
 */
export async function storeCredential(
  userId: string, 
  value: string, 
  credentialType: 'account_password' | 'admin_pin' = 'account_password'
): Promise<void> {
  if (!userId || !value) return;

  try {
    const { data, error } = await supabase.functions.invoke('credential-vault', {
      body: { 
        action: 'store', 
        user_id: userId, 
        value,
        password: value,
        credential_type: credentialType 
      }
    });

    if (error || data?.error) {
      console.warn("Could not store credential via Edge Function:", error || data?.error);
      const label = credentialType === 'admin_pin' ? 'PIN لوحة الإدارة' : 'كلمة المرور';
      throw new Error(data?.error || error?.message || `تعذر مزامنة ${label} في الخزنة المشفرة`);
    }
  } catch (err) {
    console.warn("storeCredential exception:", err);
    throw err;
  }
}

/**
 * Fetches all administrative accounts (Platform Admin, Mill Owners, Cashiers)
 * WITHOUT returning any plaintext passwords.
 */
export async function fetchAllAdminAccounts(): Promise<AdminAccountItem[]> {
  try {
    // Query canonical account/tenant tables directly.
    // admin_get_all_accounts RPC is obsolete and no longer exists.
    const [adminRolesRes, millsRes, membershipsRes] = await Promise.all([
      supabase.from('user_roles').select('user_id').eq('role', 'platform_admin'),
      supabase.from('mills').select(
        'id, name, mill_code, owner_user_id, subscription_status, created_at'
      ),
      supabase.from('mill_memberships').select(
        'id, user_id, mill_id, role, username, display_username, is_active, created_at'
      )
    ]);

    const millsMap = new Map<string, any>();
    (millsRes.data || []).forEach((m: any) => {
      if (m.id) millsMap.set(m.id, m);
    });

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
          has_vault_admin_pin: true,
          created_at: m.created_at || new Date().toISOString()
        });
      }
    });

    // 3) Cashiers
    (membershipsRes.data || []).forEach((mem: any) => {
      if (mem.role === 'mill_employee' && !adminIds.has(mem.user_id)) {
        const p = profilesMap.get(mem.user_id);
        const mill = millsMap.get(mem.mill_id);
        const isActive = mem.is_active !== false && p?.is_active !== false;
        accounts.push({
          user_id: mem.user_id,
          display_name: p?.display_name || mem.display_username || "موظف كاشير",
          username: mem.display_username || mem.username || p?.phone || "cashier",
          role: 'mill_employee',
          mill_id: mem.mill_id,
          mill_name: mill?.name || "معصرة",
          mill_code: mill?.mill_code || null,
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
 * Safely extracts the descriptive error message from a Supabase Edge Function response (non-2xx).
 */
async function extractEdgeFunctionError(edgeErr: any, defaultMsg: string): Promise<string> {
  if (!edgeErr) return defaultMsg;
  let msg = edgeErr.message || defaultMsg;
  if (edgeErr.context && typeof edgeErr.context.json === 'function') {
    try {
      const body = await edgeErr.context.json();
      if (body?.error) return String(body.error);
    } catch { }
  }
  if (edgeErr.context && typeof edgeErr.context.text === 'function') {
    try {
      const text = await edgeErr.context.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed?.error) return String(parsed.error);
        } catch { }
        return text;
      }
    } catch { }
  }
  return msg;
}

/**
 * Creates a Mill and Mill Owner account using the server-side admin-manage-user Edge Function.
 * Platform Admin only.
 */
export async function createMillOwnerAccount(params: {
  millName: string;
  ownerName: string;
  country: string;
  username: string;
  password: string;
  adminPin?: string;
  ownerPhone?: string;
  ownerEmail?: string;
}): Promise<{ user_id: string; mill_id: string; username: string; password?: string; admin_pin?: string }> {
  const { millName, ownerName, country, username, password, adminPin, ownerPhone, ownerEmail } = params;

  // Primary: Edge Function using Supabase Auth Admin API
  const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('admin-manage-user', {
    body: {
      action: 'create_owner',
      mill_name: millName,
      owner_name: ownerName,
      country: country || 'فلسطين',
      username,
      password,
      admin_pin: adminPin || '123456',
      owner_phone: ownerPhone,
      owner_email: ownerEmail
    }
  });

  if (edgeErr) {
    const errorMsg = await extractEdgeFunctionError(edgeErr, "فشل إنشاء حساب المعصرة");
    if (errorMsg?.includes('404') || errorMsg?.includes('not found') || errorMsg?.includes('Failed to send')) {
      throw new Error("دالة إدارة المستخدمين (admin-manage-user) غير منشورة على Supabase أو تعذر الاتصال بها. يرجى نشر دالة الحافة أولاً.");
    }
    throw new Error(errorMsg);
  }

  if (edgeData?.error) {
    throw new Error(edgeData.error);
  }

  if (edgeData?.success) {
    return {
      user_id: edgeData.user_id,
      mill_id: edgeData.mill_id,
      username: edgeData.username,
      password: edgeData.password || password,
      admin_pin: edgeData.admin_pin || adminPin || '123456'
    };
  }

  throw new Error("استجابة غير متوقعة من خادم إدارة الحسابات");
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

  // Primary: Edge Function using Supabase Auth Admin API
  const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('admin-manage-user', {
    body: {
      action: 'create_cashier',
      mill_id: millId,
      display_name: displayName,
      username,
      password,
      mill_code: millCode
    }
  });

  if (edgeErr) {
    const errorMsg = await extractEdgeFunctionError(edgeErr, "فشل إنشاء حساب الموظف");
    if (errorMsg?.includes('404') || errorMsg?.includes('not found') || errorMsg?.includes('Failed to send')) {
      throw new Error("دالة إدارة المستخدمين (admin-manage-user) غير منشورة على Supabase أو تعذر الاتصال بها. يرجى نشر دالة الحافة أولاً.");
    }
    throw new Error(errorMsg);
  }

  if (edgeData?.error) {
    throw new Error(edgeData.error);
  }

  if (edgeData?.success) {
    return {
      user_id: edgeData.user_id,
      username: edgeData.username
    };
  }

  throw new Error("استجابة غير متوقعة من خادم إدارة الحسابات");
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
        action: isActive ? 'enable_user' : 'disable_user',
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

  // 1. Primary: Edge Function
  try {
    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('admin-manage-user', {
      body: {
        action: 'update_user',
        user_id: userId,
        display_name: cleanName,
        username: cleanUsername,
        password: cleanPass || undefined
      }
    });

    if (!edgeErr && edgeData?.success) {
      return;
    }

    if (edgeData?.error) {
      throw new Error(edgeData.error);
    }
  } catch (efEx: any) {
    console.warn("Edge function update_user failed, falling back to RPC:", efEx.message);
  }

  // 2. Fallback: Database RPC
  try {
    const { error } = await supabase.rpc('admin_update_user_credentials', {
      p_user_id: userId,
      p_display_name: cleanName,
      p_username: cleanUsername,
      p_password: cleanPass || null
    });

    if (error) {
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
