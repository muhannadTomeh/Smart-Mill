import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Derive a standard AES-GCM 256-bit CryptoKey from the server environment secret
async function getAesKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt plaintext into base64 format "iv:ciphertext"
async function encryptPassword(plainText: string, secret: string): Promise<string> {
  const key = await getAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const ivB64 = btoa(String.fromCharCode(...iv));
  const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuffer)));
  return `${ivB64}:${cipherB64}`;
}

// Decrypt base64 format "iv:ciphertext" into plaintext
async function decryptPassword(encryptedPayload: string, secret: string): Promise<string> {
  const parts = encryptedPayload.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted credential payload format');
  }
  const [ivB64, cipherB64] = parts;
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
  const key = await getAesKey(secret);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipher
  );
  return new TextDecoder().decode(decryptedBuffer);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    // Secret encryption key from Supabase Edge Function Secrets (NEVER hardcoded, NO fallback key)
    const vaultSecretKey = Deno.env.get('CREDENTIAL_VAULT_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Server configuration error: Missing environment configuration');
    }

    if (!vaultSecretKey) {
      return new Response(
        JSON.stringify({ error: 'CREDENTIAL_VAULT_KEY is not configured in Supabase Secrets' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate caller
    const supabaseCallerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user: callerUser }, error: callerError } = await supabaseCallerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerId = callerUser.id;

    // Service client for privileged DB access
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { action, user_id: targetUserId, password: newPassword } = body;

    if (!action || !targetUserId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters (action, user_id)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Platform Admin user_id safeguard: '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'
    const isPlatformAdmin = (callerId === '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114') || !!(
      await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', callerId)
        .eq('role', 'platform_admin')
        .maybeSingle()
    ).data;

    const isSelf = (callerId === targetUserId);

    // Authorization check
    let isAuthorized = false;
    if (isPlatformAdmin) {
      isAuthorized = true;
    } else {
      // Non-admins can NEVER access Platform Admin credentials
      if (targetUserId === '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114') {
        return new Response(
          JSON.stringify({ error: 'غير مصرح لك بالوصول لبيانات حساب المشرف العام' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // An authenticated user is authorized to store/update their own credential
      if (isSelf && action === 'store') {
        isAuthorized = true;
      } else {
        // Mill Owner check: allowed to store or reveal cashiers (mill_employee) of their own mill
        const { data: targetMembership } = await supabaseAdmin
          .from('mill_memberships')
          .select('mill_id, role, mills!inner(owner_user_id)')
          .eq('user_id', targetUserId)
          .eq('role', 'mill_employee')
          .maybeSingle();

        if (targetMembership && (targetMembership.mills as any)?.owner_user_id === callerId) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'غير مصرح لك بالوصول إلى خزينة بيانات الاعتماد لهذا الحساب' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: REVEAL
    if (action === 'reveal') {
      const { data: vaultRow, error: vaultErr } = await supabaseAdmin
        .from('credential_vault')
        .select('encrypted_password')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (vaultErr) {
        throw vaultErr;
      }

      if (!vaultRow?.encrypted_password) {
        return new Response(
          JSON.stringify({ password: null, message: 'No stored vault password for this user' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const decrypted = await decryptPassword(vaultRow.encrypted_password, vaultSecretKey);

      // Log reveal action for security compliance
      try {
        await supabaseAdmin.from('admin_audit_log').insert({
          admin_id: callerId,
          action: 'credential_vault_reveal',
          target_user_id: targetUserId,
          details: {
            revealed_by: callerId,
            timestamp: new Date().toISOString()
          }
        });
      } catch (logErr) {
        console.warn('Could not record to admin_audit_log:', logErr);
      }

      return new Response(
        JSON.stringify({ password: decrypted }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: STORE
    if (action === 'store') {
      if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
        return new Response(
          JSON.stringify({ error: 'Missing or empty password' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const cipherText = await encryptPassword(newPassword.trim(), vaultSecretKey);
      const { error: upsertErr } = await supabaseAdmin
        .from('credential_vault')
        .upsert({
          user_id: targetUserId,
          encrypted_password: cipherText,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (upsertErr) {
        throw upsertErr;
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Credential stored in vault successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Credential Vault Edge Function Error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
