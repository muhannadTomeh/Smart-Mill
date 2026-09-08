import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppUserRole = "platform_admin" | "mill_owner" | "mill_employee" | null;

export interface Mill {
  id: string;
  name: string;
  mill_code?: string | null;
  country?: string | null;
  location?: string | null;
  phone?: string | null;
  secondary_phone?: string | null;
  subscription_status?: string | null;
  subscription_notes?: string | null;
  monthly_fee?: number | null;
}

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
  parent_mill_id?: string | null;
  subscription_status?: string | null;
  subscription_notes?: string | null;
  monthly_fee?: number | null;
  report_pin?: string | null;
  employee_pin?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  currentMill: Mill | null;
  currentMillId: string | null;
  currentUserId: string | null;
  currentRole: AppUserRole;
  isPlatformAdmin: boolean;
  isMillOwner: boolean;
  isEmployee: boolean;
  effectiveUserId: string | null; // Backward-compatibility alias
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  currentMill: null,
  currentMillId: null,
  currentUserId: null,
  currentRole: null,
  isPlatformAdmin: false,
  isMillOwner: false,
  isEmployee: false,
  effectiveUserId: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentMill, setCurrentMill] = useState<Mill | null>(null);
  const [currentMillId, setCurrentMillId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<AppUserRole>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean>(false);
  const [isMillOwner, setIsMillOwner] = useState<boolean>(false);
  const [isEmployee, setIsEmployee] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const fetchProfileAndRole = useCallback(async (currentUser: User) => {
    try {
      // 1. Check if user is Platform Admin
      let adminRole = false;
      const { data: rpcAdmin } = await supabase.rpc("has_role", {
        _user_id: currentUser.id,
        _role: "platform_admin",
      });

      if (rpcAdmin === true) {
        adminRole = true;
      } else {
        const { data: userRoleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", currentUser.id)
          .eq("role", "platform_admin")
          .maybeSingle();

        if (userRoleRow && userRoleRow.role === "platform_admin") {
          adminRole = true;
        }
      }

      if (adminRole) {
        setIsPlatformAdmin(true);
        setCurrentRole("platform_admin");
        setIsMillOwner(false);
        setIsEmployee(false);
        setCurrentMillId(null);
        setCurrentMill(null);

        // Fetch basic profile
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", currentUser.id)
          .maybeSingle();

        setProfile(prof || {
          display_name: currentUser.user_metadata?.display_name || currentUser.email,
        });
        return;
      }

      setIsPlatformAdmin(false);

      // 2. Fetch membership from mill_memberships
      let resolvedMillId: string | null = null;
      let resolvedRole: AppUserRole = null;
      let resolvedMill: Mill | null = null;

      try {
        const { data: membership } = await supabase
          .from("mill_memberships")
          .select("mill_id, role")
          .eq("user_id", currentUser.id)
          .maybeSingle();

        if (membership) {
          resolvedMillId = membership.mill_id;
          resolvedRole = membership.role as AppUserRole;
        }
      } catch (memErr) {
        console.warn("Could not query mill_memberships directly:", memErr);
      }

      // 3. Fetch profile
      const { data: profData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      // Fallback if mill_memberships row was not found yet
      if (!resolvedMillId) {
        if (profData?.parent_mill_id) {
          resolvedMillId = profData.parent_mill_id;
          resolvedRole = "mill_employee";
        } else {
          resolvedMillId = currentUser.id;
          resolvedRole = "mill_owner";
        }
      }

      // 4. Fetch mill info
      if (resolvedMillId) {
        try {
          const { data: millData } = await supabase
            .from("mills")
            .select("*")
            .eq("id", resolvedMillId)
            .maybeSingle();

          if (millData) {
            resolvedMill = millData as Mill;
          }
        } catch (millErr) {
          console.warn("Could not query mills directly:", millErr);
        }
      }

      // Merge profile branding
      const finalProfile: Profile = profData || {
        display_name: currentUser.user_metadata?.display_name || currentUser.email,
        mill_name: resolvedMill?.name || currentUser.user_metadata?.mill_name || "المعصرة الذكية",
        phone: resolvedMill?.phone || currentUser.user_metadata?.phone,
        secondary_phone: resolvedMill?.secondary_phone || currentUser.user_metadata?.secondary_phone,
        country: resolvedMill?.country || currentUser.user_metadata?.country || "فلسطين",
        mill_location: resolvedMill?.location || currentUser.user_metadata?.mill_location,
      };

      if (resolvedMill) {
        finalProfile.mill_name = resolvedMill.name || finalProfile.mill_name;
        finalProfile.mill_location = resolvedMill.location || finalProfile.mill_location;
        finalProfile.country = resolvedMill.country || finalProfile.country;
        finalProfile.phone = resolvedMill.phone || finalProfile.phone;
        finalProfile.secondary_phone = resolvedMill.secondary_phone || finalProfile.secondary_phone;
        finalProfile.subscription_status = resolvedMill.subscription_status || finalProfile.subscription_status;
      }

      setCurrentMill(resolvedMill);
      setCurrentMillId(resolvedMillId);
      setCurrentRole(resolvedRole);
      setIsMillOwner(resolvedRole === "mill_owner");
      setIsEmployee(resolvedRole === "mill_employee");
      setProfile(finalProfile);
    } catch (err) {
      console.error("Failed to fetch profile and role:", err);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfileAndRole(user);
    }
  }, [user, fetchProfileAndRole]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);
        const currentUser = currentSession?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          fetchProfileAndRole(currentUser).finally(() => setLoading(false));
        } else {
          setProfile(null);
          setCurrentMill(null);
          setCurrentMillId(null);
          setCurrentRole(null);
          setIsPlatformAdmin(false);
          setIsMillOwner(false);
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
        fetchProfileAndRole(currentUser).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setCurrentMill(null);
        setCurrentMillId(null);
        setCurrentRole(null);
        setIsPlatformAdmin(false);
        setIsMillOwner(false);
        setIsEmployee(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfileAndRole]);

  const signOut = async () => {
    setProfile(null);
    setCurrentMill(null);
    setCurrentMillId(null);
    setCurrentRole(null);
    setIsPlatformAdmin(false);
    setIsMillOwner(false);
    setIsEmployee(false);
    await supabase.auth.signOut();
  };

  const effectiveUserId = currentMillId || user?.id || null;
  const currentUserId = user?.id || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        currentMill,
        currentMillId,
        currentUserId,
        currentRole,
        isPlatformAdmin,
        isMillOwner,
        isEmployee,
        effectiveUserId,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

