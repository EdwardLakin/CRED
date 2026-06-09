export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          industry: string
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          industry: string
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          industry?: string
          created_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          full_name: string
          role: 'owner' | 'admin' | 'member'
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          organization_id: string
          full_name: string
          role: 'owner' | 'admin' | 'member'
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          organization_id?: string
          full_name?: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string | null
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
        }
        Insert: {
          id?: string
          organization_id: string
          company_name: string
          created_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          company_name?: string
          created_at?: string | null
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
    }
    Views: Record<string, never>
    Functions: {
      create_onboarding_workspace: {
        Args: {
          p_full_name: string
          p_company_name: string
          p_industry: string
        }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
