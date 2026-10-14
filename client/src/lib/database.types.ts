export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      emergencies: {
        Row: {
          area: string;
          assembly_point: string;
          assembly_point_id: string | null;
          building: string;
          closed_at: string | null;
          closed_by_name: string | null;
          created_at: string;
          description: string;
          emergency_type: string;
          floor: string;
          id: string;
          incident_no: string;
          location: string;
          remark: string | null;
          resolved_at: string | null;
          resolved_by_name: string | null;
          status: string;
          stopped_at: string | null;
          stopped_by_name: string | null;
          title: string;
          triggered_at: string;
          triggered_by: string;
          triggered_by_name: string;
        };
        Insert: {
          area?: string;
          assembly_point?: string;
          assembly_point_id?: string | null;
          building: string;
          closed_at?: string | null;
          closed_by_name?: string | null;
          created_at?: string;
          description?: string;
          emergency_type: string;
          floor?: string;
          id?: string;
          incident_no?: string;
          location: string;
          remark?: string | null;
          resolved_at?: string | null;
          resolved_by_name?: string | null;
          status?: string;
          stopped_at?: string | null;
          stopped_by_name?: string | null;
          title?: string;
          triggered_at?: string;
          triggered_by: string;
          triggered_by_name?: string;
        };
        Update: {
          area?: string;
          assembly_point?: string;
          assembly_point_id?: string | null;
          building?: string;
          closed_at?: string | null;
          closed_by_name?: string | null;
          created_at?: string;
          description?: string;
          emergency_type?: string;
          floor?: string;
          id?: string;
          incident_no?: string;
          location?: string;
          remark?: string | null;
          resolved_at?: string | null;
          resolved_by_name?: string | null;
          status?: string;
          stopped_at?: string | null;
          stopped_by_name?: string | null;
          title?: string;
          triggered_at?: string;
          triggered_by?: string;
          triggered_by_name?: string;
        };
        Relationships: [];
      };
      emg_activity: {
        Row: {
          action: string;
          created_at: string;
          description: string;
          id: string;
          incident_id: string;
          performed_by: string | null;
          performed_by_name: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          description?: string;
          id?: string;
          incident_id: string;
          performed_by?: string | null;
          performed_by_name?: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          description?: string;
          id?: string;
          incident_id?: string;
          performed_by?: string | null;
          performed_by_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "emg_activity_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "emergencies";
            referencedColumns: ["id"];
          },
        ];
      };
      emg_assembly_points: {
        Row: {
          active: boolean;
          created_at: string;
          description: string;
          id: string;
          location: string;
          name: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string;
          id?: string;
          location?: string;
          name: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string;
          id?: string;
          location?: string;
          name?: string;
        };
        Relationships: [];
      };
      emg_incident_employees: {
        Row: {
          assistance_status: string;
          created_at: string;
          department: string;
          employee_email: string;
          employee_id: string;
          employee_name: string;
          handled_at: string | null;
          handled_by_name: string | null;
          id: string;
          incident_id: string;
          notification_status: string;
          read_at: string | null;
          response_time: string | null;
          safety_status: string;
        };
        Insert: {
          assistance_status?: string;
          created_at?: string;
          department?: string;
          employee_email?: string;
          employee_id: string;
          employee_name?: string;
          handled_at?: string | null;
          handled_by_name?: string | null;
          id?: string;
          incident_id: string;
          notification_status?: string;
          read_at?: string | null;
          response_time?: string | null;
          safety_status?: string;
        };
        Update: {
          assistance_status?: string;
          created_at?: string;
          department?: string;
          employee_email?: string;
          employee_id?: string;
          employee_name?: string;
          handled_at?: string | null;
          handled_by_name?: string | null;
          id?: string;
          incident_id?: string;
          notification_status?: string;
          read_at?: string | null;
          response_time?: string | null;
          safety_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "emg_incident_employees_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "emergencies";
            referencedColumns: ["id"];
          },
        ];
      };
      emg_incident_types: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      ewp_attendance: {
        Row: {
          check_in_at: string;
          check_in_by_name: string;
          check_out_at: string | null;
          check_out_by_name: string | null;
          day: string;
          id: string;
          permit_id: string;
          worker_id: string;
        };
        Insert: {
          check_in_at?: string;
          check_in_by_name?: string;
          check_out_at?: string | null;
          check_out_by_name?: string | null;
          day?: string;
          id?: string;
          permit_id: string;
          worker_id: string;
        };
        Update: {
          check_in_at?: string;
          check_in_by_name?: string;
          check_out_at?: string | null;
          check_out_by_name?: string | null;
          day?: string;
          id?: string;
          permit_id?: string;
          worker_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ewp_attendance_permit_id_fkey";
            columns: ["permit_id"];
            isOneToOne: false;
            referencedRelation: "work_permits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ewp_attendance_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "ewp_workers";
            referencedColumns: ["id"];
          },
        ];
      };
      ewp_events: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string;
          created_at: string;
          id: string;
          note: string;
          permit_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name?: string;
          created_at?: string;
          id?: string;
          note?: string;
          permit_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string;
          created_at?: string;
          id?: string;
          note?: string;
          permit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ewp_events_permit_id_fkey";
            columns: ["permit_id"];
            isOneToOne: false;
            referencedRelation: "work_permits";
            referencedColumns: ["id"];
          },
        ];
      };
      ewp_locations: {
        Row: {
          active: boolean;
          area: string;
          building: string;
          created_at: string;
          floor: string;
          id: string;
        };
        Insert: {
          active?: boolean;
          area?: string;
          building: string;
          created_at?: string;
          floor?: string;
          id?: string;
        };
        Update: {
          active?: boolean;
          area?: string;
          building?: string;
          created_at?: string;
          floor?: string;
          id?: string;
        };
        Relationships: [];
      };
      ewp_vendors: {
        Row: {
          active: boolean;
          contact: string;
          created_at: string;
          email: string;
          id: string;
          name: string;
        };
        Insert: {
          active?: boolean;
          contact?: string;
          created_at?: string;
          email?: string;
          id?: string;
          name: string;
        };
        Update: {
          active?: boolean;
          contact?: string;
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      ewp_workers: {
        Row: {
          contact: string;
          created_at: string;
          id: string;
          name: string;
          pass_no: string | null;
          permit_id: string;
          registered_at: string | null;
          registered_by_name: string | null;
          worker_ref: string;
        };
        Insert: {
          contact?: string;
          created_at?: string;
          id?: string;
          name: string;
          pass_no?: string | null;
          permit_id: string;
          registered_at?: string | null;
          registered_by_name?: string | null;
          worker_ref?: string;
        };
        Update: {
          contact?: string;
          created_at?: string;
          id?: string;
          name?: string;
          pass_no?: string | null;
          permit_id?: string;
          registered_at?: string | null;
          registered_by_name?: string | null;
          worker_ref?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ewp_workers_permit_id_fkey";
            columns: ["permit_id"];
            isOneToOne: false;
            referencedRelation: "work_permits";
            referencedColumns: ["id"];
          },
        ];
      };
      guest_cards: {
        Row: {
          code: string;
          created_at: string;
          current_visit_id: string | null;
          id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          current_visit_id?: string | null;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          current_visit_id?: string | null;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      hd_categories: {
        Row: {
          active: boolean;
          created_at: string;
          description: string;
          id: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      hd_buildings: {
        Row: {
          active: boolean;
          branch_id: string;
          created_at: string;
          id: string;
          latitude: number | null;
          longitude: number | null;
          name: string;
          radius_m: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          branch_id: string;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          radius_m?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          branch_id?: string;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          radius_m?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      hd_building_areas: {
        Row: {
          active: boolean;
          building_id: string;
          created_at: string;
          floor: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          building_id: string;
          created_at?: string;
          floor: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          building_id?: string;
          created_at?: string;
          floor?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      hd_building_floors: {
        Row: {
          active: boolean;
          building_id: string;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          building_id: string;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          building_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      hd_evidence: {
        Row: {
          created_at: string;
          file_name: string;
          file_url: string;
          id: string;
          ticket_id: string;
          uploaded_by: string;
          uploaded_by_name: string;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          file_url: string;
          id?: string;
          ticket_id: string;
          uploaded_by?: string;
          uploaded_by_name?: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          file_url?: string;
          id?: string;
          ticket_id?: string;
          uploaded_by?: string;
          uploaded_by_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hd_evidence_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "hd_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      hd_notifications: {
        Row: {
          created_at: string;
          id: string;
          is_read: boolean;
          message: string;
          recipient_id: string;
          ticket_id: string | null;
          title: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message?: string;
          recipient_id: string;
          ticket_id?: string | null;
          title: string;
          type?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message?: string;
          recipient_id?: string;
          ticket_id?: string | null;
          title?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hd_notifications_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "hd_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      hd_providers: {
        Row: {
          active: boolean;
          contact: string;
          created_at: string;
          email: string;
          id: string;
          name: string;
        };
        Insert: {
          active?: boolean;
          contact?: string;
          created_at?: string;
          email?: string;
          id?: string;
          name: string;
        };
        Update: {
          active?: boolean;
          contact?: string;
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      hd_services: {
        Row: {
          active: boolean;
          category_id: string;
          created_at: string;
          description: string;
          evidence_required: boolean;
          id: string;
          name: string;
          provider_id: string | null;
          subcategory_id: string | null;
        };
        Insert: {
          active?: boolean;
          category_id: string;
          created_at?: string;
          description?: string;
          evidence_required?: boolean;
          id?: string;
          name: string;
          provider_id?: string | null;
          subcategory_id?: string | null;
        };
        Update: {
          active?: boolean;
          category_id?: string;
          created_at?: string;
          description?: string;
          evidence_required?: boolean;
          id?: string;
          name?: string;
          provider_id?: string | null;
          subcategory_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "hd_services_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "hd_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hd_services_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "hd_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hd_services_subcategory_id_fkey";
            columns: ["subcategory_id"];
            isOneToOne: false;
            referencedRelation: "hd_subcategories";
            referencedColumns: ["id"];
          },
        ];
      };
      hd_subcategories: {
        Row: {
          active: boolean;
          category_id: string;
          created_at: string;
          description: string;
          id: string;
          name: string;
        };
        Insert: {
          active?: boolean;
          category_id: string;
          created_at?: string;
          description?: string;
          id?: string;
          name: string;
        };
        Update: {
          active?: boolean;
          category_id?: string;
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hd_subcategories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "hd_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      hd_ticket_events: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          performed_by: string | null;
          performed_by_name: string;
          remarks: string;
          ticket_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          performed_by?: string | null;
          performed_by_name?: string;
          remarks?: string;
          ticket_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          performed_by?: string | null;
          performed_by_name?: string;
          remarks?: string;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hd_ticket_events_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "hd_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      hd_tickets: {
        Row: {
          assigned_at: string | null;
          area_name: string | null;
          branch_id: string | null;
          building_area_id: string | null;
          building_id: string | null;
          category_id: string;
          category_name: string;
          closed_at: string | null;
          closed_by_name: string | null;
          created_at: string;
          description: string;
          id: string;
          location: string;
          floor_name: string | null;
          priority: "HIGH" | "MEDIUM" | "LOW";
          provider_id: string | null;
          provider_name: string;
          raiser_email: string;
          raiser_id: string;
          raiser_name: string;
          service_id: string | null;
          service_name: string;
          status: string;
          subcategory_id: string | null;
          subcategory_name: string;
          ticket_no: string;
          updated_at: string;
        };
        Insert: {
          assigned_at?: string | null;
          area_name?: string | null;
          branch_id?: string | null;
          building_area_id?: string | null;
          building_id?: string | null;
          category_id: string;
          category_name?: string;
          closed_at?: string | null;
          closed_by_name?: string | null;
          created_at?: string;
          description: string;
          id?: string;
          location?: string;
          floor_name?: string | null;
          _latitude?: number;
          _longitude?: number;
          priority?: "HIGH" | "MEDIUM" | "LOW";
          provider_id?: string | null;
          provider_name?: string;
          raiser_email?: string;
          raiser_id?: string;
          raiser_name?: string;
          service_id?: string | null;
          service_name?: string;
          status?: string;
          subcategory_id?: string | null;
          subcategory_name?: string;
          ticket_no?: string;
          updated_at?: string;
        };
        Update: {
          assigned_at?: string | null;
          area_name?: string | null;
          branch_id?: string | null;
          building_area_id?: string | null;
          building_id?: string | null;
          category_id?: string;
          category_name?: string;
          closed_at?: string | null;
          closed_by_name?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          location?: string;
          floor_name?: string | null;
          priority?: "HIGH" | "MEDIUM" | "LOW";
          provider_id?: string | null;
          provider_name?: string;
          raiser_email?: string;
          raiser_id?: string;
          raiser_name?: string;
          service_id?: string | null;
          service_name?: string;
          status?: string;
          subcategory_id?: string | null;
          subcategory_name?: string;
          ticket_no?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hd_tickets_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "hd_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hd_tickets_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "hd_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hd_tickets_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "hd_services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hd_tickets_subcategory_id_fkey";
            columns: ["subcategory_id"];
            isOneToOne: false;
            referencedRelation: "hd_subcategories";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          department: string;
          designation: string;
          email: string;
          id: string;
          name: string;
          phone: string;
          role: string;
          status: string;
          branch_id: string | null;
          employee_id: string | null;
        };
        Insert: {
          created_at?: string;
          department?: string;
          designation?: string;
          email?: string;
          id: string;
          name?: string;
          phone?: string;
          role?: string;
          status?: string;
          branch_id?: string | null;
          employee_id?: string | null;
        };
        Update: {
          created_at?: string;
          department?: string;
          designation?: string;
          email?: string;
          id?: string;
          name?: string;
          phone?: string;
          role?: string;
          status?: string;
          branch_id?: string | null;
          employee_id?: string | null;
        };
        Relationships: [];
      };
      safety_reports: {
        Row: {
          emergency_id: string;
          id: string;
          person_id: string;
          person_name: string;
          recorded_at: string;
          reported_by: string;
          reported_by_name: string;
          status: string;
        };
        Insert: {
          emergency_id: string;
          id?: string;
          person_id: string;
          person_name?: string;
          recorded_at?: string;
          reported_by: string;
          reported_by_name?: string;
          status: string;
        };
        Update: {
          emergency_id?: string;
          id?: string;
          person_id?: string;
          person_name?: string;
          recorded_at?: string;
          reported_by?: string;
          reported_by_name?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "safety_reports_emergency_id_fkey";
            columns: ["emergency_id"];
            isOneToOne: false;
            referencedRelation: "emergencies";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      visit_events: {
        Row: {
          actor_id: string | null;
          actor_name: string;
          created_at: string;
          event: string;
          id: string;
          note: string;
          visit_id: string;
        };
        Insert: {
          actor_id?: string | null;
          actor_name?: string;
          created_at?: string;
          event: string;
          id?: string;
          note?: string;
          visit_id: string;
        };
        Update: {
          actor_id?: string | null;
          actor_name?: string;
          created_at?: string;
          event?: string;
          id?: string;
          note?: string;
          visit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visit_events_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      visit_requests: {
        Row: {
          arrival_gate: string | null;
          arrived_at: string | null;
          arrived_by_name: string | null;
          cancelled_at: string | null;
          checked_in_at: string | null;
          checked_in_by_name: string | null;
          checked_out_at: string | null;
          checked_out_by_name: string | null;
          company: string;
          created_at: string;
          designation: string;
          email: string;
          expected_arrival: string;
          expected_departure: string;
          guest_card_id: string | null;
          host_department: string;
          host_id: string | null;
          host_name: string;
          id: string;
          invitation_sent_at: string | null;
          location: string;
          phone: string;
          purpose: string;
          qr_token: string;
          rejection_reason: string | null;
          remarks: string;
          request_no: string;
          requested_by: string;
          requested_by_name: string;
          reviewed_at: string | null;
          reviewed_by_name: string | null;
          source: string;
          status: string;
          updated_at: string;
          visit_date: string;
          visitor_branch_id: string | null;
          visitor_code: string;
          visitor_employee_id: string | null;
          visitor_name: string;
          visitor_type: string;
        };
        Insert: {
          arrival_gate?: string | null;
          arrived_at?: string | null;
          arrived_by_name?: string | null;
          cancelled_at?: string | null;
          checked_in_at?: string | null;
          checked_in_by_name?: string | null;
          checked_out_at?: string | null;
          checked_out_by_name?: string | null;
          company?: string;
          created_at?: string;
          designation?: string;
          email?: string;
          expected_arrival?: string;
          expected_departure?: string;
          guest_card_id?: string | null;
          host_department?: string;
          host_id?: string | null;
          host_name?: string;
          id?: string;
          invitation_sent_at?: string | null;
          location?: string;
          phone?: string;
          purpose?: string;
          qr_token?: string;
          rejection_reason?: string | null;
          remarks?: string;
          request_no?: string;
          requested_by?: string;
          requested_by_name?: string;
          reviewed_at?: string | null;
          reviewed_by_name?: string | null;
          source?: string;
          status?: string;
          updated_at?: string;
          visit_date: string;
          visitor_branch_id?: string | null;
          visitor_code?: string;
          visitor_employee_id?: string | null;
          visitor_name: string;
          visitor_type?: string;
        };
        Update: {
          arrival_gate?: string | null;
          arrived_at?: string | null;
          arrived_by_name?: string | null;
          cancelled_at?: string | null;
          checked_in_at?: string | null;
          checked_in_by_name?: string | null;
          checked_out_at?: string | null;
          checked_out_by_name?: string | null;
          company?: string;
          created_at?: string;
          designation?: string;
          email?: string;
          expected_arrival?: string;
          expected_departure?: string;
          guest_card_id?: string | null;
          host_department?: string;
          host_id?: string | null;
          host_name?: string;
          id?: string;
          invitation_sent_at?: string | null;
          location?: string;
          phone?: string;
          purpose?: string;
          qr_token?: string;
          rejection_reason?: string | null;
          remarks?: string;
          request_no?: string;
          requested_by?: string;
          requested_by_name?: string;
          reviewed_at?: string | null;
          reviewed_by_name?: string | null;
          source?: string;
          status?: string;
          updated_at?: string;
          visit_date?: string;
          visitor_branch_id?: string | null;
          visitor_code?: string;
          visitor_employee_id?: string | null;
          visitor_name?: string;
          visitor_type?: string;
        };
        Relationships: [];
      };
      visitor_types: {
        Row: {
          active: boolean;
          code: string;
          label: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          code: string;
          label: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          code?: string;
          label?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      vms_locations: {
        Row: {
          active: boolean;
          id: string;
          name: string;
        };
        Insert: {
          active?: boolean;
          id?: string;
          name: string;
        };
        Update: {
          active?: boolean;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      work_permits: {
        Row: {
          additional_details: string;
          approved_at: string | null;
          approved_by_name: string | null;
          arrived_at: string | null;
          arrived_by_name: string | null;
          completed_at: string | null;
          contractor: string;
          created_at: string;
          end_date: string | null;
          id: string;
          location: string;
          permit_no: string;
          permit_type: string;
          precautions: string;
          raised_by: string;
          raised_by_name: string;
          rejected_at: string | null;
          rejected_by_name: string | null;
          rejection_reason: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by_name: string | null;
          service: string;
          start_date: string | null;
          status: string;
          supervisor_mobile: string;
          supervisor_name: string;
          time_from: string;
          time_to: string;
          vendor_email: string;
          vendor_end_date: string | null;
          vendor_id: string | null;
          vendor_name: string;
          vendor_notified_at: string | null;
          vendor_start_date: string | null;
          vendor_submitted_at: string | null;
          vendor_token: string | null;
          vendor_token_expires_at: string | null;
          work_date: string;
          work_description: string;
          worker_count: number | null;
          workmen_count: number;
        };
        Insert: {
          additional_details?: string;
          approved_at?: string | null;
          approved_by_name?: string | null;
          arrived_at?: string | null;
          arrived_by_name?: string | null;
          completed_at?: string | null;
          contractor?: string;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          location?: string;
          permit_no?: string;
          permit_type: string;
          precautions?: string;
          raised_by?: string;
          raised_by_name?: string;
          rejected_at?: string | null;
          rejected_by_name?: string | null;
          rejection_reason?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by_name?: string | null;
          service?: string;
          start_date?: string | null;
          status?: string;
          supervisor_mobile?: string;
          supervisor_name?: string;
          time_from?: string;
          time_to?: string;
          vendor_email?: string;
          vendor_end_date?: string | null;
          vendor_id?: string | null;
          vendor_name?: string;
          vendor_notified_at?: string | null;
          vendor_start_date?: string | null;
          vendor_submitted_at?: string | null;
          vendor_token?: string | null;
          vendor_token_expires_at?: string | null;
          work_date?: string;
          work_description?: string;
          worker_count?: number | null;
          workmen_count?: number;
        };
        Update: {
          additional_details?: string;
          approved_at?: string | null;
          approved_by_name?: string | null;
          arrived_at?: string | null;
          arrived_by_name?: string | null;
          completed_at?: string | null;
          contractor?: string;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          location?: string;
          permit_no?: string;
          permit_type?: string;
          precautions?: string;
          raised_by?: string;
          raised_by_name?: string;
          rejected_at?: string | null;
          rejected_by_name?: string | null;
          rejection_reason?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by_name?: string | null;
          service?: string;
          start_date?: string | null;
          status?: string;
          supervisor_mobile?: string;
          supervisor_name?: string;
          time_from?: string;
          time_to?: string;
          vendor_email?: string;
          vendor_end_date?: string | null;
          vendor_id?: string | null;
          vendor_name?: string;
          vendor_notified_at?: string | null;
          vendor_start_date?: string | null;
          vendor_submitted_at?: string | null;
          vendor_token?: string | null;
          vendor_token_expires_at?: string | null;
          work_date?: string;
          work_description?: string;
          worker_count?: number | null;
          workmen_count?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      emg_confirm_safety: {
        Args: { _incident: string; _status: string };
        Returns: {
          assistance_status: string;
          created_at: string;
          department: string;
          employee_email: string;
          employee_id: string;
          employee_name: string;
          handled_at: string | null;
          handled_by_name: string | null;
          id: string;
          incident_id: string;
          notification_status: string;
          read_at: string | null;
          response_time: string | null;
          safety_status: string;
        };
        SetofOptions: {
          from: "*";
          to: "emg_incident_employees";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      emg_mark_read: { Args: { _incident: string }; Returns: undefined };
      expire_stale_visit_requests: { Args: never; Returns: number };
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][];
          _user_id: string;
        };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "branch_manager" | "employee" | "security" | "hse" | "service_provider";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "branch_manager", "employee", "security", "hse", "service_provider"],
    },
  },
} as const;
