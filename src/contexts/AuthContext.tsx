import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id?: string;
  user_id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  secondary_phone?: string | null;
  country?: string | null;
  mill_name?: string | null;
  mill_location?: string | null;
  subscription_status?: string | null;
  subscription_notes?: string | null;
  monthly_fee?: number | null;
  report_pin?: string | null;
  is_active?: boolean;
}

export type UserRole = 'platform_admin' | 'mill_owner' | 'mill_employee';

export interface MillInfo {
  id: string;
  name: string;
  mill_code: string | null;
  location: string | null;
  country: string | null;
  phone: string | null;
  secondary_phone: string | null;
  subscription_status: string | null;
  monthly_fee: number | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** Canonical tenant ID — always mills.id, never owner_user_id */
  millId: string | null;
  mill: MillInfo | null;
  role: UserRole | null;
  isAdmin: boolean;
  isOwner: boolean;
  isEmployee: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  millId: null,
  mill: null,
  role: null,
  isAdmin: false,
  isOwner: false,
  isEmployee: false,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [millId, setMillId] = useState<string | null>(null);
  const [mill, setMill] = useState<MillInfo | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [isEmployee, setIsEmployee] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (currentUser: User) => {
    try {
      // 1. Check if Platform Admin (canonical: user_roles table)
      let userIsAdmin = currentUser.id === '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114';
      if (!userIsAdmin) {
        try {
          const { data: adminRole } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUser.id)
            .eq('role', 'platform_admin')
            .maybeSingle();

          if (adminRole) {
            userIsAdmin = true;
          }
        } catch (roleErr) {
          console.warn("Could not check user_roles:", roleErr);
        }
      }

      setIsAdmin(userIsAdmin);

      // 2. Canonical tenant resolution: auth.uid() → mill_memberships → mill_id
      let resolvedMillId: string | null = null;
      let resolvedRole: UserRole | null = userIsAdmin ? 'platform_admin' : null;
      let resolvedMill: MillInfo | null = null;
      let isUserActive = true;

      try {
        const { data: membership } = await supabase
          .from('mill_memberships')
          .select('id, mill_id, role, username, display_username, is_active')
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (membership) {
          if (membership.is_active === false) {
            isUserActive = false;
          }
          if (membership.mill_id) {
            resolvedMillId = membership.mill_id;
            resolvedRole = (membership.role as UserRole) || (userIsAdmin ? 'platform_admin' : 'mill_owner');
          }
        }
      } catch (memErr) {
        console.warn("Could not query mill_memberships:", memErr);
      }

      // Check profiles is_active
      try {
        const { data: profActive } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (profActive && profActive.is_active === false) {
          isUserActive = false;
        }
      } catch (pActiveErr) {
        console.warn("Could not check profile is_active:", pActiveErr);
      }

      // If user is disabled/archived, sign out immediately
      if (!userIsAdmin && !isUserActive) {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
        setMillId(null);
        setMill(null);
        setRole(null);
        return;
      }

      // Fetch mill details from mills table using canonical mill_id
      if (resolvedMillId) {
        try {
          const { data: millRecord } = await supabase
            .from('mills')
            .select('id, name, mill_code, location, country, phone, secondary_phone, subscription_status, monthly_fee')
            .eq('id', resolvedMillId)
            .maybeSingle();

          if (millRecord) {
            resolvedMill = millRecord;
          }
        } catch (millErr) {
          console.warn("Could not query mill record:", millErr);
        }
      }

      setMillId(resolvedMillId);
      setMill(resolvedMill);
      setRole(resolvedRole);
      setIsOwner(resolvedRole === 'mill_owner');
      setIsEmployee(resolvedRole === 'mill_employee');

      // 3. Fetch Personal Profile (display name, phone, etc.)
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (profileData && !profileErr) {
        const enrichedProfile: Profile = {
          ...profileData,
          mill_name: resolvedMill?.name || profileData.mill_name,
          mill_location: resolvedMill?.location || profileData.mill_location,
          country: resolvedMill?.country || profileData.country,
        };
        setProfile(enrichedProfile);
        if (resolvedMill?.name) {
          try { localStorage.setItem("mill_name", resolvedMill.name); } catch (e) { void e; }
        }
      } else {
        setProfile({
          display_name: currentUser.user_metadata?.display_name || currentUser.email,
          mill_name: resolvedMill?.name || currentUser.user_metadata?.mill_name || "المعصرة الذكية",
          phone: currentUser.user_metadata?.phone,
          secondary_phone: currentUser.user_metadata?.secondary_phone,
          country: resolvedMill?.country || currentUser.user_metadata?.country || "فلسطين",
          mill_location: resolvedMill?.location || currentUser.user_metadata?.mill_location,
        });
      }
    } catch (err) {
      console.error("Failed to fetch user data:", err);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchUserData(user);
    }
  }, [user, fetchUserData]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);
        const currentUser = currentSession?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          fetchUserData(currentUser).finally(() => setLoading(false));
        } else {
          setProfile(null);
          setMillId(null);
          setMill(null);
          setRole(null);
          setIsAdmin(false);
          setIsOwner(false);
          setIsEmployee(false);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchUserData(currentUser).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setMillId(null);
        setMill(null);
        setRole(null);
        setIsAdmin(false);
        setIsOwner(false);
        setIsEmployee(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  const signOut = async () => {
    setProfile(null);
    setMillId(null);
    setMill(null);
    setRole(null);
    setIsAdmin(false);
    setIsOwner(false);
    setIsEmployee(false);

    try {
      localStorage.removeItem('is_platform_admin');
      localStorage.removeItem('employee_owner_id');
      localStorage.removeItem('mill_name');
    } catch (e) {
      void e;
    }

    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        millId,
        mill,
        role,
        isAdmin,
        isOwner,
        isEmployee,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
