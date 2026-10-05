// Supabase Client Configuration
import { createBrowserClient } from '@supabase/ssr';

// Use fallback values for build time (actual values loaded at runtime)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const createClient = () => createBrowserClient(supabaseUrl, supabaseAnonKey);
// Legacy export for backward compatibility relative to imports (though we should update them)
export const supabase = createClient();


// Database Types
export interface Machine {
    mac_address: string;
    pc_name: string;
    username: string;
    public_ip: string;
    last_seen: string;
    status: 'ACTIVE' | 'LOCKED' | 'DESTRUCTED';
    blocked: boolean;
    created_at: string;
    current_session_id?: string;
    // Gateway tracking columns (reported by the agent, may be absent on old rows)
    gateway_status?: string | null;
    gateway_pid?: number | null;
    background_running?: boolean | null;
    hermes_installed?: boolean | null;
    hermes_version?: string | null;
    config_migrated?: boolean | null;
    last_gateway_check?: string | null;
}

export interface GatewayDetail {
    mac_address: string;
    status: string;
    pid?: number | null;
    last_check?: string | null;
    error_message?: string | null;
    gateway_version?: string | null;
    uptime_seconds?: number | null;
    connected_platforms?: string[] | null;
    updated_at?: string | null;
}

export interface GatewayOp {
    id: string;
    mac_address: string;
    operation: string;
    status: string;
    details?: Record<string, unknown> | null;
    error_message?: string | null;
    duration_ms?: number | null;
    created_at: string;
}

export interface Command {
    id: string;
    mac_address: string;
    command: 'LOCK' | 'UNLOCK' | 'DESTRUCT' | 'RECOVER' | 'STOP' | 'UNSTOP'
        | 'START_GATEWAY' | 'STOP_GATEWAY' | 'RESTART_GATEWAY'
        | 'INSTALL_HERMES' | 'MIGRATE_CONFIG' | `SET_CREDENTIALS:${string}`;
    executed: boolean;
    created_at: string;
}

export interface ErrorLog {
    id: string;
    mac_address: string;
    error_type: string;
    message: string;
    created_at: string;
}

export interface Session {
    id: string;
    mac_address: string;
    pc_name: string;
    username: string;
    public_ip: string;
    start_time: string;
    end_time: string;
    created_at: string;
}

export interface SoftwareEnabled {
    mac_address: string;
    enabled: boolean;
    updated_at: string;
    created_at: string;
}
