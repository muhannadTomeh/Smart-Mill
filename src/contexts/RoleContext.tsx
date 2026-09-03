import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RoleContextType {
  isAdmin: boolean | null;
  isEmployee: boolean;
  loading: boolean;
}

const RoleContext = createContext<RoleContextType>({
  isAdmin: null,
  isEmployee: false,
  loading: true,
});

export const useRole = () => useContext(RoleContext);

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isEmployee, setIsEmployee] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkRole = async (userId: string) => {
      // 1. Check for legacy employee session in local storage first
      const employeeOwnerId = localStorage.getItem('employee_owner_id');
      if (employeeOwnerId) {
        if (isMounted) {
          setIsEmployee(true);
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      try {
        // 2. Check if this user is a sub-account / cashier employee of a mill
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('parent_mill_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (profileRow?.parent_mill_id) {
          if (isMounted) {
            setIsEmployee(true);
            setIsAdmin(false);
            setLoading(false);
          }
          return;
        }

        // 3. Check for Admin role (RPC or Table)
        let adminStatus = false;
        const { data: rpcData, error: rpcError } = await supabase.rpc('has_role', {
          _user_id: userId,
          _role: 'platform_admin'
        });

        if (!rpcError && rpcData === true) {
          adminStatus = true;
        } else {
          const { data: roleRow } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', userId)
            .eq('role', 'platform_admin')
            .maybeSingle();

          if (roleRow && roleRow.role === 'platform_admin') {
            adminStatus = true;
          }
        }

        if (isMounted) {
          setIsAdmin(adminStatus);
          setIsEmployee(false);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error checking role:", err);
        if (isMounted) {
          setIsAdmin(false);
          setIsEmployee(false);
          setLoading(false);
        }
      }
    };

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        if (isMounted) {
          setIsAdmin(false);
          setIsEmployee(false);
          setLoading(false);
        }
      } else {
        checkRole(session.user.id);
      }
    });

    // Also check current session immediately on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        checkRole(session.user.id);
      } else {
        if (isMounted) {
          setIsAdmin(false);
          setIsEmployee(false);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <RoleContext.Provider value={{ isAdmin, isEmployee, loading }}>
      {children}
    </RoleContext.Provider>
  );
};
