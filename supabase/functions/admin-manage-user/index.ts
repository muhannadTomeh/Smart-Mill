import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const vaultSecretKey = Deno.env.get('CREDENTIAL_VAULT_KEY') || serviceRoleKey;

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

    // Service role client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { action } = body;

    // Platform Admin check
    const isPlatformAdmin = (callerId === '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114') || !!(
      await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', callerId)
        .eq('role', 'platform_admin')
        .maybeSingle()
    ).data;

    // ==========================================
    // ACTION: CREATE_EMPLOYEE
    // ==========================================
    if (action === 'create_employee') {
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

      // Resolve mill
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

        // 2. Insert Profile
        const { error: profError } = await supabaseAdmin
          .from('profiles')
          .upsert({
            user_id: createdAuthUserId,
            display_name: cleanName,
            phone: cleanUsername,
            mill_code: millCode,
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

        // 5. Encrypt and store credential in Credential Vault
        if (vaultSecretKey) {
          const enc = new TextEncoder();
          const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(vaultSecretKey));
          const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt']);
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(cleanPassword));
          const payload = `${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(cipherBuffer)))}`;

          await supabaseAdmin
            .from('credential_vault')
            .upsert({
              user_id: createdAuthUserId,
              encrypted_password: payload,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
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
        // Clean Rollback to prevent orphan Auth accounts
        if (createdAuthUserId) {
          console.warn('Rollback: Cleaning up failed account creation for:', createdAuthUserId);
          try {
            await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
            await supabaseAdmin.from('mill_memberships').delete().eq('user_id', createdAuthUserId);
            await supabaseAdmin.from('profiles').delete().eq('user_id', createdAuthUserId);
          } catch (cleanupErr) {
            console.error('Failed to rollback user:', cleanupErr);
          }
        }
        throw stepErr;
      }
    }

    // ==========================================
    // ACTION: TOGGLE_ACTIVE (Disable / Re-enable)
    // ==========================================
    if (action === 'toggle_active') {
      const { user_id: targetUserId, is_active: newActiveState } = body;

      if (!targetUserId || typeof newActiveState !== 'boolean') {
        return new Response(
          JSON.stringify({ error: 'Missing parameters (user_id, is_active)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Safeguard: Platform Admin account cannot be disabled
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

      // Update DB lifecycle fields
      await Promise.all([
        supabaseAdmin.from('mill_memberships').update({ is_active: newActiveState }).eq('user_id', targetUserId),
        supabaseAdmin.from('profiles').update({ is_active: newActiveState, updated_at: new Date().toISOString() }).eq('user_id', targetUserId),
        // Ban in Supabase Auth to invalidate tokens if disabled
        supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          ban_duration: newActiveState ? 'none' : '876600h'
        })
      ]);

      return new Response(
        JSON.stringify({ success: true, user_id: targetUserId, is_active: newActiveState }),
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
