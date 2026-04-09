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
      architects: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "architects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          rfc: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          rfc?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          rfc?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          company_id: string
          id: string
          location: string | null
          material_id: string
          min_stock: number
          quantity: number
          reserved: number
          updated_at: string
        }
        Insert: {
          company_id: string
          id?: string
          location?: string | null
          material_id: string
          min_stock?: number
          quantity?: number
          reserved?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          id?: string
          location?: string | null
          material_id?: string
          min_stock?: number
          quantity?: number
          reserved?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          quantity: number
          reason: string | null
          request_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          quantity: number
          reason?: string | null
          request_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          quantity?: number
          reason?: string | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_inventory_movements_request"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          active: boolean
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          active?: boolean
          code?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          active: boolean
          category: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          sku: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sku?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message: string
          metadata: Json | null
          read: boolean
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          joined_at: string | null
          pool_id: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          joined_at?: string | null
          pool_id: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          joined_at?: string | null
          pool_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_companies_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "purchase_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_items: {
        Row: {
          created_at: string
          description: string
          id: string
          material_id: string | null
          pool_id: string
          total_quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          material_id?: string | null
          pool_id: string
          total_quantity?: number
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          material_id?: string | null
          pool_id?: string
          total_quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_items_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "purchase_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_requests: {
        Row: {
          created_at: string
          id: string
          pool_id: string
          request_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pool_id: string
          request_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pool_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_requests_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "purchase_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_architects: {
        Row: {
          architect_id: string
          created_at: string
          id: string
          project_id: string
        }
        Insert: {
          architect_id: string
          created_at?: string
          id?: string
          project_id: string
        }
        Update: {
          architect_id?: string
          created_at?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_architects_architect_id_fkey"
            columns: ["architect_id"]
            isOneToOne: false
            referencedRelation: "architects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_architects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active: boolean
          address: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_documents: {
        Row: {
          doc_type: string
          file_name: string | null
          file_url: string
          id: string
          provider_id: string
          uploaded_at: string
        }
        Insert: {
          doc_type: string
          file_name?: string | null
          file_url: string
          id?: string
          provider_id: string
          uploaded_at?: string
        }
        Update: {
          doc_type?: string
          file_name?: string | null
          file_url?: string
          id?: string
          provider_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_documents_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_documents_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "v_price_comparison"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      provider_users: {
        Row: {
          active: boolean
          created_at: string
          id: string
          provider_id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          provider_id: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          provider_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_users_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_users_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "v_price_comparison"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      providers: {
        Row: {
          active: boolean
          address: string | null
          categories: string[] | null
          company_id: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          rfc: string | null
          score: number | null
          updated_at: string
          verification_status: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          categories?: string[] | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          rfc?: string | null
          score?: number | null
          updated_at?: string
          verification_status?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          categories?: string[] | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          rfc?: string | null
          score?: number | null
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "providers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          material_id: string | null
          purchase_order_id: string
          quantity: number
          quantity_received: number
          quote_item_id: string | null
          request_item_id: string | null
          unit: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          material_id?: string | null
          purchase_order_id: string
          quantity: number
          quantity_received?: number
          quote_item_id?: string | null
          request_item_id?: string | null
          unit: string
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          material_id?: string | null
          purchase_order_id?: string
          quantity?: number
          quantity_received?: number
          quote_item_id?: string | null
          request_item_id?: string | null
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_request_item_id_fkey"
            columns: ["request_item_id"]
            isOneToOne: false
            referencedRelation: "request_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_terms: string | null
          po_number: string | null
          provider_id: string
          rejection_reason: string | null
          request_id: string | null
          rfq_id: string | null
          status: Database["public"]["Enums"]["po_status"]
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          po_number?: string | null
          provider_id: string
          rejection_reason?: string | null
          request_id?: string | null
          rfq_id?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          po_number?: string | null
          provider_id?: string
          rejection_reason?: string | null
          request_id?: string | null
          rfq_id?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "v_price_comparison"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "purchase_orders_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "v_price_comparison"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      purchase_pools: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deadline: string | null
          id: string
          is_shared: boolean
          name: string
          observations: string | null
          status: Database["public"]["Enums"]["pool_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          id?: string
          is_shared?: boolean
          name: string
          observations?: string | null
          status?: Database["public"]["Enums"]["pool_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          id?: string
          is_shared?: boolean
          name?: string
          observations?: string | null
          status?: Database["public"]["Enums"]["pool_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_pools_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          delivery_days: number | null
          id: string
          observations: string | null
          quote_id: string
          rfq_item_id: string
          unit_price: number
        }
        Insert: {
          delivery_days?: number | null
          id?: string
          observations?: string | null
          quote_id: string
          rfq_item_id: string
          unit_price: number
        }
        Update: {
          delivery_days?: number | null
          id?: string
          observations?: string | null
          quote_id?: string
          rfq_item_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_rfq_item_id_fkey"
            columns: ["rfq_item_id"]
            isOneToOne: false
            referencedRelation: "rfq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_rfq_item_id_fkey"
            columns: ["rfq_item_id"]
            isOneToOne: false
            referencedRelation: "v_price_comparison"
            referencedColumns: ["rfq_item_id"]
          },
        ]
      }
      quotes: {
        Row: {
          conditions: string | null
          created_at: string
          delivery_days: number | null
          id: string
          observations: string | null
          provider_id: string
          rfq_id: string
          status: Database["public"]["Enums"]["quote_status"]
          submitted_at: string | null
          total_price: number | null
          updated_at: string
        }
        Insert: {
          conditions?: string | null
          created_at?: string
          delivery_days?: number | null
          id?: string
          observations?: string | null
          provider_id: string
          rfq_id: string
          status?: Database["public"]["Enums"]["quote_status"]
          submitted_at?: string | null
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          conditions?: string | null
          created_at?: string
          delivery_days?: number | null
          id?: string
          observations?: string | null
          provider_id?: string
          rfq_id?: string
          status?: Database["public"]["Enums"]["quote_status"]
          submitted_at?: string | null
          total_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "v_price_comparison"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "v_price_comparison"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      remito_items: {
        Row: {
          delivered: boolean
          id: string
          material_id: string
          observations: string | null
          quantity: number
          remito_id: string
          request_item_id: string | null
        }
        Insert: {
          delivered?: boolean
          id?: string
          material_id: string
          observations?: string | null
          quantity: number
          remito_id: string
          request_item_id?: string | null
        }
        Update: {
          delivered?: boolean
          id?: string
          material_id?: string
          observations?: string | null
          quantity?: number
          remito_id?: string
          request_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remito_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remito_items_remito_id_fkey"
            columns: ["remito_id"]
            isOneToOne: false
            referencedRelation: "remitos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remito_items_request_item_id_fkey"
            columns: ["request_item_id"]
            isOneToOne: false
            referencedRelation: "request_items"
            referencedColumns: ["id"]
          },
        ]
      }
      remitos: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          destination: string | null
          estimated_delivery: string | null
          id: string
          observations: string | null
          request_id: string | null
          status: Database["public"]["Enums"]["remito_status"]
          transportista_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          destination?: string | null
          estimated_delivery?: string | null
          id?: string
          observations?: string | null
          request_id?: string | null
          status?: Database["public"]["Enums"]["remito_status"]
          transportista_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          destination?: string | null
          estimated_delivery?: string | null
          id?: string
          observations?: string | null
          request_id?: string | null
          status?: Database["public"]["Enums"]["remito_status"]
          transportista_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "remitos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_items: {
        Row: {
          created_at: string
          description: string
          id: string
          match_confidence: string | null
          material_id: string | null
          observations: string | null
          quantity: number
          request_id: string
          status: string
          unit: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          match_confidence?: string | null
          material_id?: string | null
          observations?: string | null
          quantity: number
          request_id: string
          status?: string
          unit: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          match_confidence?: string | null
          material_id?: string | null
          observations?: string | null
          quantity?: number
          request_id?: string
          status?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          architect_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          desired_date: string | null
          id: string
          observations: string | null
          project_id: string | null
          raw_message: string | null
          requires_review: boolean
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          urgency: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          architect_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          desired_date?: string | null
          id?: string
          observations?: string | null
          project_id?: string | null
          raw_message?: string | null
          requires_review?: boolean
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          urgency?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          architect_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          desired_date?: string | null
          id?: string
          observations?: string | null
          project_id?: string | null
          raw_message?: string | null
          requires_review?: boolean
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          urgency?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_architect_id_fkey"
            columns: ["architect_id"]
            isOneToOne: false
            referencedRelation: "architects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_items: {
        Row: {
          created_at: string
          description: string
          id: string
          material_id: string | null
          quantity: number
          rfq_id: string
          specifications: string | null
          unit: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          material_id?: string | null
          quantity: number
          rfq_id: string
          specifications?: string | null
          unit: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          material_id?: string | null
          quantity?: number
          rfq_id?: string
          specifications?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_items_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_items_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "v_price_comparison"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      rfq_providers: {
        Row: {
          created_at: string
          id: string
          notified_at: string | null
          provider_id: string
          rfq_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notified_at?: string | null
          provider_id: string
          rfq_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notified_at?: string | null
          provider_id?: string
          rfq_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_providers_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_providers_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "v_price_comparison"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "rfq_providers_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_providers_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "v_price_comparison"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      rfqs: {
        Row: {
          closing_datetime: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deadline: string | null
          delivery_location: string | null
          id: string
          observations: string | null
          payment_terms: string | null
          pool_id: string | null
          request_id: string | null
          status: Database["public"]["Enums"]["rfq_status"]
          updated_at: string
        }
        Insert: {
          closing_datetime?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          delivery_location?: string | null
          id?: string
          observations?: string | null
          payment_terms?: string | null
          pool_id?: string | null
          request_id?: string | null
          status?: Database["public"]["Enums"]["rfq_status"]
          updated_at?: string
        }
        Update: {
          closing_datetime?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          delivery_location?: string | null
          id?: string
          observations?: string | null
          payment_terms?: string | null
          pool_id?: string | null
          request_id?: string | null
          status?: Database["public"]["Enums"]["rfq_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "purchase_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          ai_result: Json | null
          body: string | null
          company_id: string | null
          created_at: string
          from_number: string
          id: string
          media_url: string | null
          processed: boolean
          raw_payload: Json | null
          request_id: string | null
          to_number: string | null
        }
        Insert: {
          ai_result?: Json | null
          body?: string | null
          company_id?: string | null
          created_at?: string
          from_number: string
          id?: string
          media_url?: string | null
          processed?: boolean
          raw_payload?: Json | null
          request_id?: string | null
          to_number?: string | null
        }
        Update: {
          ai_result?: Json | null
          body?: string | null
          company_id?: string | null
          created_at?: string
          from_number?: string
          id?: string
          media_url?: string | null
          processed?: boolean
          raw_payload?: Json | null
          request_id?: string | null
          to_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_numbers: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          number: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          number: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          number?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_numbers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_price_comparison: {
        Row: {
          company_id: string | null
          delivery_days: number | null
          item_description: string | null
          provider_id: string | null
          provider_name: string | null
          quantity: number | null
          quote_status: Database["public"]["Enums"]["quote_status"] | null
          rfq_id: string | null
          rfq_item_id: string | null
          submitted_at: string | null
          total_price: number | null
          unit: string | null
          unit_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auth_company_id: { Args: never; Returns: string }
      auth_is_provider: { Args: never; Returns: boolean }
      auth_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      onboard_create_company: {
        Args: { p_name: string; p_phone?: string; p_slug: string }
        Returns: string
      }
      onboard_join_with_code: { Args: { p_code: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "arquitecto"
        | "compras"
        | "deposito"
        | "transportista"
        | "proveedor"
      movement_type: "entrada" | "salida" | "ajuste"
      notification_type:
        | "request_created"
        | "request_approved"
        | "stock_available"
        | "stock_insufficient"
        | "rfq_created"
        | "quote_received"
        | "comparison_ready"
        | "po_issued"
        | "po_accepted"
        | "po_rejected"
        | "material_received"
        | "remito_dispatched"
        | "remito_delivered"
        | "material_purchased"
      po_status: "sent" | "accepted" | "rejected"
      pool_status: "open" | "closed" | "quoting" | "awarded" | "cancelled"
      quote_status: "pending" | "submitted" | "awarded" | "rejected"
      remito_status:
        | "borrador"
        | "confirmado"
        | "en_transito"
        | "entregado"
        | "cancelado"
      request_status:
        | "draft"
        | "approved"
        | "in_pool"
        | "rfq_direct"
        | "rejected"
        | "inventario"
      rfq_status: "draft" | "sent" | "responded" | "closed"
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
      app_role: [
        "admin",
        "arquitecto",
        "compras",
        "deposito",
        "transportista",
        "proveedor",
      ],
      movement_type: ["entrada", "salida", "ajuste"],
      notification_type: [
        "request_created",
        "request_approved",
        "stock_available",
        "stock_insufficient",
        "rfq_created",
        "quote_received",
        "comparison_ready",
        "po_issued",
        "po_accepted",
        "po_rejected",
        "material_received",
        "remito_dispatched",
        "remito_delivered",
        "material_purchased",
      ],
      po_status: ["sent", "accepted", "rejected"],
      pool_status: ["open", "closed", "quoting", "awarded", "cancelled"],
      quote_status: ["pending", "submitted", "awarded", "rejected"],
      remito_status: [
        "borrador",
        "confirmado",
        "en_transito",
        "entregado",
        "cancelado",
      ],
      request_status: [
        "draft",
        "approved",
        "in_pool",
        "rfq_direct",
        "rejected",
        "inventario",
      ],
      rfq_status: ["draft", "sent", "responded", "closed"],
    },
  },
} as const

