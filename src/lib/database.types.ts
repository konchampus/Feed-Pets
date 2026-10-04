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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      care_event_pushes: {
        Row: {
          claim_token: string
          claimed_at: string
          event_id: string
          sent_at: string | null
        }
        Insert: {
          claim_token?: string
          claimed_at?: string
          event_id: string
          sent_at?: string | null
        }
        Update: {
          claim_token?: string
          claimed_at?: string
          event_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_event_pushes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "care_events"
            referencedColumns: ["id"]
          },
        ]
      }
      care_events: {
        Row: {
          actor_name: string
          amount: number | null
          author_id: string
          created_at: string
          family_id: string
          id: string
          kind: Database["public"]["Enums"]["care_kind"]
          label: string | null
          note: string | null
          occurred_at: string
          pet_id: string
          unit: string | null
        }
        Insert: {
          actor_name?: string
          amount?: number | null
          author_id?: string
          created_at?: string
          family_id: string
          id?: string
          kind: Database["public"]["Enums"]["care_kind"]
          label?: string | null
          note?: string | null
          occurred_at?: string
          pet_id: string
          unit?: string | null
        }
        Update: {
          actor_name?: string
          amount?: number | null
          author_id?: string
          created_at?: string
          family_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["care_kind"]
          label?: string | null
          note?: string | null
          occurred_at?: string
          pet_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_events_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      care_schedules: {
        Row: {
          created_at: string
          created_by: string
          family_id: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["care_kind"]
          last_notified_for: string | null
          local_time: string
          notification_claim_token: string | null
          notification_claimed_at: string | null
          notification_claimed_for: string | null
          pet_id: string
          timezone: string
          title: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          created_by?: string
          family_id: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["care_kind"]
          last_notified_for?: string | null
          local_time: string
          notification_claim_token?: string | null
          notification_claimed_at?: string | null
          notification_claimed_for?: string | null
          pet_id: string
          timezone?: string
          title: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          created_by?: string
          family_id?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["care_kind"]
          last_notified_for?: string | null
          local_time?: string
          notification_claim_token?: string | null
          notification_claimed_at?: string | null
          notification_claimed_for?: string | null
          pet_id?: string
          timezone?: string
          title?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "care_schedules_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_schedules_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      family_invites: {
        Row: {
          created_at: string
          expires_at: string
          family_id: string
          id: string
          invited_by: string
          invited_email: string | null
          redeemed_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          family_id: string
          id?: string
          invited_by?: string
          invited_email?: string | null
          redeemed_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          family_id?: string
          id?: string
          invited_by?: string
          invited_email?: string | null
          redeemed_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_invites_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          family_id: string
          joined_at: string
          role: Database["public"]["Enums"]["family_role"]
          user_id: string
        }
        Insert: {
          family_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["family_role"]
          user_id: string
        }
        Update: {
          family_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["family_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempts: number
          bucket_hash: string
          window_start: string
        }
        Insert: {
          attempts?: number
          bucket_hash: string
          window_start?: string
        }
        Update: {
          attempts?: number
          bucket_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      pets: {
        Row: {
          allergies: string
          birthday: string | null
          breed: string
          created_at: string
          family_id: string
          health_notes: string
          id: string
          name: string
          photo_url: string | null
          sex: string | null
        }
        Insert: {
          allergies?: string
          birthday?: string | null
          breed?: string
          created_at?: string
          family_id: string
          health_notes?: string
          id?: string
          name: string
          photo_url?: string | null
          sex?: string | null
        }
        Update: {
          allergies?: string
          birthday?: string | null
          breed?: string
          created_at?: string
          family_id?: string
          health_notes?: string
          id?: string
          name?: string
          photo_url?: string | null
          sex?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pets_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      push_delivery_receipts: {
        Row: {
          delivered_at: string
          event_id: string | null
          id: string
          local_date: string | null
          schedule_id: string | null
          subscription_id: string
        }
        Insert: {
          delivered_at?: string
          event_id?: string | null
          id?: string
          local_date?: string | null
          schedule_id?: string | null
          subscription_id: string
        }
        Update: {
          delivered_at?: string
          event_id?: string | null
          id?: string
          local_date?: string | null
          schedule_id?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_delivery_receipts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "care_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_delivery_receipts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "care_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_delivery_receipts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          subscription: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          subscription: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          subscription?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_care_event_push: {
        Args: { requesting_user: string; target_event: string }
        Returns: string
      }
      claim_care_schedule: {
        Args: { local_date: string; schedule_id: string }
        Returns: string
      }
      complete_care_event_push: {
        Args: { claim_token: string; target_event: string }
        Returns: boolean
      }
      complete_care_schedule: {
        Args: { claim_token: string; local_date: string; schedule_id: string }
        Returns: boolean
      }
      consume_login_attempt: {
        Args: { attempt_hash: string; max_attempts?: number }
        Returns: boolean
      }
      has_other_family_owner: {
        Args: { excluded_user: string; target_family: string }
        Returns: boolean
      }
      is_family_member: { Args: { target_family: string }; Returns: boolean }
      is_family_owner: { Args: { target_family: string }; Returns: boolean }
      record_care_event_push_delivery: {
        Args: {
          claim_token: string
          target_event: string
          target_subscription: string
        }
        Returns: boolean
      }
      record_care_schedule_push_delivery: {
        Args: {
          claim_token: string
          local_date: string
          target_schedule: string
          target_subscription: string
        }
        Returns: boolean
      }
      redeem_family_invite: {
        Args: {
          invite_hash: string
          joining_email: string
          joining_user: string
        }
        Returns: string
      }
      release_care_event_push: {
        Args: { claim_token: string; target_event: string }
        Returns: undefined
      }
      release_care_schedule: {
        Args: { claim_token: string; schedule_id: string }
        Returns: undefined
      }
    }
    Enums: {
      care_kind:
        | "meal"
        | "walk"
        | "water"
        | "medicine"
        | "weight"
        | "vet"
        | "vaccine"
      family_role: "owner" | "member"
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
  public: {
    Enums: {
      care_kind: [
        "meal",
        "walk",
        "water",
        "medicine",
        "weight",
        "vet",
        "vaccine",
      ],
      family_role: ["owner", "member"],
    },
  },
} as const

