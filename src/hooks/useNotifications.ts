import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type NotificationCategory = "general" | "payment_due" | "update";

export interface AppNotification {
  id: string;
  recipient_user_id: string;
  mill_id: string | null;
  title: string;
  message: string;
  category: NotificationCategory;
  action_url: string | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  read_at: string | null;
}

export function useNotifications(limit = 100, realtime = false) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["app-notifications", user?.id, limit] as const;

  const query = useQuery({
    queryKey,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from("app_notifications")
        .select("id, recipient_user_id, mill_id, title, message, category, action_url, source_type, source_id, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as AppNotification[];
    },
  });

  useEffect(() => {
    if (!realtime || !user?.id) return;

    const channel = supabase
      .channel(`app-notifications-${user.id}-${limit}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifications",
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["app-notifications", user.id] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [limit, queryClient, realtime, user?.id]);

  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { data, error } = await supabase.rpc("mark_notification_read_command", {
        p_notification_id: notificationId,
      });
      if (error) throw error;
      return Boolean(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["app-notifications", user?.id] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("mark_all_notifications_read_command");
      if (error) throw error;
      return Number(data || 0);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["app-notifications", user?.id] });
    },
  });

  const notifications = query.data || [];
  const unreadCount = notifications.reduce((count, item) => count + (item.read_at ? 0 : 1), 0);

  return {
    ...query,
    notifications,
    unreadCount,
    markRead,
    markAllRead,
  };
}
