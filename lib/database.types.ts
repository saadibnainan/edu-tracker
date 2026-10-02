
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "calendar_sources": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": string,"label": string | null,"updated_at": string,"url": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"label"?: string | null,"updated_at"?: string,"url": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"label"?: string | null,"updated_at"?: string,"url"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"exams": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"exam_date": string,"id": string,"subject_id": string,"title": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"exam_date": string,"id"?: string,"subject_id": string,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"exam_date"?: string,"id"?: string,"subject_id"?: string,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exams_subject_id_user_id_fkey"
      columns: ["subject_id","user_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"goals": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": string,"period": string,"subject_id": string | null,"target_minutes": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"period": string,"subject_id"?: string | null,"target_minutes": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"period"?: string,"subject_id"?: string | null,"target_minutes"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_subject_id_user_id_fkey"
      columns: ["subject_id","user_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"sessions": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"duration_seconds": number,"ended_at": string,"id": string,"kind": string,"note": string | null,"started_at": string,"subject_id": string,"tags": (string)[],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"duration_seconds": number,"ended_at": string,"id"?: string,"kind": string,"note"?: string | null,"started_at": string,"subject_id": string,"tags"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"duration_seconds"?: number,"ended_at"?: string,"id"?: string,"kind"?: string,"note"?: string | null,"started_at"?: string,"subject_id"?: string,"tags"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sessions_subject_id_user_id_fkey"
      columns: ["subject_id","user_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"subjects": {
                  Row: {
                    "archived_at": string | null,"color_index": number,"created_at": string,"id": string,"name": string,"updated_at": string,"user_id": string,"weekly_target_minutes": number | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"color_index"?: number,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string,"user_id"?: string,"weekly_target_minutes"?: number | null
                  }
                  Update: {
                    "archived_at"?: string | null,"color_index"?: number,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string,"user_id"?: string,"weekly_target_minutes"?: number | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
