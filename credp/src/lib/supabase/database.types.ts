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
      capture_items: {
        Row: {
          ai_status: string
          ai_summary: string | null
          captured_at: string | null
          created_at: string | null
          documentation_session_id: string
          extracted_data: Json
          id: string
          ocr_text: string | null
          organization_id: string
          storage_path: string | null
          thumbnail_path: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          ai_status?: string
          ai_summary?: string | null
          captured_at?: string | null
          created_at?: string | null
          documentation_session_id: string
          extracted_data?: Json
          id?: string
          ocr_text?: string | null
          organization_id: string
          storage_path?: string | null
          thumbnail_path?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          ai_status?: string
          ai_summary?: string | null
          captured_at?: string | null
          created_at?: string | null
          documentation_session_id?: string
          extracted_data?: Json
          id?: string
          ocr_text?: string | null
          organization_id?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "capture_items_documentation_session_id_fkey"
            columns: ["documentation_session_id"]
            isOneToOne: false
            referencedRelation: "documentation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_profiles: {
        Row: {
          address: string | null
          company_name: string | null
          created_at: string | null
          default_report_footer: string | null
          email: string | null
          id: string
          logo_url: string | null
          organization_id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          company_name?: string | null
          created_at?: string | null
          default_report_footer?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          organization_id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string | null
          created_at?: string | null
          default_report_footer?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documentation_sessions: {
        Row: {
          asset_label: string | null
          created_at: string | null
          created_by: string
          customer_name: string | null
          finalized_at: string | null
          id: string
          industry: string | null
          odometer: string | null
          organization_id: string
          session_type: string
          source_template_id: string | null
          started_at: string | null
          status: string
          title: string
          unit_number: string | null
          updated_at: string | null
          vin: string | null
        }
        Insert: {
          asset_label?: string | null
          created_at?: string | null
          created_by: string
          customer_name?: string | null
          finalized_at?: string | null
          id?: string
          industry?: string | null
          odometer?: string | null
          organization_id: string
          session_type?: string
          source_template_id?: string | null
          started_at?: string | null
          status?: string
          title: string
          unit_number?: string | null
          updated_at?: string | null
          vin?: string | null
        }
        Update: {
          asset_label?: string | null
          created_at?: string | null
          created_by?: string
          customer_name?: string | null
          finalized_at?: string | null
          id?: string
          industry?: string | null
          odometer?: string | null
          organization_id?: string
          session_type?: string
          source_template_id?: string | null
          started_at?: string | null
          status?: string
          title?: string
          unit_number?: string | null
          updated_at?: string | null
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentation_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentation_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentation_sessions_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "documentation_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      documentation_templates: {
        Row: {
          created_at: string | null
          id: string
          industry: string | null
          name: string
          organization_id: string | null
          raw_text: string | null
          structured_items: Json
          template_source: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          industry?: string | null
          name: string
          organization_id?: string | null
          raw_text?: string | null
          structured_items?: Json
          template_source?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          industry?: string | null
          name?: string
          organization_id?: string | null
          raw_text?: string | null
          structured_items?: Json
          template_source?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentation_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          created_at: string | null
          documentation_session_id: string
          export_type: string
          id: string
          organization_id: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string | null
          documentation_session_id: string
          export_type: string
          id?: string
          organization_id: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string | null
          documentation_session_id?: string
          export_type?: string
          id?: string
          organization_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exports_documentation_session_id_fkey"
            columns: ["documentation_session_id"]
            isOneToOne: false
            referencedRelation: "documentation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      findings: {
        Row: {
          capture_item_id: string | null
          category: string | null
          component: string | null
          created_at: string | null
          description: string | null
          documentation_session_id: string
          id: string
          location: string | null
          measurement_unit: string | null
          measurement_value: string | null
          organization_id: string
          severity: string | null
          status: string
          title: string
          updated_at: string | null
          user_approved: boolean
        }
        Insert: {
          capture_item_id?: string | null
          category?: string | null
          component?: string | null
          created_at?: string | null
          description?: string | null
          documentation_session_id: string
          id?: string
          location?: string | null
          measurement_unit?: string | null
          measurement_value?: string | null
          organization_id: string
          severity?: string | null
          status?: string
          title: string
          updated_at?: string | null
          user_approved?: boolean
        }
        Update: {
          capture_item_id?: string | null
          category?: string | null
          component?: string | null
          created_at?: string | null
          description?: string | null
          documentation_session_id?: string
          id?: string
          location?: string | null
          measurement_unit?: string | null
          measurement_value?: string | null
          organization_id?: string
          severity?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          user_approved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "findings_capture_item_id_fkey"
            columns: ["capture_item_id"]
            isOneToOne: false
            referencedRelation: "capture_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "findings_documentation_session_id_fkey"
            columns: ["documentation_session_id"]
            isOneToOne: false
            referencedRelation: "documentation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "findings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          industry: string | null
          name: string
          plan: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          industry?: string | null
          name: string
          plan?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          industry?: string | null
          name?: string
          plan?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          organization_id: string
          phone: string | null
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          organization_id: string
          phone?: string | null
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string
          phone?: string | null
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          id: string
          organization_id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          organization_id: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          organization_id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          capture_item_id: string | null
          created_at: string | null
          description: string | null
          documentation_session_id: string
          event_time: string | null
          event_type: string | null
          id: string
          organization_id: string
          title: string
        }
        Insert: {
          capture_item_id?: string | null
          created_at?: string | null
          description?: string | null
          documentation_session_id: string
          event_time?: string | null
          event_type?: string | null
          id?: string
          organization_id: string
          title: string
        }
        Update: {
          capture_item_id?: string | null
          created_at?: string | null
          description?: string | null
          documentation_session_id?: string
          event_time?: string | null
          event_type?: string | null
          id?: string
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_capture_item_id_fkey"
            columns: ["capture_item_id"]
            isOneToOne: false
            referencedRelation: "capture_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_documentation_session_id_fkey"
            columns: ["documentation_session_id"]
            isOneToOne: false
            referencedRelation: "documentation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          organization_id: string
          quantity: number
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          organization_id: string
          quantity?: number
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          organization_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_organization_admin: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      is_organization_member: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
