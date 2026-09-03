import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Season {
  id: string;
  user_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  return_percent: number;
  oil_sell_price: number;
  oil_buy_price: number;
  cash_return_cost: number;
  plastic_container_price: number;
  metal_container_price: number;
  created_at: string;
  updated_at: string;
}

interface SeasonContextType {
  seasons: Season[];
  activeSeason: Season | null;
  loading: boolean;
  refetch: () => Promise<void>;
  enterSeason: (seasonId: string) => Promise<void>;
  closeSeason: (seasonId: string) => Promise<void>;
}

const SeasonContext = createContext<SeasonContextType>({
  seasons: [],
  activeSeason: null,
  loading: true,
  refetch: async () => {},
  enterSeason: async () => {},
  closeSeason: async () => {},
});

export const useSeason = () => useContext(SeasonContext);

export const SeasonProvider = ({ children }: { children: ReactNode }) => {
  const { user, effectiveUserId } = useAuth();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);

  const targetUserId = effectiveUserId || user?.id;

  useEffect(() => {
    if (targetUserId) {
      fetchSeasons();
    } else {
      setSeasons([]);
      setLoading(false);
    }
  }, [targetUserId]);

  const fetchSeasons = async () => {
    if (!targetUserId) return;
    const { data } = await supabase
      .from("seasons")
      .select("*")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });
    setSeasons((data as Season[]) || []);
    setLoading(false);
  };

  const enterSeason = async (seasonId: string) => {
    if (!user) return;
    // Deactivate all seasons first
    await supabase
      .from("seasons")
      .update({ status: "closed" })
      .eq("user_id", user.id)
      .eq("status", "active");
    // Activate selected season
    await supabase
      .from("seasons")
      .update({ status: "active" })
      .eq("id", seasonId);
    await fetchSeasons();
  };

  const closeSeason = async (seasonId: string) => {
    await supabase
      .from("seasons")
      .update({ status: "closed" })
      .eq("id", seasonId);
    await fetchSeasons();
  };

  const activeSeason = seasons.find((s) => s.status === "active") || null;

  return (
    <SeasonContext.Provider value={{ seasons, activeSeason, loading, refetch: fetchSeasons, enterSeason, closeSeason }}>
      {children}
    </SeasonContext.Provider>
  );
};
