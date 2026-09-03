import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { useRole } from "./RoleContext";

export type SubscriptionStatus = 'pending' | 'active' | 'suspended';

interface SubscriptionContextType {
  status: SubscriptionStatus | null;
  loading: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  status: null,
  loading: true,
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      if (!user) {
        setStatus(null);
        setLoading(false);
        return;
      }

      // Skip check for admins
      if (isAdmin === true) {
        setStatus('active');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_status, parent_mill_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error || !data) {
        console.error("Error fetching subscription status:", error);
        setStatus('pending');
      } else if (data.parent_mill_id) {
        // If employee/cashier, inherit subscription status from parent mill
        const { data: parentData } = await supabase
          .from('profiles')
          .select('subscription_status')
          .eq('user_id', data.parent_mill_id)
          .maybeSingle();
        setStatus((parentData?.subscription_status || data.subscription_status || 'active') as SubscriptionStatus);
      } else {
        setStatus((data.subscription_status || 'pending') as SubscriptionStatus);
      }
      setLoading(false);
    };

    if (isAdmin !== null) {
      fetchStatus();
    }
  }, [user, isAdmin]);

  return (
    <SubscriptionContext.Provider value={{ status, loading }}>
      {children}
    </SubscriptionContext.Provider>
  );
};
