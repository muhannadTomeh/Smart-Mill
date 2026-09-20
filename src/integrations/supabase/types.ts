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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
      business_command_receipts: {
        Row: {
          actor_user_id: string
          command_name: string
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          mill_id: string | null
          operation_id: string | null
          result: Json | null
          season_id: string | null
          state: string
        }
        Insert: {
          actor_user_id: string
          command_name: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          mill_id?: string | null
          operation_id?: string | null
          result?: Json | null
          season_id?: string | null
          state?: string
        }
        Update: {
          actor_user_id?: string
          command_name?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          mill_id?: string | null
          operation_id?: string | null
          result?: Json | null
          season_id?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_command_receipts_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_command_receipts_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_command_receipts_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      business_operation_audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          operation_id: string
          reason: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          operation_id: string
          reason?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          operation_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_operation_audit_events_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_operation_dependencies: {
        Row: {
          child_operation_id: string
          created_at: string
          dependency_type: string
          parent_operation_id: string
        }
        Insert: {
          child_operation_id: string
          created_at?: string
          dependency_type: string
          parent_operation_id: string
        }
        Update: {
          child_operation_id?: string
          created_at?: string
          dependency_type?: string
          parent_operation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_operation_dependencies_child_operation_id_fkey"
            columns: ["child_operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_operation_dependencies_parent_operation_id_fkey"
            columns: ["parent_operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_operations: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          id: string
          mill_id: string
          operation_type: string
          reverses_operation_id: string | null
          season_id: string
          source_id: string | null
          source_type: string
          status: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          mill_id: string
          operation_type: string
          reverses_operation_id?: string | null
          season_id: string
          source_id?: string | null
          source_type: string
          status?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          mill_id?: string
          operation_type?: string
          reverses_operation_id?: string | null
          season_id?: string
          source_id?: string | null
          source_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_operations_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_operations_reverses_operation_id_fkey"
            columns: ["reverses_operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_operations_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_reveal_events: {
        Row: {
          actor_user_id: string
          created_at: string
          credential_type: string
          id: string
          outcome: string
          target_user_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          credential_type: string
          id?: string
          outcome: string
          target_user_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          credential_type?: string
          id?: string
          outcome?: string
          target_user_id?: string
        }
        Relationships: []
      }
      credential_vault: {
        Row: {
          created_at: string
          encrypted_admin_pin: string | null
          encrypted_password: string | null
          encryption_version: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_admin_pin?: string | null
          encrypted_password?: string | null
          encryption_version?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_admin_pin?: string | null
          encrypted_password?: string | null
          encryption_version?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          mill_id: string
          notes: string | null
          payment_method: string
          season_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          mill_id: string
          notes?: string | null
          payment_method?: string
          season_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          mill_id?: string
          notes?: string | null
          payment_method?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_customer_payments_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          mill_id: string | null
          name: string
          phone: string | null
          season_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          mill_id?: string | null
          name: string
          phone?: string | null
          season_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          mill_id?: string | null
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
          {
            foreignKeyName: "fk_customers_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_inventory: {
        Row: {
          cash_amount: number
          container_count: number
          created_at: string
          id: string
          inventory_date: string
          mill_id: string | null
          oil_amount: number
          season_id: string
          user_id: string
        }
        Insert: {
          cash_amount?: number
          container_count?: number
          created_at?: string
          id?: string
          inventory_date?: string
          mill_id?: string | null
          oil_amount?: number
          season_id: string
          user_id: string
        }
        Update: {
          cash_amount?: number
          container_count?: number
          created_at?: string
          id?: string
          inventory_date?: string
          mill_id?: string | null
          oil_amount?: number
          season_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_inventory_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_daily_inventory_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          mill_id: string | null
          name: string
          season_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mill_id?: string | null
          name: string
          season_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mill_id?: string | null
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
          {
            foreignKeyName: "fk_expense_categories_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          cash_location: string | null
          category: string
          created_at: string
          description: string | null
          id: string
          mill_id: string | null
          partner_id: string | null
          payable_id: string | null
          payment_method: string | null
          season_id: string | null
          supplier_id: string | null
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          cash_location?: string | null
          category: string
          created_at?: string
          description?: string | null
          id?: string
          mill_id?: string | null
          partner_id?: string | null
          payable_id?: string | null
          payment_method?: string | null
          season_id?: string | null
          supplier_id?: string | null
          user_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          cash_location?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          mill_id?: string | null
          partner_id?: string | null
          payable_id?: string | null
          payment_method?: string | null
          season_id?: string | null
          supplier_id?: string | null
          user_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "payables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expenses_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_command_receipts: {
        Row: {
          actor_user_id: string
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          result: Json | null
        }
        Insert: {
          actor_user_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          result?: Json | null
        }
        Update: {
          actor_user_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          result?: Json | null
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          direction: Database["public"]["Enums"]["financial_direction"]
          id: string
          idempotency_key: string | null
          mill_id: string
          operation_id: string
          party_id: string | null
          party_name: string | null
          party_type: string | null
          payment_method: Database["public"]["Enums"]["financial_payment_method"]
          reference_id: string | null
          reference_type: string
          reversal_of: string | null
          reversal_reason: string | null
          season_id: string
          status: Database["public"]["Enums"]["financial_tx_status"]
          type: Database["public"]["Enums"]["financial_tx_type"]
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction: Database["public"]["Enums"]["financial_direction"]
          id?: string
          idempotency_key?: string | null
          mill_id: string
          operation_id: string
          party_id?: string | null
          party_name?: string | null
          party_type?: string | null
          payment_method?: Database["public"]["Enums"]["financial_payment_method"]
          reference_id?: string | null
          reference_type?: string
          reversal_of?: string | null
          reversal_reason?: string | null
          season_id: string
          status?: Database["public"]["Enums"]["financial_tx_status"]
          type: Database["public"]["Enums"]["financial_tx_type"]
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction?: Database["public"]["Enums"]["financial_direction"]
          id?: string
          idempotency_key?: string | null
          mill_id?: string
          operation_id?: string
          party_id?: string | null
          party_name?: string | null
          party_type?: string | null
          payment_method?: Database["public"]["Enums"]["financial_payment_method"]
          reference_id?: string | null
          reference_type?: string
          reversal_of?: string | null
          reversal_reason?: string | null
          season_id?: string
          status?: Database["public"]["Enums"]["financial_tx_status"]
          type?: Database["public"]["Enums"]["financial_tx_type"]
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "financial_effective_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_financial_transactions_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          id: string
          mill_id: string | null
          season_id: string | null
          total_cash: number
          total_oil: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          mill_id?: string | null
          season_id?: string | null
          total_cash?: number
          total_oil?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          mill_id?: string | null
          season_id?: string | null
          total_cash?: number
          total_oil?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_inventory_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_effect_links: {
        Row: {
          cash_financial_transaction_id: string | null
          created_at: string
          invoice_id: string
          mill_id: string
          operation_id: string
          season_id: string
          settlement_oil_movement_id: string | null
        }
        Insert: {
          cash_financial_transaction_id?: string | null
          created_at?: string
          invoice_id: string
          mill_id: string
          operation_id: string
          season_id: string
          settlement_oil_movement_id?: string | null
        }
        Update: {
          cash_financial_transaction_id?: string | null
          created_at?: string
          invoice_id?: string
          mill_id?: string
          operation_id?: string
          season_id?: string
          settlement_oil_movement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_effect_links_cash_financial_transaction_id_fkey"
            columns: ["cash_financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_effective_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_effect_links_cash_financial_transaction_id_fkey"
            columns: ["cash_financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_effect_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_effect_links_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_effect_links_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_effect_links_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_effect_links_settlement_oil_movement_id_fkey"
            columns: ["settlement_oil_movement_id"]
            isOneToOne: false
            referencedRelation: "oil_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_product_lines: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          line_total: number
          mill_id: string
          product_id: string
          product_name_snapshot: string
          quantity: number
          season_id: string
          unit_price_snapshot: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          line_total?: number
          mill_id: string
          product_id: string
          product_name_snapshot: string
          quantity: number
          season_id: string
          unit_price_snapshot?: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          line_total?: number
          mill_id?: string
          product_id?: string
          product_name_snapshot?: string
          quantity?: number
          season_id?: string
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_product_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_product_lines_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_product_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_product_lines_season_id_fkey"
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
          mill_id: string | null
          oil_amount: number
          oil_produced: number
          payment_type: string
          season_id: string | null
          total_display: string
          unpaid_amount: number | null
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          cash_amount?: number
          container_count: number
          container_type?: string
          created_at?: string
          customer_id?: string | null
          customer_name: string
          id?: string
          mill_id?: string | null
          oil_amount?: number
          oil_produced: number
          payment_type: string
          season_id?: string | null
          total_display: string
          unpaid_amount?: number | null
          user_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          cash_amount?: number
          container_count?: number
          container_type?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          id?: string
          mill_id?: string | null
          oil_amount?: number
          oil_produced?: number
          payment_type?: string
          season_id?: string | null
          total_display?: string
          unpaid_amount?: number | null
          user_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_invoices_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
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
      mill_memberships: {
        Row: {
          created_at: string | null
          display_username: string | null
          id: string
          is_active: boolean
          mill_id: string
          role: string
          updated_at: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string | null
          display_username?: string | null
          id?: string
          is_active?: boolean
          mill_id: string
          role: string
          updated_at?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string | null
          display_username?: string | null
          id?: string
          is_active?: boolean
          mill_id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_mill_memberships_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
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
          subscription_notes: string | null
          subscription_status: string | null
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
          subscription_notes?: string | null
          subscription_status?: string | null
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
          subscription_notes?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      obligation_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          financial_transaction_id: string | null
          id: string
          mill_id: string
          movement_type: string
          operation_id: string | null
          payable_id: string
          payment_method: string | null
          reason: string | null
          reversal_of: string | null
          season_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          financial_transaction_id?: string | null
          id?: string
          mill_id: string
          movement_type: string
          operation_id?: string | null
          payable_id: string
          payment_method?: string | null
          reason?: string | null
          reversal_of?: string | null
          season_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          financial_transaction_id?: string | null
          id?: string
          mill_id?: string
          movement_type?: string
          operation_id?: string | null
          payable_id?: string
          payment_method?: string | null
          reason?: string | null
          reversal_of?: string | null
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obligation_movements_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_effective_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "payables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "obligation_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "payable_settlement_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      oil_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          direction: string
          id: string
          idempotency_key: string | null
          mill_id: string
          movement_type: string
          notes: string | null
          ownership: string
          party_name: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
          season_id: string
          source_type: string
          unit_price: number
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          direction: string
          id?: string
          idempotency_key?: string | null
          mill_id: string
          movement_type: string
          notes?: string | null
          ownership: string
          party_name?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          season_id: string
          source_type: string
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          direction?: string
          id?: string
          idempotency_key?: string | null
          mill_id?: string
          movement_type?: string
          notes?: string | null
          ownership?: string
          party_name?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          season_id?: string
          source_type?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "oil_movements_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oil_movements_season_id_fkey"
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
          cancellation_operation_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          id: string
          mill_id: string | null
          notes: string | null
          payable_id: string | null
          payment_method: string
          party_name: string | null
          price: number
          season_id: string | null
          total_price: number
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          cancellation_operation_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          mill_id?: string | null
          notes?: string | null
          payable_id?: string | null
          payment_method?: string
          party_name?: string | null
          price: number
          season_id?: string | null
          total_price: number
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          cancellation_operation_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          mill_id?: string | null
          notes?: string | null
          payable_id?: string | null
          payment_method?: string
          party_name?: string | null
          price?: number
          season_id?: string | null
          total_price?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oil_transactions_cancellation_operation_id_fkey"
            columns: ["cancellation_operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_oil_transactions_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oil_transactions_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "payables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oil_transactions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          active: boolean
          created_at: string
          id: string
          mill_id: string
          name: string
          notes: string | null
          phone: string | null
          share_percent: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          mill_id: string
          name: string
          notes?: string | null
          phone?: string | null
          share_percent?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          mill_id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          share_percent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      payables: {
        Row: {
          created_at: string
          created_by: string | null
          creditor_name: string
          id: string
          mill_id: string
          notes: string | null
          original_amount: number
          paid_amount: number
          partner_id: string | null
          remaining_amount: number
          season_id: string
          source_id: string | null
          source_type: string
          status: string
          supplier_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          creditor_name: string
          id?: string
          mill_id: string
          notes?: string | null
          original_amount: number
          paid_amount?: number
          partner_id?: string | null
          remaining_amount: number
          season_id: string
          source_id?: string | null
          source_type: string
          status?: string
          supplier_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          creditor_name?: string
          id?: string
          mill_id?: string
          notes?: string | null
          original_amount?: number
          paid_amount?: number
          partner_id?: string | null
          remaining_amount?: number
          season_id?: string
          source_id?: string | null
          source_type?: string
          status?: string
          supplier_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payables_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payables_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payables_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payables_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_purchases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mill_id: string
          notes: string | null
          partner_id: string | null
          payment_method: string
          product_id: string
          quantity: number
          season_id: string
          supplier_id: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mill_id: string
          notes?: string | null
          partner_id?: string | null
          payment_method: string
          product_id: string
          quantity: number
          season_id: string
          supplier_id?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mill_id?: string
          notes?: string | null
          partner_id?: string | null
          payment_method?: string
          product_id?: string
          quantity?: number
          season_id?: string
          supplier_id?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_purchases_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_purchases_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_purchases_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          mill_id: string
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          season_id: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          mill_id: string
          notes?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          season_id: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          mill_id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          season_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_movements_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_movements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          current_stock: number
          default_purchase_price: number
          default_sale_price: number
          description: string | null
          id: string
          mill_id: string
          name: string
          product_type: string
          sku: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          current_stock?: number
          default_purchase_price?: number
          default_sale_price?: number
          description?: string | null
          id?: string
          mill_id: string
          name: string
          product_type?: string
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          current_stock?: number
          default_purchase_price?: number
          default_sale_price?: number
          description?: string | null
          id?: string
          mill_id?: string
          name?: string
          product_type?: string
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          admin_pin_hash: string | null
          avatar_url: string | null
          country: string | null
          created_at: string
          display_name: string | null
          employee_pin: string | null
          id: string
          is_active: boolean
          mill_code: string | null
          mill_location: string | null
          mill_name: string | null
          monthly_fee: number | null
          parent_mill_id: string | null
          phone: string | null
          report_pin: string | null
          secondary_phone: string | null
          subscription_notes: string | null
          subscription_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_pin_hash?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          employee_pin?: string | null
          id?: string
          is_active?: boolean
          mill_code?: string | null
          mill_location?: string | null
          mill_name?: string | null
          monthly_fee?: number | null
          parent_mill_id?: string | null
          phone?: string | null
          report_pin?: string | null
          secondary_phone?: string | null
          subscription_notes?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_pin_hash?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          employee_pin?: string | null
          id?: string
          is_active?: boolean
          mill_code?: string | null
          mill_location?: string | null
          mill_name?: string | null
          monthly_fee?: number | null
          parent_mill_id?: string | null
          phone?: string | null
          report_pin?: string | null
          secondary_phone?: string | null
          subscription_notes?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      queue: {
        Row: {
          bags: number
          customer_id: string | null
          created_at: string
          estimated_minutes: number | null
          id: string
          mill_id: string | null
          name: string
          notes: string | null
          phone: string | null
          position: number | null
          season_id: string | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          bags: number
          customer_id?: string | null
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          mill_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          position?: number | null
          season_id?: string | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          bags?: number
          customer_id?: string | null
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          mill_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          position?: number | null
          season_id?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_queue_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      receivable_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          customer_id: string
          customer_payment_id: string | null
          financial_transaction_id: string | null
          id: string
          invoice_id: string | null
          mill_id: string
          movement_type: string
          operation_id: string | null
          reason: string | null
          reversal_of: string | null
          season_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          customer_id: string
          customer_payment_id?: string | null
          financial_transaction_id?: string | null
          id?: string
          invoice_id?: string | null
          mill_id: string
          movement_type: string
          operation_id?: string | null
          reason?: string | null
          reversal_of?: string | null
          season_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          customer_id?: string
          customer_payment_id?: string | null
          financial_transaction_id?: string | null
          id?: string
          invoice_id?: string | null
          mill_id?: string
          movement_type?: string
          operation_id?: string | null
          reason?: string | null
          reversal_of?: string | null
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivable_movements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_movements_customer_payment_id_fkey"
            columns: ["customer_payment_id"]
            isOneToOne: false
            referencedRelation: "customer_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_movements_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_effective_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_movements_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_movements_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_movements_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_movements_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_movements_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "receivable_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_movements_season_id_fkey"
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
          display_settings: Json | null
          end_date: string | null
          id: string
          metal_container_price: number
          mill_id: string | null
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
          display_settings?: Json | null
          end_date?: string | null
          id?: string
          metal_container_price?: number
          mill_id?: string | null
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
          display_settings?: Json | null
          end_date?: string | null
          id?: string
          metal_container_price?: number
          mill_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "fk_seasons_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          cash_return_cost: number
          created_at: string
          id: string
          metal_container_price: number
          mill_id: string | null
          oil_buy_price: number
          oil_sell_price: number
          plastic_container_price: number
          return_percent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_return_cost?: number
          created_at?: string
          id?: string
          metal_container_price?: number
          mill_id?: string | null
          oil_buy_price?: number
          oil_sell_price?: number
          plastic_container_price?: number
          return_percent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cash_return_cost?: number
          created_at?: string
          id?: string
          metal_container_price?: number
          mill_id?: string | null
          oil_buy_price?: number
          oil_sell_price?: number
          plastic_container_price?: number
          return_percent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_settings_mill_id"
            columns: ["mill_id"]
            isOneToOne: true
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
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
          recorded_by: string
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
        Relationships: [
          {
            foreignKeyName: "fk_subscription_payments_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          mill_id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          mill_id: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          mill_id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
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
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
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
          mill_id: string | null
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
          mill_id?: string | null
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
          mill_id?: string | null
          notes?: string | null
          season_id?: string | null
          shifts?: number | null
          user_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_work_records_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
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
          mill_id: string | null
          notes: string | null
          season_id: string | null
          user_id: string
          worker_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          mill_id?: string | null
          notes?: string | null
          season_id?: string | null
          user_id: string
          worker_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          mill_id?: string | null
          notes?: string | null
          season_id?: string | null
          user_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_worker_payments_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
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
          mill_id: string | null
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
          mill_id?: string | null
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
          mill_id?: string | null
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
            foreignKeyName: "fk_workers_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
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
      customer_receivable_balances: {
        Row: {
          customer_id: string | null
          mill_id: string | null
          outstanding_amount: number | null
          season_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receivable_movements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_movements_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_movements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_effective_events: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          direction: Database["public"]["Enums"]["financial_direction"] | null
          id: string | null
          idempotency_key: string | null
          mill_id: string | null
          operation_id: string | null
          party_id: string | null
          party_name: string | null
          party_type: string | null
          payment_method:
            | Database["public"]["Enums"]["financial_payment_method"]
            | null
          reference_id: string | null
          reference_type: string | null
          reversal_of: string | null
          reversal_reason: string | null
          season_id: string | null
          status: Database["public"]["Enums"]["financial_tx_status"] | null
          type: Database["public"]["Enums"]["financial_tx_type"] | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          direction?: Database["public"]["Enums"]["financial_direction"] | null
          id?: string | null
          idempotency_key?: string | null
          mill_id?: string | null
          operation_id?: string | null
          party_id?: string | null
          party_name?: string | null
          party_type?: string | null
          payment_method?:
            | Database["public"]["Enums"]["financial_payment_method"]
            | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_of?: string | null
          reversal_reason?: string | null
          season_id?: string | null
          status?: Database["public"]["Enums"]["financial_tx_status"] | null
          type?: Database["public"]["Enums"]["financial_tx_type"] | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          direction?: Database["public"]["Enums"]["financial_direction"] | null
          id?: string | null
          idempotency_key?: string | null
          mill_id?: string | null
          operation_id?: string | null
          party_id?: string | null
          party_name?: string | null
          party_type?: string | null
          payment_method?:
            | Database["public"]["Enums"]["financial_payment_method"]
            | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_of?: string | null
          reversal_reason?: string | null
          season_id?: string | null
          status?: Database["public"]["Enums"]["financial_tx_status"] | null
          type?: Database["public"]["Enums"]["financial_tx_type"] | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "financial_effective_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_financial_transactions_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      mill_cash_balance: {
        Row: {
          cash_balance: number | null
          mill_id: string | null
          season_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_financial_transactions_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      mill_cash_reconciliation: {
        Row: {
          ledger_cash: number | null
          mill_id: string | null
          season_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_financial_transactions_mill_id"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
        ]
      }
      mill_oil_balance: {
        Row: {
          current_balance: number | null
          mill_id: string | null
          milling_settlements: number | null
          oil_balance: number | null
          oil_purchased: number | null
          oil_sold: number | null
          adjustments: number | null
          season_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oil_movements_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oil_movements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      payable_settlement_history: {
        Row: {
          amount: number | null
          created_at: string | null
          financial_transaction_id: string | null
          id: string | null
          mill_id: string | null
          movement_type: string | null
          operation_id: string | null
          payable_id: string | null
          payment_method: string | null
          reason: string | null
          reversal_of: string | null
          reversed: boolean | null
          season_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          financial_transaction_id?: string | null
          id?: string | null
          mill_id?: string | null
          movement_type?: string | null
          operation_id?: string | null
          payable_id?: string | null
          payment_method?: string | null
          reason?: string | null
          reversal_of?: string | null
          reversed?: never
          season_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          financial_transaction_id?: string | null
          id?: string | null
          mill_id?: string | null
          movement_type?: string | null
          operation_id?: string | null
          payable_id?: string | null
          payment_method?: string | null
          reason?: string | null
          reversal_of?: string | null
          reversed?: never
          season_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "obligation_movements_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_effective_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_mill_id_fkey"
            columns: ["mill_id"]
            isOneToOne: false
            referencedRelation: "mills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "business_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "payables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "obligation_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "payable_settlement_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_movements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_product_stock_command: {
        Args: {
          p_idempotency_key: string
          p_notes: string
          p_product_id: string
          p_quantity: number
          p_season_id: string
        }
        Returns: Json
      }
      admin_create_cashier: {
        Args: {
          p_display_name: string
          p_mill_code?: string
          p_parent_mill_id: string
          p_password: string
          p_username: string
        }
        Returns: Json
      }
      admin_create_mill: {
        Args: {
          p_country?: string
          p_mill_name: string
          p_owner_email?: string
          p_owner_name?: string
          p_owner_phone?: string
          p_password?: string
          p_username?: string
        }
        Returns: Json
      }
      admin_delete_mill: { Args: { p_mill_id: string }; Returns: Json }
      admin_set_user_pin: {
        Args: { new_pin: string; target_user_id: string }
        Returns: boolean
      }
      can_access_mill_data: {
        Args: { p_owner_user_id: string }
        Returns: boolean
      }
      cancel_invoice_lifecycle_command: {
        Args: {
          p_idempotency_key: string
          p_invoice_id: string
          p_reason: string
        }
        Returns: Json
      }
      cancel_oil_trade_command: {
        Args: {
          p_idempotency_key: string
          p_oil_transaction_id: string
          p_reason: string
        }
        Returns: Json
      }
      check_user_mill_access: { Args: { p_mill_id: string }; Returns: boolean }
      claim_financial_command: {
        Args: { p_idempotency_key: string; p_operation: string }
        Returns: Json
      }
      collect_invoice_receivable_lifecycle_command: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_invoice_id: string
          p_notes: string
        }
        Returns: Json
      }
      complete_financial_command: {
        Args: { p_idempotency_key: string; p_result: Json }
        Returns: undefined
      }
      create_deferred_invoice_lifecycle_command: {
        Args: {
          p_container_count: number
          p_container_lines: Json
          p_container_type: string
          p_customer_id: string
          p_customer_name: string
          p_idempotency_key: string
          p_oil_amount: number
          p_oil_produced: number
          p_queue_id: string
          p_receivable_amount: number
          p_season_id: string
          p_total_display: string
        }
        Returns: Json
      }
      create_invoice_command: {
        Args: {
          p_cash_amount: number
          p_container_count: number
          p_container_type: string
          p_customer_id: string
          p_customer_name: string
          p_idempotency_key: string
          p_oil_amount: number
          p_oil_produced: number
          p_payment_type: string
          p_queue_id: string
          p_season_id: string
          p_total_display: string
        }
        Returns: string
      }
      create_invoice_lifecycle_command: {
        Args: {
          p_cash_amount: number
          p_container_count: number
          p_container_lines?: Json
          p_container_type: string
          p_customer_id: string
          p_customer_name: string
          p_idempotency_key?: string
          p_oil_amount: number
          p_oil_produced: number
          p_payment_type: string
          p_queue_id: string
          p_season_id: string
          p_total_display: string
        }
        Returns: Json
      }
      drop_all_policies_on_table: {
        Args: { p_table_name: string }
        Returns: undefined
      }
      get_auth_user_accessible_user_ids: { Args: never; Returns: string[] }
      get_auth_user_mill_ids: { Args: never; Returns: string[] }
      get_auth_user_owned_mill_ids: { Args: never; Returns: string[] }
      get_current_mill_id: { Args: never; Returns: string }
      get_effective_mill_id: { Args: never; Returns: string }
      get_my_effective_user_id: { Args: never; Returns: string }
      get_my_mill_id: { Args: never; Returns: string }
      get_public_queue: {
        Args: { p_season_id: string }
        Returns: {
          bags: number
          estimated_minutes: number
          id: string
          name: string
          notes: string
          queue_position: number
          started_at: string
          status: string
        }[]
      }
      get_public_season_display: {
        Args: { p_season_id: string }
        Returns: {
          display_settings: Json
          metal_container_price: number
          name: string
          oil_buy_price: number
          oil_sell_price: number
          plastic_container_price: number
          return_percent: number
        }[]
      }
      get_user_mill_id: { Args: { _user_id: string }; Returns: string }
      has_active_mill_role: {
        Args: { p_mill_id: string; p_roles?: string[] }
        Returns: boolean
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_cashier: { Args: never; Returns: boolean }
      is_mill_owner_of: {
        Args: { _mill_id: string; _uid?: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _uid?: string }; Returns: boolean }
      log_admin_access: {
        Args: { admin_action: string; target_user_id: string }
        Returns: undefined
      }
      lookup_cashier_by_username: {
        Args: { p_username: string }
        Returns: {
          ambiguous: boolean
          found_email: string
        }[]
      }
      pay_worker_and_settle: {
        Args: {
          p_amount: number
          p_notes: string
          p_season_id: string
          p_user_id: string
          p_worker_id: string
        }
        Returns: undefined
      }
      pay_worker_command: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_notes: string
          p_season_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      record_cash_opening_balance_command: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_notes: string
          p_season_id: string
        }
        Returns: Json
      }
      record_customer_payment_atomic: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_notes: string
          p_season_id: string
        }
        Returns: string
      }
      record_customer_payment_command: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_idempotency_key: string
          p_notes: string
          p_season_id: string
        }
        Returns: string
      }
      record_expense_atomic: {
        Args: {
          p_amount: number
          p_category: string
          p_description?: string
          p_season_id: string
        }
        Returns: string
      }
      record_expense_command: {
        Args: {
          p_amount: number
          p_category: string
          p_creditor_name: string
          p_description: string
          p_idempotency_key: string
          p_partner_id: string
          p_partner_name: string
          p_payment_method: string
          p_season_id: string
          p_supplier_id: string
        }
        Returns: Json
      }
      record_expense_v2: {
        Args: {
          p_amount: number
          p_category: string
          p_creditor_name: string
          p_description: string
          p_partner_id: string
          p_partner_name: string
          p_payment_method: string
          p_season_id: string
          p_supplier_id: string
        }
        Returns: Json
      }
      record_oil_trade_atomic: {
        Args: {
          p_amount: number
          p_notes?: string
          p_price: number
          p_season_id: string
          p_type: string
        }
        Returns: string
      }
      record_oil_trade_command: {
        Args: {
          p_idempotency_key?: string
          p_movement_type: string
          p_notes?: string
          p_party_name?: string
          p_payment_method?: string
          p_quantity: number
          p_season_id: string
          p_unit_price: number
        }
        Returns: Json
      }
      record_oil_transaction_command: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_notes: string
          p_party_name: string
          p_price: number
          p_season_id: string
          p_type: string
        }
        Returns: string
      }
      record_partner_transaction_atomic: {
        Args: {
          p_amount: number
          p_notes: string
          p_partner_id: string
          p_season_id: string
          p_type: string
        }
        Returns: Json
      }
      record_partner_transaction_command: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_notes: string
          p_partner_id: string
          p_season_id: string
          p_type: string
        }
        Returns: Json
      }
      archive_master_data_command: {
        Args: { p_entity: string; p_id: string }
        Returns: Json
      }
      record_product_purchase_atomic: {
        Args: {
          p_idempotency_key?: string
          p_notes?: string
          p_partner_id?: string
          p_partner_name?: string
          p_payment_method: string
          p_product_id: string
          p_quantity: number
          p_sale_price?: number
          p_season_id: string
          p_supplier_id?: string
          p_unit_price: number
        }
        Returns: Json
      }
      record_vault_deposit_command: {
        Args: {
          p_amount: number
          p_idempotency_key?: string
          p_notes?: string
          p_partner_id?: string
          p_partner_name?: string
          p_season_id: string
        }
        Returns: Json
      }
      register_worker_session: {
        Args: {
          p_notes: string
          p_season_id: string
          p_user_id: string
          p_val: number
          p_worker_id: string
        }
        Returns: undefined
      }
      reverse_invoice_collection_lifecycle_command: {
        Args: {
          p_idempotency_key: string
          p_movement_id: string
          p_reason: string
        }
        Returns: Json
      }
      reverse_payable_settlement_lifecycle_command: {
        Args: {
          p_idempotency_key: string
          p_movement_id: string
          p_reason: string
        }
        Returns: Json
      }
      set_admin_pin: { Args: { new_pin: string }; Returns: boolean }
      set_employee_pin: { Args: { new_pin: string }; Returns: undefined }
      set_report_pin: { Args: { new_pin: string }; Returns: undefined }
      settle_payable_atomic: {
        Args: {
          p_amount: number
          p_notes: string
          p_payable_id: string
          p_payment_method: string
        }
        Returns: Json
      }
      settle_payable_command: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_notes: string
          p_payable_id: string
          p_payment_method: string
        }
        Returns: Json
      }
      settle_payable_lifecycle_command: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_notes: string
          p_payable_id: string
          p_payment_method: string
        }
        Returns: Json
      }
      verify_admin_pin: { Args: { input_pin: string }; Returns: boolean }
      verify_employee_pin: {
        Args: { input_pin: string; owner_id: string }
        Returns: boolean
      }
      verify_report_pin: { Args: { input_pin: string }; Returns: boolean }
      void_expense_and_reverse: {
        Args: { p_expense_id: string; p_reason?: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "platform_admin" | "mill_owner" | "mill_employee"
      financial_direction: "in" | "out" | "none"
      financial_payment_method: "cash" | "oil" | "mixed" | "credit"
      financial_tx_status: "active" | "voided"
      financial_tx_type:
        | "income"
        | "expense"
        | "stock_purchase"
        | "stock_sale"
        | "worker_payment"
        | "customer_debt"
        | "customer_payment"
        | "supplier_payment"
        | "owner_deposit"
        | "owner_withdrawal"
        | "adjustment"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["platform_admin", "mill_owner", "mill_employee"],
      financial_direction: ["in", "out", "none"],
      financial_payment_method: ["cash", "oil", "mixed", "credit"],
      financial_tx_status: ["active", "voided"],
      financial_tx_type: [
        "income",
        "expense",
        "stock_purchase",
        "stock_sale",
        "worker_payment",
        "customer_debt",
        "customer_payment",
        "supplier_payment",
        "owner_deposit",
        "owner_withdrawal",
        "adjustment",
      ],
      subscription_status: ["pending", "active", "suspended"],
    },
  },
} as const
