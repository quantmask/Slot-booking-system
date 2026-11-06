export interface HostModel {
  id: string;
  slug: string;
  email: string;
  password_hash: string;
  timezone: string;
  created_at: Date;
}

export interface EventTypeModel {
  id: string;
  host_id: string;
  slug: string;
  name: string;
  duration_min: number;
  capacity: number;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_hours: number;
  horizon_days: number;
  archived_at: Date | null;
}

export interface SessionModel {
  id: string;
  host_id: string;
  event_type_id: string;
  start_at: Date;
  end_at: Date;
  blocked_range: string;
  capacity: number;
  status: 'active' | 'released';
}

export interface BookingModel {
  id: string;
  session_id: string;
  status: 'held' | 'confirmed' | 'cancelled' | 'expired';
  hold_expires_at: Date | null;
  guest_name: string | null;
  guest_email: string | null;
  token_hash: string | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationModel {
  id: string;
  type: string;
  payload: any;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  next_attempt_at: Date;
  delivered_at: Date | null;
  created_at: Date;
}

