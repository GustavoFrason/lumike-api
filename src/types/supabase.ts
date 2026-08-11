/**
 * Tipos gerados a partir do schema PostgREST ao vivo do projeto Supabase
 * (introspecção via /rest/v1/ com Accept: application/openapi+json — mesma
 * fonte que `supabase gen types typescript` usaria, sem precisar da CLI/token
 * de conta).
 *
 * Última auditoria: 2026-08-10, comparando esse arquivo coluna a coluna
 * contra o schema ao vivo (script ad-hoc, não versionado). Achado e
 * corrigido: `products.supplier_id` (FK pra suppliers, existe em produção,
 * nunca tinha sido adicionado aqui) e `warranties.origin`/enum
 * `warranty_origin` (idem, ver migration 20260227_expand_warranties_for_repairs).
 * fn_adjust_stock/fn_create_order/fn_cancel_order/fn_transfer_stock/
 * fn_update_product_stock e vw_cash_flow_balance/vw_dashboard/
 * vw_top_sellers_90d conferidos e presentes.
 *
 * 2026-08-10: migration 20260809000005_drop_dead_tables.sql aplicada em
 * produção — `payments` e `estoque` não existem mais (confirmado ao vivo).
 *
 * Regenerar: veja lumike-api/scripts/gen-supabase-types.md
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      accessory_purchases: {
        Row: {
          id: number;
          type: string;
          quantity: number;
          supplier: string;
          purchase_date: string;
          unit_price: number;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
          user_id: number | null;
        };
        Insert: {
          id?: number;
          type: string;
          quantity: number;
          supplier: string;
          purchase_date?: string;
          unit_price: number;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          user_id?: number | null;
        };
        Update: {
          id?: number;
          type?: string;
          quantity?: number;
          supplier?: string;
          purchase_date?: string;
          unit_price?: number;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          user_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'accessory_purchases_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      cash_flow: {
        Row: {
          id: number;
          type: string;
          category: string;
          amount: number;
          description: string | null;
          order_id: number | null;
          user_id: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: number;
          type: string;
          category: string;
          amount: number;
          description?: string | null;
          order_id?: number | null;
          user_id?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: number;
          type?: string;
          category?: string;
          amount?: number;
          description?: string | null;
          order_id?: number | null;
          user_id?: number | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_flow_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_flow_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          id: number;
          name: string;
          description: string | null;
          slug: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          image_url: string | null;
        };
        Insert: {
          id?: number;
          name: string;
          description?: string | null;
          slug?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          image_url?: string | null;
        };
        Update: {
          id?: number;
          name?: string;
          description?: string | null;
          slug?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          image_url?: string | null;
        };
        Relationships: [];
      };
      colecoes: {
        Row: {
          id: string;
          nome: string;
          slug: string;
          descricao: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          slug: string;
          descricao?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          slug?: string;
          descricao?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: number;
          name: string;
          email: string | null;
          phone: string | null;
          cpf: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          zipcode: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          user_id: number | null;
        };
        Insert: {
          id?: number;
          name: string;
          email?: string | null;
          phone?: string | null;
          cpf?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          zipcode?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          user_id?: number | null;
        };
        Update: {
          id?: number;
          name?: string;
          email?: string | null;
          phone?: string | null;
          cpf?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          zipcode?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          user_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      imagens_produto: {
        Row: {
          id: string;
          produto_id: number;
          url: string;
          ordem: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          produto_id: number;
          url: string;
          ordem?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          produto_id?: number;
          url?: string;
          ordem?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'imagens_produto_produto_id_fkey';
            columns: ['produto_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_locations: {
        Row: {
          id: number;
          product_id: number;
          user_id: number | null;
          quantity: number;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: number;
          product_id: number;
          user_id?: number | null;
          quantity?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: number;
          product_id?: number;
          user_id?: number | null;
          quantity?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_locations_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_locations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_movements: {
        Row: {
          id: number;
          product_id: number;
          movement: Database['public']['Enums']['movement_type'];
          quantity: number;
          reference: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          product_id: number;
          movement: Database['public']['Enums']['movement_type'];
          quantity: number;
          reference?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          product_id?: number;
          movement?: Database['public']['Enums']['movement_type'];
          quantity?: number;
          reference?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_movements_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_transfers: {
        Row: {
          id: number;
          product_id: number;
          from_user_id: number | null;
          to_user_id: number | null;
          quantity: number;
          notes: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: number;
          product_id: number;
          from_user_id?: number | null;
          to_user_id?: number | null;
          quantity: number;
          notes?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: number;
          product_id?: number;
          from_user_id?: number | null;
          to_user_id?: number | null;
          quantity?: number;
          notes?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_transfers_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_transfers_from_user_id_fkey';
            columns: ['from_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_transfers_to_user_id_fkey';
            columns: ['to_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      leads: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          whatsapp: string | null;
          birthday: string | null;
          coupon_code: string | null;
          is_used: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          email?: string | null;
          whatsapp?: string | null;
          birthday?: string | null;
          coupon_code?: string | null;
          is_used?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string | null;
          whatsapp?: string | null;
          birthday?: string | null;
          coupon_code?: string | null;
          is_used?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: number;
          order_id: number;
          product_id: number;
          quantity: number;
          unit_price: number;
          total_price: number | null;
          variant_id: string | null;
        };
        Insert: {
          id?: number;
          order_id: number;
          product_id: number;
          quantity: number;
          unit_price: number;
          total_price?: number | null;
          variant_id?: string | null;
        };
        Update: {
          id?: number;
          order_id?: number;
          product_id?: number;
          quantity?: number;
          unit_price?: number;
          total_price?: number | null;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      order_payments: {
        Row: {
          id: number;
          order_id: number | null;
          amount: number;
          payment_method: string;
          received_by_user_id: number | null;
          receiver_name: string | null;
          created_at: string | null;
          type: string | null;
          notes: string | null;
        };
        Insert: {
          id?: number;
          order_id?: number | null;
          amount: number;
          payment_method: string;
          received_by_user_id?: number | null;
          receiver_name?: string | null;
          created_at?: string | null;
          type?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: number;
          order_id?: number | null;
          amount?: number;
          payment_method?: string;
          received_by_user_id?: number | null;
          receiver_name?: string | null;
          created_at?: string | null;
          type?: string | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'order_payments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_payments_received_by_user_id_fkey';
            columns: ['received_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: {
          id: number;
          customer_id: number | null;
          status: Database['public']['Enums']['order_status'];
          total_amount: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
          payment_method: string | null;
          payment_status: string | null;
          boca_value: number | null;
          boca_notes: string | null;
          card_brand: string | null;
          card_tax: number | null;
          transaction_id: string | null;
          boca_paid_now: number | null;
          seller_id: number | null;
        };
        Insert: {
          id?: number;
          customer_id?: number | null;
          status?: Database['public']['Enums']['order_status'];
          total_amount?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          payment_method?: string | null;
          payment_status?: string | null;
          boca_value?: number | null;
          boca_notes?: string | null;
          card_brand?: string | null;
          card_tax?: number | null;
          transaction_id?: string | null;
          boca_paid_now?: number | null;
          seller_id?: number | null;
        };
        Update: {
          id?: number;
          customer_id?: number | null;
          status?: Database['public']['Enums']['order_status'];
          total_amount?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          payment_method?: string | null;
          payment_status?: string | null;
          boca_value?: number | null;
          boca_notes?: string | null;
          card_brand?: string | null;
          card_tax?: number | null;
          transaction_id?: string | null;
          boca_paid_now?: number | null;
          seller_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_seller_id_fkey';
            columns: ['seller_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      product_favorites: {
        Row: {
          id: number;
          user_id: number;
          product_id: number;
          created_at: string | null;
        };
        Insert: {
          id?: number;
          user_id: number;
          product_id: number;
          created_at?: string | null;
        };
        Update: {
          id?: number;
          user_id?: number;
          product_id?: number;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'product_favorites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_favorites_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          id: number;
          sku: string | null;
          name: string;
          description: string | null;
          slug: string | null;
          category_id: number | null;
          colecao_id: string | null;
          price: number;
          preco_promocional: number | null;
          cost_price: number;
          current_stock: number;
          min_stock: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          is_featured: boolean | null;
          purchase_date: string;
          sku2: string | null;
          short_description: string;
          collection: string | null;
          supplier_id: number | null;
        };
        Insert: {
          id?: number;
          sku?: string | null;
          name: string;
          description?: string | null;
          slug?: string | null;
          category_id?: number | null;
          colecao_id?: string | null;
          price?: number;
          preco_promocional?: number | null;
          cost_price?: number;
          current_stock?: number;
          min_stock?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          is_featured?: boolean | null;
          purchase_date: string;
          sku2?: string | null;
          short_description: string;
          collection?: string | null;
          supplier_id?: number | null;
        };
        Update: {
          id?: number;
          sku?: string | null;
          name?: string;
          description?: string | null;
          slug?: string | null;
          category_id?: number | null;
          colecao_id?: string | null;
          price?: number;
          preco_promocional?: number | null;
          cost_price?: number;
          current_stock?: number;
          min_stock?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          is_featured?: boolean | null;
          purchase_date?: string;
          sku2?: string | null;
          short_description?: string;
          collection?: string | null;
          supplier_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'products_colecao_id_fkey';
            columns: ['colecao_id'];
            isOneToOne: false;
            referencedRelation: 'colecoes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'products_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      purchase_items: {
        Row: {
          id: number;
          purchase_id: number;
          product_id: number;
          quantity: number;
          unit_cost: number;
          total_cost: number | null;
        };
        Insert: {
          id?: number;
          purchase_id: number;
          product_id: number;
          quantity: number;
          unit_cost: number;
          total_cost?: number | null;
        };
        Update: {
          id?: number;
          purchase_id?: number;
          product_id?: number;
          quantity?: number;
          unit_cost?: number;
          total_cost?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_items_purchase_id_fkey';
            columns: ['purchase_id'];
            isOneToOne: false;
            referencedRelation: 'purchases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      purchases: {
        Row: {
          id: number;
          supplier_id: number | null;
          total_amount: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          supplier_id?: number | null;
          total_amount?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          supplier_id?: number | null;
          total_amount?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchases_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      roles: {
        Row: {
          id: number;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          key: string;
          value: string | null;
          description: string | null;
          updated_at: string | null;
        };
        Insert: {
          key: string;
          value?: string | null;
          description?: string | null;
          updated_at?: string | null;
        };
        Update: {
          key?: string;
          value?: string | null;
          description?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      stock_adjustments: {
        Row: {
          id: number;
          product_id: number;
          user_id: number | null;
          delta: number;
          expected_quantity: number | null;
          counted_quantity: number | null;
          reason: string;
          created_by: number | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          product_id: number;
          user_id?: number | null;
          delta: number;
          expected_quantity?: number | null;
          counted_quantity?: number | null;
          reason: string;
          created_by?: number | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          product_id?: number;
          user_id?: number | null;
          delta?: number;
          expected_quantity?: number | null;
          counted_quantity?: number | null;
          reason?: string;
          created_by?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_adjustments_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_adjustments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_adjustments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_alerts: {
        Row: {
          id: number;
          product_id: number;
          is_active: boolean;
          last_triggered_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: number;
          product_id: number;
          is_active?: boolean;
          last_triggered_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: number;
          product_id?: number;
          is_active?: boolean;
          last_triggered_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_alerts_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_notifications: {
        Row: {
          id: number;
          user_id: number | null;
          email: string;
          product_id: number;
          variant_id: number | null;
          status: string | null;
          created_at: string | null;
          sent_at: string | null;
        };
        Insert: {
          id?: number;
          user_id?: number | null;
          email: string;
          product_id: number;
          variant_id?: number | null;
          status?: string | null;
          created_at?: string | null;
          sent_at?: string | null;
        };
        Update: {
          id?: number;
          user_id?: number | null;
          email?: string;
          product_id?: number;
          variant_id?: number | null;
          status?: string | null;
          created_at?: string | null;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_notifications_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      suppliers: {
        Row: {
          id: number;
          name: string;
          document: string | null;
          contact_name: string | null;
          address: string | null;
          category: string | null;
          email: string | null;
          phone: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          document?: string | null;
          contact_name?: string | null;
          address?: string | null;
          category?: string | null;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          document?: string | null;
          contact_name?: string | null;
          address?: string | null;
          category?: string | null;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: number;
          name: string;
          email: string;
          password: string;
          role_id: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          whatsapp: string | null;
          commission_rate: number | null;
        };
        Insert: {
          id?: number;
          name: string;
          email: string;
          password: string;
          role_id?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          whatsapp?: string | null;
          commission_rate?: number | null;
        };
        Update: {
          id?: number;
          name?: string;
          email?: string;
          password?: string;
          role_id?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          whatsapp?: string | null;
          commission_rate?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'users_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
        ];
      };
      vw_low_stock: {
        Row: {
          product_id: number | null;
          product_name: string | null;
          sku: string | null;
          current_stock: number | null;
          min_stock: number | null;
          missing: number | null;
        };
        Insert: {
          product_id?: number | null;
          product_name?: string | null;
          sku?: string | null;
          current_stock?: number | null;
          min_stock?: number | null;
          missing?: number | null;
        };
        Update: {
          product_id?: number | null;
          product_name?: string | null;
          sku?: string | null;
          current_stock?: number | null;
          min_stock?: number | null;
          missing?: number | null;
        };
        Relationships: [];
      };
      warranties: {
        Row: {
          id: string;
          customer_id: number | null;
          order_id: number | null;
          product_id: number;
          status: Database['public']['Enums']['warranty_status'];
          type: Database['public']['Enums']['warranty_type'];
          origin: Database['public']['Enums']['warranty_origin'];
          description: string | null;
          internal_notes: string | null;
          images: Json | null;
          created_at: string | null;
          updated_at: string | null;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          customer_id?: number | null;
          order_id?: number | null;
          product_id: number;
          status?: Database['public']['Enums']['warranty_status'];
          type?: Database['public']['Enums']['warranty_type'];
          origin?: Database['public']['Enums']['warranty_origin'];
          description?: string | null;
          internal_notes?: string | null;
          images?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          customer_id?: number | null;
          order_id?: number | null;
          product_id?: number;
          status?: Database['public']['Enums']['warranty_status'];
          type?: Database['public']['Enums']['warranty_type'];
          origin?: Database['public']['Enums']['warranty_origin'];
          description?: string | null;
          internal_notes?: string | null;
          images?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
          finished_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'warranties_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranties_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranties_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      vw_cash_flow_balance: {
        Row: {
          balance: number | null;
        };
        Relationships: [];
      };
      vw_dashboard: {
        Row: {
          total_vendas: number | null;
          produtos_ativos: number | null;
          clientes: number | null;
        };
        Relationships: [];
      };
      vw_top_sellers_90d: {
        Row: {
          product_id: number | null;
          name: string | null;
          qty_90d: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vw_top_sellers_90d_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      fn_adjust_stock: {
        Args: {
          p_delta: number | null;
          p_movement_override?:
            | Database['public']['Enums']['movement_type']
            | null;
          p_product_id: number | null;
          p_reference?: string | null;
          p_user_id: number | null;
        };
        Returns: number;
      };
      fn_cancel_order: {
        Args: {
          p_notes: string | null;
          p_order_id: number | null;
          p_receiver_name?: string | null;
          p_refund_amount: number | null;
          p_user_id: number | null;
        };
        Returns: undefined;
      };
      fn_create_order: {
        Args: {
          p_boca_notes: string | null;
          p_boca_paid_now: number | null;
          p_boca_value: number | null;
          p_card_brand: string | null;
          p_card_tax: number | null;
          p_cash_user_id: number | null;
          p_customer_id: number | null;
          p_items: Json | null;
          p_lead_id?: string | null;
          p_notes: string | null;
          p_paid_now: number | null;
          p_payment_method: string | null;
          p_payment_status: string | null;
          p_receiver_name?: string | null;
          p_seller_id: number | null;
          p_status: string | null;
          p_total_amount: number | null;
          p_transaction_id: string | null;
        };
        Returns: number;
      };
      fn_import_purchase_excel: {
        Args: {
          p_items: Json | null;
          p_notes: string | null;
          p_supplier_id: number | null;
        };
        Returns: number;
      };
      fn_transfer_stock: {
        Args: {
          p_from_user_id: number | null;
          p_notes?: string | null;
          p_product_id: number | null;
          p_quantity: number | null;
          p_to_user_id: number | null;
        };
        Returns: undefined;
      };
      fn_update_product_stock: {
        Args: {
          p_delta: number | null;
          p_movement: Database['public']['Enums']['movement_type'] | null;
          p_product_id: number | null;
          p_reference: string | null;
        };
        Returns: undefined;
      };
      fn_user_has_role: {
        Args: {
          p_email: string | null;
          p_role: string | null;
        };
        Returns: boolean;
      };
    };
    Enums: {
      movement_type: 'IN' | 'OUT' | 'ADJUST';
      order_status:
        | 'pending'
        | 'paid'
        | 'completed'
        | 'cancelled'
        | 'parcelado_boca';
      warranty_origin: 'sold' | 'stock';
      warranty_status:
        | 'pending'
        | 'analyzing'
        | 'factory'
        | 'ready'
        | 'finished'
        | 'rejected';
      warranty_type: 'plating' | 'break' | 'stone_loss' | 'other';
    };
  };
}

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> =
  PublicSchema['Enums'][T];
