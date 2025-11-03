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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_logs: {
        Row: {
          attempted_value: string | null
          conversation_id: string | null
          created_at: string
          event_type: string
          id: string
          message: string | null
          user_id: string
          valid_options: Json | null
        }
        Insert: {
          attempted_value?: string | null
          conversation_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          user_id: string
          valid_options?: Json | null
        }
        Update: {
          attempted_value?: string | null
          conversation_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          user_id?: string
          valid_options?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_notifications: {
        Row: {
          appointment_id: string
          created_at: string | null
          error_details: Json | null
          id: string
          message_text: string
          notification_type: string
          sent_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string | null
          error_details?: Json | null
          id?: string
          message_text: string
          notification_type: string
          sent_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string | null
          error_details?: Json | null
          id?: string
          message_text?: string
          notification_type?: string
          sent_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          client_arrival_detected_at: string | null
          client_arrived: boolean | null
          contact_name: string
          contact_phone: string
          conversation_id: string | null
          created_at: string
          duration_minutes: number
          end_time: string
          id: string
          notes: string | null
          provider_ready_to_receive: boolean | null
          service: string | null
          start_time: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_date: string
          client_arrival_detected_at?: string | null
          client_arrived?: boolean | null
          contact_name: string
          contact_phone: string
          conversation_id?: string | null
          created_at?: string
          duration_minutes: number
          end_time: string
          id?: string
          notes?: string | null
          provider_ready_to_receive?: boolean | null
          service?: string | null
          start_time: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_date?: string
          client_arrival_detected_at?: string | null
          client_arrived?: boolean | null
          contact_name?: string
          contact_phone?: string
          conversation_id?: string | null
          created_at?: string
          duration_minutes?: number
          end_time?: string
          id?: string
          notes?: string | null
          provider_ready_to_receive?: boolean | null
          service?: string | null
          start_time?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      availabilities: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          ai_enabled: boolean | null
          contact_name: string | null
          contact_phone: string
          created_at: string | null
          id: string
          instance_id: string
          is_pinned: boolean | null
          last_message_at: string | null
          last_message_text: string | null
          pinned_at: string | null
          unread_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_enabled?: boolean | null
          contact_name?: string | null
          contact_phone: string
          created_at?: string | null
          id?: string
          instance_id: string
          is_pinned?: boolean | null
          last_message_at?: string | null
          last_message_text?: string | null
          pinned_at?: string | null
          unread_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_enabled?: boolean | null
          contact_name?: string | null
          contact_phone?: string
          created_at?: string | null
          id?: string
          instance_id?: string
          is_pinned?: boolean | null
          last_message_at?: string | null
          last_message_text?: string | null
          pinned_at?: string | null
          unread_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_instance_creation_queue: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          processed_at: string | null
          request_id: string
          retry_count: number | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed_at?: string | null
          request_id: string
          retry_count?: number | null
          status: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed_at?: string | null
          request_id?: string
          retry_count?: number | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      evolution_instances: {
        Row: {
          ai_enabled: boolean | null
          created_at: string
          id: string
          instance_name: string
          instance_status: string
          instance_token: string | null
          last_qr_update: string | null
          phone_number: string | null
          qr_code: string | null
          updated_at: string
          user_id: string
          webhook_url: string
        }
        Insert: {
          ai_enabled?: boolean | null
          created_at?: string
          id?: string
          instance_name: string
          instance_status?: string
          instance_token?: string | null
          last_qr_update?: string | null
          phone_number?: string | null
          qr_code?: string | null
          updated_at?: string
          user_id: string
          webhook_url: string
        }
        Update: {
          ai_enabled?: boolean | null
          created_at?: string
          id?: string
          instance_name?: string
          instance_status?: string
          instance_token?: string | null
          last_qr_update?: string | null
          phone_number?: string | null
          qr_code?: string | null
          updated_at?: string
          user_id?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "evolution_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          direction: string
          id: string
          instance_id: string
          message_id: string | null
          receiver_phone: string
          sender_phone: string
          status: string | null
          timestamp: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          direction: string
          id?: string
          instance_id: string
          message_id?: string | null
          receiver_phone: string
          sender_phone: string
          status?: string | null
          timestamp?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          direction?: string
          id?: string
          instance_id?: string
          message_id?: string | null
          receiver_phone?: string
          sender_phone?: string
          status?: string | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_informations: {
        Row: {
          access_instructions: string | null
          adresse: string | null
          created_at: string
          door_code: string | null
          elevator_info: string | null
          extras: Json | null
          floor: string | null
          id: string
          notification_phone: string | null
          prestations: Json | null
          taboos: Json | null
          tarifs: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_instructions?: string | null
          adresse?: string | null
          created_at?: string
          door_code?: string | null
          elevator_info?: string | null
          extras?: Json | null
          floor?: string | null
          id?: string
          notification_phone?: string | null
          prestations?: Json | null
          taboos?: Json | null
          tarifs?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_instructions?: string | null
          adresse?: string | null
          created_at?: string
          door_code?: string | null
          elevator_info?: string | null
          extras?: Json | null
          floor?: string | null
          id?: string
          notification_phone?: string | null
          prestations?: Json | null
          taboos?: Json | null
          tarifs?: Json | null
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
      complete_appointment_and_unpin: {
        Args: { p_appointment_id: string }
        Returns: Json
      }
      get_todays_appointments_with_status: {
        Args: { p_user_id: string }
        Returns: {
          appointment_id: string
          client_arrival_detected_at: string
          client_arrived: boolean
          contact_name: string
          contact_phone: string
          conversation_id: string
          end_time: string
          provider_ready_to_receive: boolean
          service: string
          start_time: string
        }[]
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
