export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      account_deletions: {
        Row: {
          confirmation_email: string
          listing_states: Json
          requested_at: string
          scheduled_purge_at: string
          user_id: string
        }
        Insert: {
          confirmation_email: string
          listing_states?: Json
          requested_at?: string
          scheduled_purge_at?: string
          user_id: string
        }
        Update: {
          confirmation_email?: string
          listing_states?: Json
          requested_at?: string
          scheduled_purge_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_moderation_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          reason: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          reason?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          heading_font: string | null
          icon: string | null
          id: string
          is_hidden: boolean
          name_nb: string
          parent_id: string | null
          search_examples: string[]
          search_synonyms: string[]
          slug: string
          sort_order: number
          title_example: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          heading_font?: string | null
          icon?: string | null
          id?: string
          is_hidden?: boolean
          name_nb: string
          parent_id?: string | null
          search_examples?: string[]
          search_synonyms?: string[]
          slug: string
          sort_order?: number
          title_example?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          heading_font?: string | null
          icon?: string | null
          id?: string
          is_hidden?: boolean
          name_nb?: string
          parent_id?: string | null
          search_examples?: string[]
          search_synonyms?: string[]
          slug?: string
          sort_order?: number
          title_example?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_filters: {
        Row: {
          category_id: string
          created_at: string
          depends_on_key: string | null
          depends_on_not_value: string | null
          depends_on_value: string | null
          id: string
          is_optional: boolean
          is_primary: boolean
          key: string
          label_nb: string
          options: Json | null
          sort_order: number
          type: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          depends_on_key?: string | null
          depends_on_not_value?: string | null
          depends_on_value?: string | null
          id?: string
          is_optional?: boolean
          is_primary?: boolean
          key: string
          label_nb: string
          options?: Json | null
          sort_order?: number
          type: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          depends_on_key?: string | null
          depends_on_not_value?: string | null
          depends_on_value?: string | null
          id?: string
          is_optional?: boolean
          is_primary?: boolean
          key?: string
          label_nb?: string
          options?: Json | null
          sort_order?: number
          type?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_filters_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_flows: {
        Row: {
          category_id: string
          created_at: string
          field_groups: string[]
          id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          field_groups?: string[]
          id?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          field_groups?: string[]
          id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_flows_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          buyer_deleted_at: string | null
          buyer_id: string
          buyer_last_read_at: string | null
          created_at: string
          id: string
          last_message_at: string
          listing_id: string | null
          seller_deleted_at: string | null
          seller_id: string
          seller_last_read_at: string | null
        }
        Insert: {
          buyer_deleted_at?: string | null
          buyer_id: string
          buyer_last_read_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          listing_id?: string | null
          seller_deleted_at?: string | null
          seller_id: string
          seller_last_read_at?: string | null
        }
        Update: {
          buyer_deleted_at?: string | null
          buyer_id?: string
          buyer_last_read_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          listing_id?: string | null
          seller_deleted_at?: string | null
          seller_id?: string
          seller_last_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoint_rate_limits: {
        Row: {
          attempts: number
          bucket: string
          key_hash: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          bucket: string
          key_hash: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          bucket?: string
          key_hash?: string
          window_started_at?: string
        }
        Relationships: []
      }
      error_log: {
        Row: {
          context: Json | null
          created_at: string
          error_code: string | null
          error_message: string
          function_name: string
          id: string
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_code?: string | null
          error_message: string
          function_name: string
          id?: string
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_code?: string | null
          error_message?: string
          function_name?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_bans: {
        Row: {
          banned_by: string
          created_at: string
          expires_at: string | null
          id: string
          ip_address: unknown
          reason: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address: unknown
          reason: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address?: unknown
          reason?: string
        }
        Relationships: []
      }
      listing_images: {
        Row: {
          ai_generated: boolean
          caption: string | null
          created_at: string
          id: string
          listing_id: string
          sort_order: number
          source_url: string | null
          storage_path: string
        }
        Insert: {
          ai_generated?: boolean
          caption?: string | null
          created_at?: string
          id?: string
          listing_id: string
          sort_order?: number
          source_url?: string | null
          storage_path: string
        }
        Update: {
          ai_generated?: boolean
          caption?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          sort_order?: number
          source_url?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_status_history: {
        Row: {
          changed_at: string
          id: string
          listing_id: string
          status: Database["public"]["Enums"]["listing_status"]
        }
        Insert: {
          changed_at: string
          id?: string
          listing_id: string
          status: Database["public"]["Enums"]["listing_status"]
        }
        Update: {
          changed_at?: string
          id?: string
          listing_id?: string
          status?: Database["public"]["Enums"]["listing_status"]
        }
        Relationships: [
          {
            foreignKeyName: "listing_status_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          attributes: Json
          can_ship: boolean | null
          category_id: string | null
          city: string | null
          condition: Database["public"]["Enums"]["listing_condition"] | null
          counted_category_id: string | null
          counted_keyword_category_id: string | null
          counted_keywords: string[] | null
          counted_lexemes: string[] | null
          created_at: string
          description: string
          display_lat: number | null
          display_lng: number | null
          draft_expiry_notified_at: string | null
          expires_at: string | null
          hidden_from_home: boolean
          id: string
          is_free: boolean
          kaupet_code: string
          known_issues: string | null
          lat: number | null
          lng: number | null
          maintenance_history: string | null
          no_known_issues: boolean
          postal_code: string | null
          price_nok: number | null
          published_at: string | null
          search_vector: unknown
          seller_id: string
          show_visiting_address: boolean
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          can_ship?: boolean | null
          category_id?: string | null
          city?: string | null
          condition?: Database["public"]["Enums"]["listing_condition"] | null
          counted_category_id?: string | null
          counted_keyword_category_id?: string | null
          counted_keywords?: string[] | null
          counted_lexemes?: string[] | null
          created_at?: string
          description?: string
          display_lat?: number | null
          display_lng?: number | null
          draft_expiry_notified_at?: string | null
          expires_at?: string | null
          hidden_from_home?: boolean
          id?: string
          is_free?: boolean
          kaupet_code?: string
          known_issues?: string | null
          lat?: number | null
          lng?: number | null
          maintenance_history?: string | null
          no_known_issues?: boolean
          postal_code?: string | null
          price_nok?: number | null
          published_at?: string | null
          search_vector?: unknown
          seller_id: string
          show_visiting_address?: boolean
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          can_ship?: boolean | null
          category_id?: string | null
          city?: string | null
          condition?: Database["public"]["Enums"]["listing_condition"] | null
          counted_category_id?: string | null
          counted_keyword_category_id?: string | null
          counted_keywords?: string[] | null
          counted_lexemes?: string[] | null
          created_at?: string
          description?: string
          display_lat?: number | null
          display_lng?: number | null
          draft_expiry_notified_at?: string | null
          expires_at?: string | null
          hidden_from_home?: boolean
          id?: string
          is_free?: boolean
          kaupet_code?: string
          known_issues?: string | null
          lat?: number | null
          lng?: number | null
          maintenance_history?: string | null
          no_known_issues?: boolean
          postal_code?: string | null
          price_nok?: number | null
          published_at?: string | null
          search_vector?: unknown
          seller_id?: string
          show_visiting_address?: boolean
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reaction_rate_limits: {
        Row: {
          changes: number
          user_id: string
          window_start: string
        }
        Insert: {
          changes: number
          user_id: string
          window_start: string
        }
        Update: {
          changes?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          conversation_id: string
          created_at: string
          emoji: string | null
          message_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          emoji?: string | null
          message_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          emoji?: string | null
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_path: string | null
          body: string
          client_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          sender_id: string
        }
        Insert: {
          attachment_path?: string | null
          body: string
          client_id?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          attachment_path?: string | null
          body?: string
          client_id?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      r2_delete_queue: {
        Row: {
          attempts: number
          bucket: string
          id: number
          last_error: string | null
          prefix: string
          requested_at: string
        }
        Insert: {
          attempts?: number
          bucket: string
          id?: number
          last_error?: string | null
          prefix: string
          requested_at?: string
        }
        Update: {
          attempts?: number
          bucket?: string
          id?: number
          last_error?: string | null
          prefix?: string
          requested_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          listing_id: string | null
          reason: string
          reported_user_id: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          default_search_examples: string[]
          id: boolean
          updated_at: string
        }
        Insert: {
          default_search_examples?: string[]
          id?: boolean
          updated_at?: string
        }
        Update: {
          default_search_examples?: string[]
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      standard_upload_objects: {
        Row: {
          attempts: number
          bucket: string
          claimed_at: string | null
          created_at: string
          id: number
          last_error: string | null
          object_key: string
          state: string
        }
        Insert: {
          attempts?: number
          bucket: string
          claimed_at?: string | null
          created_at?: string
          id?: never
          last_error?: string | null
          object_key: string
          state?: string
        }
        Update: {
          attempts?: number
          bucket?: string
          claimed_at?: string | null
          created_at?: string
          id?: never
          last_error?: string | null
          object_key?: string
          state?: string
        }
        Relationships: []
      }
      standard_upload_quotas: {
        Row: {
          object_count: number
          total_bytes: number
          user_id: string
          window_started_at: string
        }
        Insert: {
          object_count?: number
          total_bytes?: number
          user_id: string
          window_started_at?: string
        }
        Update: {
          object_count?: number
          total_bytes?: number
          user_id?: string
          window_started_at?: string
        }
        Relationships: []
      }
      system_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: []
      }
      user_bans: {
        Row: {
          banned_by: string
          created_at: string
          reason: string
          user_id: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          reason: string
          user_id: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          conversation_id: string | null
          created_at: string
          id: string
          listing_id: string | null
          reason: string | null
          scope: Database["public"]["Enums"]["block_scope"]
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          reason?: string | null
          scope: Database["public"]["Enums"]["block_scope"]
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          reason?: string | null
          scope?: Database["public"]["Enums"]["block_scope"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_suspensions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          reason: string
          suspended_by: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          reason: string
          suspended_by: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          reason?: string
          suspended_by?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_ban_user: {
        Args: { _reason: string; _user_id: string }
        Returns: undefined
      }
      admin_delete_listing: {
        Args: { _id: string; _message: string }
        Returns: undefined
      }
      admin_disable_listing: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      admin_disable_listing_with_message: {
        Args: { _id: string; _message: string; _reason: string }
        Returns: undefined
      }
      admin_enable_listing: { Args: { _id: string }; Returns: undefined }
      admin_export_user_data: { Args: { _user_id: string }; Returns: Json }
      admin_find_users_by_email: {
        Args: { _query: string }
        Returns: {
          created_at: string
          display_name: string
          email: string
          is_admin: boolean
          is_demo: boolean
          is_moderator: boolean
          user_id: string
        }[]
      }
      admin_grant_demo_role: { Args: { _user_id: string }; Returns: undefined }
      admin_grant_moderator_role: {
        Args: { _user_id: string }
        Returns: undefined
      }
      admin_grant_role: { Args: { _user_id: string }; Returns: undefined }
      admin_list_bans: {
        Args: never
        Returns: {
          banned_by: string
          created_at: string
          display_name: string
          reason: string
          user_id: string
        }[]
      }
      admin_list_reports: {
        Args: { _limit?: number }
        Returns: {
          comment: string
          created_at: string
          id: string
          kaupet_code: string
          listing_id: string
          listing_title: string
          owner_id: string
          owner_name: string
          reason: string
          reported_user_id: string
          reported_user_name: string
          reporter_id: string
          reporter_name: string
          resolved_at: string
          status: string
        }[]
      }
      admin_replace_listing_category: {
        Args: {
          _category_id: string
          _expected_rows: Json
          _replacement_category_id: string
        }
        Returns: undefined
      }
      admin_resolve_report: { Args: { _id: string }; Returns: undefined }
      admin_revoke_demo_role: { Args: { _user_id: string }; Returns: undefined }
      admin_revoke_moderator_role: {
        Args: { _user_id: string }
        Returns: undefined
      }
      admin_revoke_role: { Args: { _user_id: string }; Returns: undefined }
      admin_search_listings: {
        Args: { _limit?: number; _query?: string; _status?: string }
        Returns: {
          created_at: string
          hidden_from_home: boolean
          id: string
          kaupet_code: string
          seller_id: string
          seller_name: string
          status: Database["public"]["Enums"]["listing_status"]
          title: string
        }[]
      }
      admin_set_listing_home_visibility: {
        Args: { _hidden: boolean; _id: string }
        Returns: undefined
      }
      admin_unban_user: { Args: { _user_id: string }; Returns: undefined }
      can_upload_listing_image: {
        Args: { _listing_id: string }
        Returns: boolean
      }
      cancel_account_deletion: { Args: never; Returns: boolean }
      check_endpoint_rate_limit: {
        Args: {
          _bucket: string
          _key_hash: string
          _limit: number
          _window_seconds: number
        }
        Returns: boolean
      }
      check_user_rate_limit: {
        Args: {
          _bucket: string
          _limit: number
          _user_id: string
          _window_seconds: number
        }
        Returns: boolean
      }
      claim_orphan_standard_uploads: {
        Args: { _limit: number }
        Returns: {
          attempts: number
          bucket: string
          id: number
          object_key: string
        }[]
      }
      dispatch_r2_cleanup: { Args: never; Returns: undefined }
      expire_old_listings: { Args: never; Returns: number }
      finish_orphan_standard_upload: {
        Args: { _deleted: boolean; _error?: string; _id: number }
        Returns: undefined
      }
      generate_kaupet_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_blocked_between: {
        Args: { _a: string; _b: string; _conversation_id: string }
        Returns: boolean
      }
      is_ip_banned: { Args: { _ip: unknown }; Returns: boolean }
      is_user_banned: { Args: { _uid: string }; Returns: boolean }
      is_user_deletion_pending: { Args: { _user_id: string }; Returns: boolean }
      is_user_suspended: { Args: { _uid: string }; Returns: boolean }
      listing_attribute_format_rules: {
        Args: { _category_id: string; _extra_dates: Json }
        Returns: {
          key: string
          label_nb: string
          type: string
        }[]
      }
      listing_is_public: {
        Args: {
          _sold_at: string | null
          _status: Database["public"]["Enums"]["listing_status"]
        }
        Returns: boolean
      }
      listing_matches_attribute_filters: {
        Args: { _attributes: Json; _filters: Json }
        Returns: boolean
      }
      listing_precise_location: {
        Args: { _listing_id: string }
        Returns: {
          lat: number | null
          lng: number | null
        }[]
      }
      lock_listing_draft_for_user: {
        Args: { _listing_id: string; _user_id: string }
        Returns: {
          attributes: Json
          can_ship: boolean | null
          category_id: string | null
          city: string | null
          condition: Database["public"]["Enums"]["listing_condition"] | null
          counted_category_id: string | null
          counted_keyword_category_id: string | null
          counted_keywords: string[] | null
          counted_lexemes: string[] | null
          created_at: string
          description: string
          display_lat: number | null
          display_lng: number | null
          draft_expiry_notified_at: string | null
          expires_at: string | null
          hidden_from_home: boolean
          id: string
          is_free: boolean
          kaupet_code: string
          known_issues: string | null
          lat: number | null
          lng: number | null
          maintenance_history: string | null
          no_known_issues: boolean
          postal_code: string | null
          price_nok: number | null
          published_at: string | null
          search_vector: unknown
          seller_id: string
          show_visiting_address: boolean
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          subtitle: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_listing_counts: {
        Args: never
        Returns: {
          favorite_count: number
          listing_id: string
          view_count: number
        }[]
      }
      my_moderation_status: {
        Args: never
        Returns: {
          ban_reason: string
          is_banned: boolean
          is_suspended: boolean
          suspension_expires_at: string
          suspension_reason: string
        }[]
      }
      publish_listing_draft: {
        Args: {
          _fields: Json
          _images: Json
          _listing_id: string
          _user_id: string
        }
        Returns: Json
      }
      purge_endpoint_rate_limits: { Args: never; Returns: undefined }
      purge_expired_accounts: { Args: never; Returns: number }
      purge_expired_personal_data: { Args: never; Returns: Json }
      register_standard_upload_object: {
        Args: { _bucket: string; _key: string }
        Returns: undefined
      }
      request_account_deletion: { Args: { _email: string }; Returns: undefined }
      reserve_standard_upload_quota: {
        Args: { _bytes: number; _user_id: string }
        Returns: boolean
      }
      search_listings_page: {
        Args: {
          _attribute_filters?: Json
          _category_ids?: string[]
          _center_lat?: number
          _center_lng?: number
          _conditions?: Database["public"]["Enums"]["listing_condition"][]
          _exclude_all_groups?: Json
          _exclude_any_terms?: string[]
          _include_free?: boolean
          _include_groups?: Json
          _include_recently_sold?: boolean
          _limit?: number
          _max_price?: number
          _min_price?: number
          _offset?: number
          _radius_km?: number
          _sort?: string
        }
        Returns: {
          attributes: Json
          category_slug: string
          city: string
          cover_path: string
          created_at: string
          display_lat: number
          display_lng: number
          id: string
          is_free: boolean
          kaupet_code: string
          price_nok: number
          relevance: number
          sold_at: string
          subtitle: string
          title: string
          total_count: number
        }[]
      }
      send_message_rate_limited: {
        Args: {
          _attachment_path: string | null
          _body: string
          _client_id: string
          _conversation_id: string
          _sender_id: string
        }
        Returns: {
          attachment_path: string | null
          body: string
          client_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          sender_id: string
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_message_reaction: {
        Args: { _emoji: string | null; _message_id: string }
        Returns: undefined
      }
      standard_upload_is_referenced: {
        Args: { _bucket: string; _key: string }
        Returns: boolean
      }
      submit_listing_report: {
        Args: { _comment?: string; _listing_id: string; _reason: string }
        Returns: undefined
      }
      submit_user_report: {
        Args: { _comment?: string; _reason: string; _reported_user_id: string }
        Returns: undefined
      }
      sync_draft_listing_images: {
        Args: { _images: Json; _listing_id: string; _user_id: string }
        Returns: Json
      }
      sync_listing_images: {
        Args: { _images: Json; _listing_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "demo" | "moderator"
      block_scope: "all" | "conversation"
      listing_condition:
        | "new"
        | "like_new"
        | "good"
        | "acceptable"
        | "for_parts"
      listing_status:
        | "draft"
        | "active"
        | "sold"
        | "archived"
        | "expired"
        | "disabled"
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
      app_role: ["admin", "user", "demo", "moderator"],
      block_scope: ["all", "conversation"],
      listing_condition: ["new", "like_new", "good", "acceptable", "for_parts"],
      listing_status: [
        "draft",
        "active",
        "sold",
        "archived",
        "expired",
        "disabled",
      ],
    },
  },
} as const

