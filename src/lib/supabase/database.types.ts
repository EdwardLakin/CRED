export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          industry: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          plan: 'individual' | 'team' | 'shop' | 'enterprise' | null
          subscription_status: string | null
          current_period_end: string | null
          trial_ends_at: string | null
          billing_started_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          industry: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: 'individual' | 'team' | 'shop' | 'enterprise' | null
          subscription_status?: string | null
          current_period_end?: string | null
          trial_ends_at?: string | null
          billing_started_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          industry?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: 'individual' | 'team' | 'shop' | 'enterprise' | null
          subscription_status?: string | null
          current_period_end?: string | null
          trial_ends_at?: string | null
          billing_started_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      organization_usage_events: {
        Row: {
          id: string
          organization_id: string
          event_type: string
          quantity: number
          metadata: Json
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          event_type: string
          quantity?: number
          metadata?: Json
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          event_type?: string
          quantity?: number
          metadata?: Json
          created_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'organization_usage_events_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'organization_usage_events_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          full_name: string
          role: 'owner' | 'admin' | 'member'
          created_at: string | null
          inspector_role_or_title: string | null
          technician_license_number: string | null
          inspector_phone: string | null
          inspector_email: string | null
          timezone: string
          default_signature_path: string | null
          use_default_signature: boolean
        }
        Insert: {
          id?: string
          user_id: string
          organization_id: string
          full_name: string
          role: 'owner' | 'admin' | 'member'
          created_at?: string | null
          inspector_role_or_title?: string | null
          technician_license_number?: string | null
          inspector_phone?: string | null
          inspector_email?: string | null
          timezone?: string
          default_signature_path?: string | null
          use_default_signature?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          organization_id?: string
          full_name?: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string | null
          inspector_role_or_title?: string | null
          technician_license_number?: string | null
          inspector_phone?: string | null
          inspector_email?: string | null
          timezone?: string
          default_signature_path?: string | null
          use_default_signature?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      company_profiles: {
        Row: {
          id: string
          organization_id: string
          company_name: string
          created_at: string | null
          facility_name: string | null
          facility_number: string | null
          facility_address_line_1: string | null
          facility_address_line_2: string | null
          facility_city: string | null
          facility_region: string | null
          facility_postal_code: string | null
          facility_country: string | null
          facility_phone: string | null
          facility_email: string | null
          permit_number: string | null
          certification_number: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          company_name: string
          created_at?: string | null
          facility_name?: string | null
          facility_number?: string | null
          facility_address_line_1?: string | null
          facility_address_line_2?: string | null
          facility_city?: string | null
          facility_region?: string | null
          facility_postal_code?: string | null
          facility_country?: string | null
          facility_phone?: string | null
          facility_email?: string | null
          permit_number?: string | null
          certification_number?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          company_name?: string
          created_at?: string | null
          facility_name?: string | null
          facility_number?: string | null
          facility_address_line_1?: string | null
          facility_address_line_2?: string | null
          facility_city?: string | null
          facility_region?: string | null
          facility_postal_code?: string | null
          facility_country?: string | null
          facility_phone?: string | null
          facility_email?: string | null
          permit_number?: string | null
          certification_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'company_profiles_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: true
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      documentation_sessions: {
        Row: {
          id: string
          organization_id: string
          created_by: string
          title: string
          session_type: string
          status: string
          asset_label: string | null
          vin: string | null
          odometer: string | null
          unit_number: string | null
          customer_name: string | null
          suggested_details: Json
          field_service_details: Json
          workflow_template_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          created_by: string
          title: string
          session_type: string
          status?: string
          asset_label?: string | null
          vin?: string | null
          odometer?: string | null
          unit_number?: string | null
          customer_name?: string | null
          suggested_details?: Json
          field_service_details?: Json
          workflow_template_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          created_by?: string
          title?: string
          session_type?: string
          status?: string
          asset_label?: string | null
          vin?: string | null
          odometer?: string | null
          unit_number?: string | null
          customer_name?: string | null
          suggested_details?: Json
          field_service_details?: Json
          workflow_template_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'documentation_sessions_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'documentation_sessions_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      ai_report_drafts: {
        Row: {
          id: string
          documentation_session_id: string
          organization_id: string
          workflow_template_id: string | null
          status: string
          title: string | null
          summary: string | null
          header_fields: Json
          measurements: Json
          findings: Json
          coverage: Json
          unmapped_evidence: Json
          report_structure: Json
          confidence: number | null
          model: string | null
          prompt_version: string | null
          generated_at: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          documentation_session_id: string
          organization_id: string
          workflow_template_id?: string | null
          status?: string
          title?: string | null
          summary?: string | null
          header_fields?: Json
          measurements?: Json
          findings?: Json
          coverage?: Json
          unmapped_evidence?: Json
          report_structure?: Json
          confidence?: number | null
          model?: string | null
          prompt_version?: string | null
          generated_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          documentation_session_id?: string
          organization_id?: string
          workflow_template_id?: string | null
          status?: string
          title?: string | null
          summary?: string | null
          header_fields?: Json
          measurements?: Json
          findings?: Json
          coverage?: Json
          unmapped_evidence?: Json
          report_structure?: Json
          confidence?: number | null
          model?: string | null
          prompt_version?: string | null
          generated_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ai_report_drafts_documentation_session_id_fkey'
            columns: ['documentation_session_id']
            isOneToOne: false
            referencedRelation: 'documentation_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_report_drafts_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_report_drafts_workflow_template_id_fkey'
            columns: ['workflow_template_id']
            isOneToOne: false
            referencedRelation: 'documentation_workflow_templates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_report_drafts_approved_by_fkey'
            columns: ['approved_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      ai_report_draft_sections: {
        Row: {
          id: string
          ai_report_draft_id: string
          documentation_session_id: string
          organization_id: string
          section_key: string
          title: string
          body: string | null
          status: string | null
          confidence: number | null
          source_capture_ids: string[]
          sort_order: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          ai_report_draft_id: string
          documentation_session_id: string
          organization_id: string
          section_key: string
          title: string
          body?: string | null
          status?: string | null
          confidence?: number | null
          source_capture_ids?: string[]
          sort_order?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ai_report_draft_id?: string
          documentation_session_id?: string
          organization_id?: string
          section_key?: string
          title?: string
          body?: string | null
          status?: string | null
          confidence?: number | null
          source_capture_ids?: string[]
          sort_order?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ai_report_draft_sections_ai_report_draft_id_fkey'
            columns: ['ai_report_draft_id']
            isOneToOne: false
            referencedRelation: 'ai_report_drafts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_report_draft_sections_documentation_session_id_fkey'
            columns: ['documentation_session_id']
            isOneToOne: false
            referencedRelation: 'documentation_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_report_draft_sections_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      capture_items: {
        Row: {
          id: string
          documentation_session_id: string
          organization_id: string
          type: string
          storage_path: string | null
          thumbnail_path: string | null
          capture_group_id: string | null
          evidence_event_id: string | null
          technician_note: string | null
          transcript: string | null
          transcript_status: string
          note_source: string
          media_kind: string
          report_order: number | null
          include_in_report: boolean
          deleted_at: string | null
          ai_status: string | null
          ai_summary: string | null
          ocr_text: string | null
          extracted_data: Json
          captured_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          documentation_session_id: string
          organization_id: string
          type: string
          storage_path?: string | null
          thumbnail_path?: string | null
          capture_group_id?: string | null
          evidence_event_id?: string | null
          technician_note?: string | null
          transcript?: string | null
          transcript_status?: string
          note_source?: string
          media_kind?: string
          report_order?: number | null
          include_in_report?: boolean
          deleted_at?: string | null
          ai_status?: string | null
          ai_summary?: string | null
          ocr_text?: string | null
          extracted_data?: Json
          captured_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          documentation_session_id?: string
          organization_id?: string
          type?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          capture_group_id?: string | null
          evidence_event_id?: string | null
          technician_note?: string | null
          transcript?: string | null
          transcript_status?: string
          note_source?: string
          media_kind?: string
          report_order?: number | null
          include_in_report?: boolean
          deleted_at?: string | null
          ai_status?: string | null
          ai_summary?: string | null
          ocr_text?: string | null
          extracted_data?: Json
          captured_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'capture_items_documentation_session_id_fkey'
            columns: ['documentation_session_id']
            isOneToOne: false
            referencedRelation: 'documentation_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'capture_items_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }


      template_imports: {
        Row: {
          id: string
          organization_id: string
          filename: string
          source_file_path: string
          ai_status: string
          extracted_structure: Json
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          filename: string
          source_file_path: string
          ai_status?: string
          extracted_structure?: Json
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          filename?: string
          source_file_path?: string
          ai_status?: string
          extracted_structure?: Json
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      documentation_workflow_templates: {
        Row: {
          id: string
          organization_id: string | null
          name: string
          description: string | null
          template_type: string
          source_import_id: string | null
          required_evidence: Json
          recommended_evidence: Json
          sections: Json
          fields: Json
          pdf_layout: Json
          signature_requirements: Json
          status: string
          created_by: string | null
          created_at: string
          updated_at: string
          profiles?: { full_name: string } | null
        }
        Insert: {
          id?: string
          organization_id?: string | null
          name: string
          description?: string | null
          template_type?: string
          source_import_id?: string | null
          required_evidence?: Json
          recommended_evidence?: Json
          sections?: Json
          fields?: Json
          pdf_layout?: Json
          signature_requirements?: Json
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          name?: string
          description?: string | null
          template_type?: string
          source_import_id?: string | null
          required_evidence?: Json
          recommended_evidence?: Json
          sections?: Json
          fields?: Json
          pdf_layout?: Json
          signature_requirements?: Json
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      template_required_evidence: {
        Row: { id: string; template_id: string; organization_id: string | null; label: string; evidence_key: string; requirement_type: string; match_terms: string[]; sort_order: number; created_at: string }
        Insert: { id?: string; template_id: string; organization_id?: string | null; label: string; evidence_key: string; requirement_type?: string; match_terms?: string[]; sort_order?: number; created_at?: string }
        Update: { id?: string; template_id?: string; organization_id?: string | null; label?: string; evidence_key?: string; requirement_type?: string; match_terms?: string[]; sort_order?: number; created_at?: string }
        Relationships: []
      }
      signature_captures: {
        Row: { id: string; documentation_session_id: string; organization_id: string; signature_type: string; signer_name: string; signature_image_path: string; signed_at: string; created_by: string | null; created_at: string }
        Insert: { id?: string; documentation_session_id: string; organization_id: string; signature_type: string; signer_name: string; signature_image_path: string; signed_at?: string; created_by?: string | null; created_at?: string }
        Update: { id?: string; documentation_session_id?: string; organization_id?: string; signature_type?: string; signer_name?: string; signature_image_path?: string; signed_at?: string; created_by?: string | null; created_at?: string }
        Relationships: []
      }
      report_share_tokens: {
        Row: { id: string; documentation_session_id: string; organization_id: string; token: string; expires_at: string | null; disabled_at: string | null; view_count: number; last_viewed_at: string | null; created_by: string | null; created_at: string; documentation_sessions?: { id: string; title: string; organization_id: string } | null }
        Insert: { id?: string; documentation_session_id: string; organization_id: string; token: string; expires_at?: string | null; disabled_at?: string | null; view_count?: number; last_viewed_at?: string | null; created_by?: string | null; created_at?: string }
        Update: { id?: string; documentation_session_id?: string; organization_id?: string; token?: string; expires_at?: string | null; disabled_at?: string | null; view_count?: number; last_viewed_at?: string | null; created_by?: string | null; created_at?: string }
        Relationships: []
      }

      exports: {
        Row: {
          id: string
          documentation_session_id: string
          organization_id: string
          export_type: string
          status: string
          metadata: Json
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          documentation_session_id: string
          organization_id: string
          export_type?: string
          status?: string
          metadata?: Json
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          documentation_session_id?: string
          organization_id?: string
          export_type?: string
          status?: string
          metadata?: Json
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'exports_documentation_session_id_fkey'
            columns: ['documentation_session_id']
            isOneToOne: false
            referencedRelation: 'documentation_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'exports_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      timeline_events: {
        Row: {
          id: string
          documentation_session_id: string
          organization_id: string
          capture_item_id: string | null
          event_time: string
          title: string
          description: string | null
          event_type: string
          created_at: string
        }
        Insert: {
          id?: string
          documentation_session_id: string
          organization_id: string
          capture_item_id?: string | null
          event_time?: string
          title: string
          description?: string | null
          event_type: string
          created_at?: string
        }
        Update: {
          id?: string
          documentation_session_id?: string
          organization_id?: string
          capture_item_id?: string | null
          event_time?: string
          title?: string
          description?: string | null
          event_type?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'timeline_events_capture_item_id_fkey'
            columns: ['capture_item_id']
            isOneToOne: false
            referencedRelation: 'capture_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'timeline_events_documentation_session_id_fkey'
            columns: ['documentation_session_id']
            isOneToOne: false
            referencedRelation: 'documentation_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'timeline_events_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      create_onboarding_workspace: {
        Args: {
          p_full_name: string
          p_company_name: string
          p_industry: string
          p_plan?: string
        }
        Returns: string
      }
      set_organization_stripe_customer: {
        Args: {
          p_organization_id: string
          p_stripe_customer_id: string
        }
        Returns: void
      }
      sync_organization_subscription: {
        Args: {
          p_organization_id?: string | null
          p_stripe_customer_id?: string | null
          p_stripe_subscription_id?: string | null
          p_plan?: string | null
          p_subscription_status?: string | null
          p_current_period_end?: string | null
        }
        Returns: void
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
