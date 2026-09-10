import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to encrypt password for credential_vault if key exists
async function encryptVaultPassword(plainText: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainText));
  const ivB64 = btoa(String.fromCharCode(...iv));
  const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuffer)));
  return `${ivB64}:${cipherB64}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    // Server secret ONLY — NO fallback key to serviceRoleKey
    const vaultSecretKey = Deno.env.get('CREDENTIAL_VAULT_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Server configuration error: Missing environment variables');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify caller session
    const supabaseCallerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user: callerUser }, error: callerError } = await supabaseCallerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerId = callerUser.id;

    // Privileged service role client for administrative mutations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { action } = body;

    // Platform Admin check (Canonical ID or platform_admin role)
    const isPlatformAdmin = (callerId === '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114') || !!(
      await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', callerId)
        .eq('role', 'platform_admin')
        .maybeSingle()
    ).data;

    // ==========================================
    // ACTION: CREATE_OWNER (Platform Admin ONLY)
    // ==========================================
    if (action === 'create_owner') {
      if (!isPlatformAdmin) {
        return new Response(
          JSON.stringify({ error: 'غير مصرح لك بإنشاء حسابات المعاصر (مخصص لمشرف النظام فقط)' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const {
        mill_name: rawMillName,
        owner_name: rawOwnerName,
        country: rawCountry,
        username: rawUsername,
        password: rawPassword,
        admin_pin: rawAdminPin,
        owner_phone: rawPhone,
        owner_email: rawEmail
      } = body;

      const millName = (rawMillName || '').trim();
      const ownerName = (rawOwnerName || '').trim();
      const country = (rawCountry || 'فلسطين').trim();
      const cleanUsername = (rawUsername || '').toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '');
      const cleanPassword = (rawPassword || '').trim();
      const cleanAdminPin = (rawAdminPin || '123456').trim();
      const phone = (rawPhone || '').trim();
      const ownerEmail = (rawEmail || '').trim();

      if (!millName || !ownerName || !cleanUsername || !cleanPassword) {
        return new Response(
          JSON.stringify({ error: 'يرجى إدخال اسم المعصرة، واسم المالك، واسم المستخدم، وكلمة المرور' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check unique mill_code / username in mills
      const { data: existingMill } = await supabaseAdmin
        .from('mills')
        .select('id')
        .eq('mill_code', cleanUsername)
        .maybeSingle();

      if (existingMill) {
        return new Response(
          JSON.stringify({ error: `اسم المستخدم / رمز المعصرة "${cleanUsername}" مستخدم بالفعل` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const internalEmail = `${cleanUsername}@smartmill.com`;
      let createdAuthUserId: string | null = null;
      let createdMillId: string | null = null;

      try {
        // 1. Create Auth User via Supabase Auth Admin API
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: internalEmail,
          password: cleanPassword,
          email_confirm: true,
          user_metadata: {
            display_name: ownerName,
            mill_name: millName,
            username: cleanUsername,
            phone: phone || null,
            country: country
          }
        });

        if (authError || !authData.user) {
          throw new Error(authError?.message || 'فشل إنشاء حساب المستخدم في النظام');
        }

        createdAuthUserId = authData.user.id;

        // 2. Create Mill record with owner_user_id
        const { data: millData, error: millError } = await supabaseAdmin
          .from('mills')
          .insert({
            name: millName,
            country: country,
            phone: phone || null,
            secondary_phone: ownerEmail || null,
            subscription_status: 'active',
            owner_user_id: createdAuthUserId,
            mill_code: cleanUsername
          })
          .select('id')
          .single();

        if (millError || !millData) {
          throw millError || new Error('فشل إنشاء سجل المعصرة');
        }

        createdMillId = millData.id;

        // 3. Upsert Profile
        const { error: profError } = await supabaseAdmin
          .from('profiles')
          .upsert({
            user_id: createdAuthUserId,
            display_name: ownerName,
            mill_name: millName,
            phone: phone || null,
            secondary_phone: ownerEmail || null,
            country: country,
            mill_code: cleanUsername,
            subscription_status: 'active',
            is_active: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (profError) throw profError;

        // 3b. Securely hash and set Admin PIN via admin_set_user_pin RPC
        try {
          await supabaseAdmin.rpc('admin_set_user_pin', {
            target_user_id: createdAuthUserId,
            new_pin: cleanAdminPin
          });
        } catch (pinErr) {
          console.warn('Could not set initial admin pin hash:', pinErr);
        }

        // 4. Create Canonical Mill Membership
        const { error: memError } = await supabaseAdmin
          .from('mill_memberships')
          .upsert({
            user_id: createdAuthUserId,
            mill_id: createdMillId,
            role: 'mill_owner',
            username: cleanUsername,
            display_username: ownerName,
            is_active: true,
            created_at: new Date().toISOString()
          }, { onConflict: 'user_id,mill_id' });

        if (memError) throw memError;

        // 5. Assign user_roles
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .upsert({
            user_id: createdAuthUserId,
            role: 'mill_owner'
          }, { onConflict: 'user_id,role' });

        if (roleError) throw roleError;

        // 6. Encrypt and store both account password and Admin PIN in Credential Vault
        if (vaultSecretKey) {
          try {
            const encPassword = await encryptVaultPassword(cleanPassword, vaultSecretKey);
            const encPin = await encryptVaultPassword(cleanAdminPin, vaultSecretKey);
            await supabaseAdmin.from('credential_vault').upsert({
              user_id: createdAuthUserId,
              encrypted_password: encPassword,
              encrypted_admin_pin: encPin,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
          } catch (vaultErr) {
            console.warn('Could not store credentials in vault:', vaultErr);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            user_id: createdAuthUserId,
            mill_id: createdMillId,
            username: cleanUsername,
            display_name: ownerName,
            email: internalEmail,
            password: cleanPassword,
            admin_pin: cleanAdminPin
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (stepErr: any) {
        // Rollback to prevent orphan records
        if (createdAuthUserId) {
          console.warn('Rollback: cleaning up failed account creation for:', createdAuthUserId);
          try {
            await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
            if (createdMillId) await supabaseAdmin.from('mills').delete().eq('id', createdMillId);
            await supabaseAdmin.from('mill_memberships').delete().eq('user_id', createdAuthUserId);
            await supabaseAdmin.from('profiles').delete().eq('user_id', createdAuthUserId);
            await supabaseAdmin.from('user_roles').delete().eq('user_id', createdAuthUserId);
          } catch (cleanupErr) {
            console.error('Failed to rollback user:', cleanupErr);
          }
        }
        throw stepErr;
      }
    }

    // ==========================================
    // ACTION: CREATE_CASHIER / CREATE_EMPLOYEE
    // ==========================================
    if (action === 'create_cashier' || action === 'create_employee') {
      const {
        mill_id: requestedMillId,
        display_name: rawName,
        username: rawUsername,
        password: rawPassword,
        mill_code: rawMillCode
      } = body;

      const cleanName = (rawName || '').trim();
      const cleanUsername = (rawUsername || '').trim();
      const cleanPassword = (rawPassword || '').trim();

      if (!cleanName || !cleanUsername || !cleanPassword) {
        return new Response(
          JSON.stringify({ error: 'يرجى إدخال اسم الموظف، واسم المستخدم، وكلمة المرور' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Resolve target mill
      let targetMill: any = null;
      if (requestedMillId) {
        const { data: mData } = await supabaseAdmin
          .from('mills')
          .select('id, name, mill_code, owner_user_id')
          .or(`id.eq.${requestedMillId},owner_user_id.eq.${requestedMillId}`)
          .maybeSingle();
        targetMill = mData;
      }

      if (!targetMill) {
        return new Response(
          JSON.stringify({ error: 'المعصرة المحددة غير موجودة' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Authorization check: Platform Admin or Mill Owner of this specific mill
      const isOwnerOfMill = targetMill.owner_user_id === callerId;
      if (!isPlatformAdmin && !isOwnerOfMill) {
        return new Response(
          JSON.stringify({ error: 'غير مصرح لك بإنشاء حساب موظف في هذه المعصرة' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const millId = targetMill.id;
      const millCode = (rawMillCode || targetMill.mill_code || 'mill').trim();

      // Check unique username in mill
      const { data: existingUser } = await supabaseAdmin
        .from('mill_memberships')
        .select('id')
        .eq('mill_id', millId)
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (existingUser) {
        return new Response(
          JSON.stringify({ error: `اسم المستخدم "${cleanUsername}" مستخدم مسبقاً في هذه المعصرة` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const emailPrefix = millCode.toLowerCase().replace(/[^a-z0-9]/g, '');
      const userPrefix = cleanUsername.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      const internalEmail = `${emailPrefix}_${userPrefix}@smartmill.com`;

      let createdAuthUserId: string | null = null;

      try {
        // 1. Create Supabase Auth User via Auth Admin API
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: internalEmail,
          password: cleanPassword,
          email_confirm: true,
          user_metadata: {
            display_name: cleanName,
            username: cleanUsername,
            mill_id: millId,
            mill_code: millCode
          }
        });

        if (authError || !authData.user) {
          throw new Error(authError?.message || 'فشل إنشاء حساب المستخدم في النظام');
        }

        createdAuthUserId = authData.user.id;

        // 2. Insert Profile (never store plaintext passwords)
        const { error: profError } = await supabaseAdmin
          .from('profiles')
          .upsert({
            user_id: createdAuthUserId,
            display_name: cleanName,
            phone: cleanUsername,
            mill_code: null,
            subscription_status: 'active',
            is_active: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (profError) throw profError;

        // 3. Insert Canonical Mill Membership
        const { error: memError } = await supabaseAdmin
          .from('mill_memberships')
          .upsert({
            user_id: createdAuthUserId,
            mill_id: millId,
            role: 'mill_employee',
            username: cleanUsername.toLowerCase(),
            display_username: cleanUsername,
            is_active: true,
            created_at: new Date().toISOString()
          }, { onConflict: 'user_id,mill_id' });

        if (memError) throw memError;

        // 4. Assign user_roles
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .upsert({
            user_id: createdAuthUserId,
            role: 'mill_employee'
          }, { onConflict: 'user_id,role' });

        if (roleError) throw roleError;

        // 5. Encrypt and store credential in Credential Vault (if server secret is configured)
        if (vaultSecretKey) {
          try {
            const encrypted = await encryptVaultPassword(cleanPassword, vaultSecretKey);
            await supabaseAdmin.from('credential_vault').upsert({
              user_id: createdAuthUserId,
              encrypted_password: encrypted,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
          } catch (vaultErr) {
            console.warn('Could not store password in vault:', vaultErr);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            user_id: createdAuthUserId,
            username: cleanUsername,
            display_name: cleanName,
            email: internalEmail,
            mill_id: millId
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (stepErr: any) {
        // Rollback on error
        if (createdAuthUserId) {
          console.warn('Rollback: Cleaning up failed account creation for:', createdAuthUserId);
          try {
            await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
            await supabaseAdmin.from('mill_memberships').delete().eq('user_id', createdAuthUserId);
            await supabaseAdmin.from('profiles').delete().eq('user_id', createdAuthUserId);
            await supabaseAdmin.from('user_roles').delete().eq('user_id', createdAuthUserId);
          } catch (cleanupErr) {
            console.error('Failed to rollback user:', cleanupErr);
          }
        }
        throw stepErr;
      }
    }

    // ==========================================
    // ACTION: DISABLE_USER / ENABLE_USER / TOGGLE_ACTIVE
    // ==========================================
    if (action === 'disable_user' || action === 'enable_user' || action === 'toggle_active') {
      const targetUserId = body.user_id;
      const newActiveState = action === 'disable_user' ? false : (action === 'enable_user' ? true : body.is_active);

      if (!targetUserId || typeof newActiveState !== 'boolean') {
        return new Response(
          JSON.stringify({ error: 'Missing parameters (user_id, is_active)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Safeguard: Platform Admin account can NEVER be disabled
      if (targetUserId === '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114') {
        return new Response(
          JSON.stringify({ error: 'لا يمكن تعطيل حساب المشرف العام' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let isOwnerOfTarget = false;
      if (!isPlatformAdmin) {
        const { data: targetMem } = await supabaseAdmin
          .from('mill_memberships')
          .select('mill_id, role, mills!inner(owner_user_id)')
          .eq('user_id', targetUserId)
          .eq('role', 'mill_employee')
          .maybeSingle();

        if (targetMem && (targetMem.mills as any)?.owner_user_id === callerId) {
          isOwnerOfTarget = true;
        }
      }

      if (!isPlatformAdmin && !isOwnerOfTarget) {
        return new Response(
          JSON.stringify({ error: 'غير مصرح لك بتعديل حالة هذا الحساب' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update DB lifecycle fields non-destructively
      const subStatus = newActiveState ? 'active' : 'suspended';
      await Promise.all([
        supabaseAdmin.from('mill_memberships').update({ is_active: newActiveState }).eq('user_id', targetUserId),
        supabaseAdmin.from('profiles').update({ is_active: newActiveState, subscription_status: subStatus, updated_at: new Date().toISOString() }).eq('user_id', targetUserId),
        supabaseAdmin.from('mills').update({ subscription_status: subStatus }).eq('owner_user_id', targetUserId),
        // Ban / Unban in Supabase Auth
        supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          ban_duration: newActiveState ? 'none' : '876600h'
        })
      ]);

      return new Response(
        JSON.stringify({ success: true, user_id: targetUserId, is_active: newActiveState }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==========================================
    // ACTION: RESET_PASSWORD
    // ==========================================
    if (action === 'reset_password') {
      const { user_id: targetUserId, new_password: newPassword } = body;

      if (!targetUserId || !newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
        return new Response(
          JSON.stringify({ error: 'Missing parameters (user_id, new_password)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Safeguard: Platform Admin password cannot be reset by others
      if (targetUserId === '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114' && callerId !== targetUserId) {
        return new Response(
          JSON.stringify({ error: 'لا يمكن تعديل كلمة مرور المشرف العام إلا بواسطة المشرف نفسه' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let isOwnerOfTarget = false;
      if (!isPlatformAdmin) {
        const { data: targetMem } = await supabaseAdmin
          .from('mill_memberships')
          .select('mill_id, role, mills!inner(owner_user_id)')
          .eq('user_id', targetUserId)
          .eq('role', 'mill_employee')
          .maybeSingle();

        if (targetMem && (targetMem.mills as any)?.owner_user_id === callerId) {
          isOwnerOfTarget = true;
        }
      }

      if (!isPlatformAdmin && !isOwnerOfTarget) {
        return new Response(
          JSON.stringify({ error: 'غير مصرح لك بتعيين كلمة مرور هذا الحساب' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update password in Auth Admin API
      const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: newPassword.trim()
      });

      if (resetError) {
        throw resetError;
      }

      // Update Credential Vault if secret configured
      if (vaultSecretKey) {
        try {
          const encrypted = await encryptVaultPassword(newPassword.trim(), vaultSecretKey);
          await supabaseAdmin.from('credential_vault').upsert({
            user_id: targetUserId,
            encrypted_password: encrypted,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
        } catch (vaultErr) {
          console.warn('Could not update vault password:', vaultErr);
        }
      }

      return new Response(
        JSON.stringify({ success: true, user_id: targetUserId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==========================================
    // ACTION: UPDATE_USER
    // ==========================================
    if (action === 'update_user') {
      const { user_id: targetUserId, display_name: rawName, username: rawUsername, password: rawPassword } = body;

      if (!targetUserId) {
        return new Response(
          JSON.stringify({ error: 'Missing user_id parameter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let isOwnerOfTarget = false;
      if (!isPlatformAdmin) {
        const { data: targetMem } = await supabaseAdmin
          .from('mill_memberships')
          .select('mill_id, role, mills!inner(owner_user_id)')
          .eq('user_id', targetUserId)
          .eq('role', 'mill_employee')
          .maybeSingle();

        if (targetMem && (targetMem.mills as any)?.owner_user_id === callerId) {
          isOwnerOfTarget = true;
        }
      }

      if (!isPlatformAdmin && !isOwnerOfTarget) {
        return new Response(
          JSON.stringify({ error: 'غير مصرح لك بتعديل بيانات هذا الحساب' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const updates: any = {};
      if (rawName) updates.display_name = rawName.trim();
      if (rawUsername) updates.phone = rawUsername.trim();

      if (Object.keys(updates).length > 0) {
        await Promise.all([
          supabaseAdmin.from('profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('user_id', targetUserId),
          supabaseAdmin.from('mill_memberships').update({
            display_username: updates.display_name || updates.phone,
            username: updates.phone ? updates.phone.toLowerCase() : undefined
          }).eq('user_id', targetUserId)
        ]);
      }

      // If password provided, update auth and vault
      if (rawPassword && rawPassword.trim()) {
        await supabaseAdmin.auth.admin.updateUserById(targetUserId, { password: rawPassword.trim() });
        if (vaultSecretKey) {
          try {
            const encrypted = await encryptVaultPassword(rawPassword.trim(), vaultSecretKey);
            await supabaseAdmin.from('credential_vault').upsert({
              user_id: targetUserId,
              encrypted_password: encrypted,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
          } catch (vaultErr) {
            console.warn('Could not update vault password:', vaultErr);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, user_id: targetUserId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('admin-manage-user Edge Function Error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
