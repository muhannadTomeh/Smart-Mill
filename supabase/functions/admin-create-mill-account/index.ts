import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    // Log environment check (don't log the keys themselves)
    console.log("Checking environment variables...");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Server configuration error: Missing environment variables');
    }

    // Create a client with the user's token to check roles
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Check if user is platform_admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      throw new Error('Unauthorized');
    }

    const { data: roleData, error: roleError } = await supabaseClient
      .rpc('has_role', { _user_id: user.id, _role: 'platform_admin' });

    if (roleError || !roleData) {
      console.error('Role check failed:', roleError, roleData);
      throw new Error('Forbidden: Only platform_admin can create accounts');
    }

    // Get request body
    const body = await req.json();
    const { email, password, mill_name, owner_name, phone, secondary_phone, country } = body;

    if (!email || !password || !mill_name || !owner_name) {
      throw new Error('Missing required fields');
    }

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log(`Creating user for ${email}...`);

    // 1. Create User in Auth
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: owner_name,
        mill_name: mill_name,
        phone: phone || '',
        secondary_phone: secondary_phone || '',
        country: country || ''
      }
    });

    if (createError) {
      console.error('Create user error:', createError);
      throw createError;
    }

    const newUserId = newUser.user.id;
    console.log(`User created: ${newUserId}`);

    // 2. Profile and Role
    const [profileResult, roleResult] = await Promise.all([
      supabaseAdmin.from('profiles').upsert({
        user_id: newUserId,
        display_name: owner_name,
        mill_name: mill_name,
        phone: phone || null,
        secondary_phone: secondary_phone || null,
        country: country || null,
        subscription_status: 'active',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' }),
      supabaseAdmin.from('user_roles').insert({
        user_id: newUserId,
        role: 'mill_owner'
      })
    ]);

    if (profileResult.error) console.error('Profile upsert error:', profileResult.error);
    if (roleResult.error) console.error('Role assign error:', roleResult.error);

    // 3. Create independent Mill record and Mill Membership
    try {
      const { data: newMill, error: millError } = await supabaseAdmin
        .from('mills')
        .insert({
          name: mill_name,
          owner_user_id: newUserId,
          country: country || 'فلسطين',
          phone: phone || null,
          secondary_phone: secondary_phone || null,
          subscription_status: 'active',
        })
        .select('id')
        .single();

      if (!millError && newMill) {
        await supabaseAdmin.from('mill_memberships').insert({
          mill_id: newMill.id,
          user_id: newUserId,
          role: 'mill_owner',
          display_username: owner_name,
        });
      } else if (millError) {
        console.warn('Note: mills table insert skipped or not yet available:', millError.message);
      }
    } catch (millEx) {
      console.warn('Error inserting into mills table:', millEx);
    }

    return new Response(
      JSON.stringify({ message: 'Account created successfully', user: newUser.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Edge Function Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
