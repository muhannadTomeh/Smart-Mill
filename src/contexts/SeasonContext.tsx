import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Season {
  id: string;
  user_id: string;
  mill_id?: string | null;
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
  const { user, millId } = useAuth();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (millId || user?.id) {
      fetchSeasons();
    } else {
      setSeasons([]);
      setLoading(false);
    }
  }, [millId, user?.id]);

  const fetchSeasons = async () => {
    if (!millId && !user?.id) {
      setLoading(false);
      return;
    }

    try {
      // 1. Canonical: query seasons by mill_id
      if (millId) {
        const { data, error } = await supabase
          .from("seasons")
          .select("*")
          .eq("mill_id", millId)
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          setSeasons((data as Season[]) || []);
          setLoading(false);
          return;
        }
      }

      // 2. Fallback: query by user_id for unmigrated seasons
      if (user?.id) {
        const { data } = await supabase
          .from("seasons")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        setSeasons((data as Season[]) || []);
      }
    } catch (err) {
      console.error("Error fetching seasons:", err);
    } finally {
      setLoading(false);
    }
  };

  const enterSeason = async (seasonId: string) => {
    if (!millId && !user?.id) return;

    if (millId) {
      // Deactivate active season for this mill
      await supabase
        .from("seasons")
        .update({ status: "closed" })
        .eq("mill_id", millId)
        .eq("status", "active");
      // Activate selected season
      await supabase
        .from("seasons")
        .update({ status: "active" })
        .eq("id", seasonId)
        .eq("mill_id", millId);
    } else if (user?.id) {
      await supabase
        .from("seasons")
        .update({ status: "closed" })
        .eq("user_id", user.id)
        .eq("status", "active");
      await supabase
        .from("seasons")
        .update({ status: "active" })
        .eq("id", seasonId)
        .eq("user_id", user.id);
    }

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

