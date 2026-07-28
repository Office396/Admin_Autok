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
}

export interface Command {
    id: string;
    mac_address: string;
    command: 'LOCK' | 'UNLOCK' | 'DESTRUCT' | 'RECOVER' | 'STOP' | 'UNSTOP';
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
