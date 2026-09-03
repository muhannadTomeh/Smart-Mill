export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string | null
          id: string
          viewed_user_id: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string | null
          id?: string
          viewed_user_id: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string | null
          id?: string
          viewed_user_id?: string
        }
        Relationships: []
      }
      container_types: {
        Row: {
          created_at: string
          id: string
          name: string
          price: number
          season_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          price?: number
          season_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          price?: number
          season_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "container_types_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string | null
          season_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          season_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          season_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          season_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          season_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          season_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          season_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string | null
          id?: string
          season_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          season_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          id: string
          season_id: string | null
          total_cash: number
          total_oil: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          season_id?: string | null
          total_cash?: number
          total_oil?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          season_id?: string | null
          total_cash?: number
          total_oil?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cash_amount: number
          container_count: number
          container_type: string
          created_at: string
          customer_id: string | null
          customer_name: string
          id: string
          oil_amount: number
          oil_produced: number
          payment_type: string
          season_id: string | null
          total_display: string
          user_id: string
        }
        Insert: {
          cash_amount?: number
          container_count: number
          container_type?: string
          created_at?: string
          customer_id?: string | null
          customer_name: string
          id?: string
          oil_amount?: number
          oil_produced: number
          payment_type: string
          season_id?: string | null
          total_display: string
          user_id: string
        }
        Update: {
          cash_amount?: number
          container_count?: number
          container_type?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          id?: string
          oil_amount?: number
          oil_produced?: number
          payment_type?: string
          season_id?: string | null
          total_display?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      oil_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          party_name: string | null
          price: number
          season_id: string | null
          total_price: number
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          party_name?: string | null
          price: number
          season_id?: string | null
          total_price: number
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          party_name?: string | null
          price?: number
          season_id?: string | null
          total_price?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oil_transactions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          mill_code: string | null
          mill_location: string | null
          mill_name: string | null
          monthly_fee: number | null
          parent_mill_id: string | null
          phone: string | null
          report_pin: string | null
          secondary_phone: string | null
          subscription_notes: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          mill_code?: string | null
          mill_location?: string | null
          mill_name?: string | null
          monthly_fee?: number | null
          parent_mill_id?: string | null
          phone?: string | null
          report_pin?: string | null
          secondary_phone?: string | null
          subscription_notes?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          mill_code?: string | null
          mill_location?: string | null
          mill_name?: string | null
          monthly_fee?: number | null
          parent_mill_id?: string | null
          phone?: string | null
          report_pin?: string | null
          secondary_phone?: string | null
          subscription_notes?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      queue: {
        Row: {
          bags: number
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          position: number | null
          season_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          bags: number
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          position?: number | null
          season_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          bags?: number
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          position?: number | null
          season_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          cash_return_cost: number
          created_at: string
          end_date: string | null
          id: string
          metal_container_price: number
          name: string
          oil_buy_price: number
          oil_sell_price: number
          plastic_container_price: number
          return_percent: number
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_return_cost?: number
          created_at?: string
          end_date?: string | null
          id?: string
          metal_container_price?: number
          name: string
          oil_buy_price?: number
          oil_sell_price?: number
          plastic_container_price?: number
          return_percent?: number
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cash_return_cost?: number
          created_at?: string
          end_date?: string | null
          id?: string
          metal_container_price?: number
          name?: string
          oil_buy_price?: number
          oil_sell_price?: number
          plastic_container_price?: number
          return_percent?: number
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          mill_id: string | null
          mill_user_id: string
          notes: string | null
          payment_date: string
          recorded_by: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          mill_id?: string | null
          mill_user_id: string
          notes?: string | null
          payment_date?: string
          recorded_by?: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          mill_id?: string | null
          mill_user_id?: string
          notes?: string | null
          payment_date?: string
          recorded_by?: string
        }
        Relationships: []
      }
      mills: {
        Row: {
          country: string | null
          created_at: string | null
          id: string
          location: string | null
          mill_code: string | null
          monthly_fee: number | null
          name: string
          owner_user_id: string | null
          phone: string | null
          secondary_phone: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"] | null
          updated_at: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          id?: string
          location?: string | null
          mill_code?: string | null
          monthly_fee?: number | null
          name: string
          owner_user_id?: string | null
          phone?: string | null
          secondary_phone?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"] | null
          updated_at?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string | null
          id?: string
          location?: string | null
          mill_code?: string | null
          monthly_fee?: number | null
          name?: string
          owner_user_id?: string | null
          phone?: string | null
          secondary_phone?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      mill_memberships: {
        Row: {
          created_at: string | null
          display_username: string | null
          id: string
          mill_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          display_username?: string | null
          id?: string
          mill_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          display_username?: string | null
          id?: string
          mill_id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_records: {
        Row: {
          amount: number
          created_at: string
          hours: number | null
          id: string
          notes: string | null
          season_id: string | null
          shifts: number | null
          user_id: string
          worker_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          hours?: number | null
          id?: string
          notes?: string | null
          season_id?: string | null
          shifts?: number | null
          user_id: string
          worker_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          hours?: number | null
          id?: string
          notes?: string | null
          season_id?: string | null
          shifts?: number | null
          user_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_records_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_records_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          season_id: string | null
          user_id: string
          worker_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          season_id?: string | null
          user_id: string
          worker_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          season_id?: string | null
          user_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          created_at: string
          hourly_rate: number | null
          id: string
          name: string
          phone: string | null
          season_id: string | null
          shift_rate: number | null
          total_earned: number
          total_paid: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hourly_rate?: number | null
          id?: string
          name: string
          phone?: string | null
          season_id?: string | null
          shift_rate?: number | null
          total_earned?: number
          total_paid?: number
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hourly_rate?: number | null
          id?: string
          name?: string
          phone?: string | null
          season_id?: string | null
          shift_rate?: number | null
          total_earned?: number
          total_paid?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workers_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_invoice_and_settle: {
        Args: {
          p_cash_amount: number
          p_container_count: number
          p_container_type: string
          p_customer_id?: string
          p_customer_name: string
          p_oil_amount: number
          p_oil_produced: number
          p_payment_type: string
          p_queue_id?: string
          p_season_id: string
          p_total_display: string
        }
        Returns: string
      }
      get_public_queue: {
        Args: { p_season_id: string }
        Returns: {
          bags: number
          id: string
          name: string
          position: number
          status: string
        }[]
      }
      get_public_season_display: {
        Args: { p_season_id: string }
        Returns: {
          metal_container_price: number
          name: string
          oil_buy_price: number
          oil_sell_price: number
          plastic_container_price: number
          return_percent: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_admin_access: {
        Args: { admin_action: string; target_user_id: string }
        Returns: undefined
      }
      set_report_pin: { Args: { new_pin: string }; Returns: undefined }
      verify_report_pin: { Args: { input_pin: string }; Returns: boolean }
      admin_create_mill: {
        Args: {
          p_country: string
          p_mill_name: string
          p_owner_email?: string | null
          p_owner_name: string
          p_owner_phone: string
          p_password: string
          p_username: string
        }
        Returns: Json
      }
      admin_create_cashier: {
        Args: {
          p_country?: string
          p_display_name: string
          p_location?: string
          p_parent_mill_id: string
          p_password: string
          p_username: string
        }
        Returns: Json
      }
      lookup_cashier_by_username: {
        Args: { p_username: string }
        Returns: {
          ambiguous: boolean
          found_email: string
        }[]
      }
      verify_employee_pin: {
        Args: { input_pin: string; owner_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "platform_admin" | "mill_owner" | "mill_employee"
      subscription_status: "pending" | "active" | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["platform_admin", "mill_owner"],
      subscription_status: ["pending", "active", "suspended"],
    },
  },
} as const
