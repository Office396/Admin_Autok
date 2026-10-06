'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient, Machine, Command, ErrorLog, Session, SoftwareEnabled, GatewayDetail, GatewayOp } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [commands, setCommands] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [showErrors, setShowErrors] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'gateway' | 'locked' | 'history' | 'credentials'>('live');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessions, setCurrentSessions] = useState<Record<string, Session>>({});
  const [gatewayDetails, setGatewayDetails] = useState<Record<string, GatewayDetail>>({});
  const [gatewayOps, setGatewayOps] = useState<Record<string, GatewayOp[]>>({});
  const [opsOpen, setOpsOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [softwareEnabled, setSoftwareEnabled] = useState<Record<string, boolean>>({});
  const logContainerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    fetchData();
    
    // Fetch sessions when switching to history tab
    if (activeTab === 'history') {
      fetchSessions();
    }

    // 1. Subscribe to machine updates (Realtime)
    const machineChannel = supabase
      .channel('machines-realtime')
      .on('postgres_changes', { event: '*', table: 'machines', schema: 'public' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMachines(prev => {
            const exists = prev.find(m => m.mac_address === payload.new.mac_address);
            if (exists) {
              return prev.map(m => m.mac_address === payload.new.mac_address ? payload.new as Machine : m);
            }
            return [payload.new as Machine, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          setMachines(prev => prev.map(m => m.mac_address === payload.new.mac_address ? payload.new as Machine : m));
        } else if (payload.eventType === 'DELETE') {
          setMachines(prev => prev.filter(m => m.mac_address !== payload.old.mac_address));
        }
      })
      .subscribe();

    // 2. Subscribe to command updates
    const commandChannel = supabase
      .channel('commands-realtime')
      .on('postgres_changes', { event: '*', table: 'commands', schema: 'public' }, () => {
        fetchCommands();
      })
      .subscribe();

    // 3. Subscribe to session updates for history tab
    const sessionChannel = supabase
      .channel('sessions-realtime')
      .on('postgres_changes', { event: '*', table: 'sessions', schema: 'public' }, () => {
        if (activeTab === 'history') {
          fetchSessions();
        }
      })
      .subscribe();

    // 4. Subscribe to software_enabled updates for stop/unstop feature
    const softwareEnabledChannel = supabase
      .channel('software-enabled-realtime')
      .on('postgres_changes', { event: '*', table: 'software_enabled', schema: 'public' }, () => {
        fetchSoftwareEnabled();
        fetchGlobalSoftwareEnabled();
      })
      .subscribe();

    // 5. Subscribe to gateway_status updates (detail rows for the Gateway tab)
    const gatewayChannel = supabase
      .channel('gateway-status-realtime')
      .on('postgres_changes', { event: '*', table: 'gateway_status', schema: 'public' }, () => {
        if (activeTab === 'gateway') {
          fetchGatewayDetails();
        }
      })
      .subscribe();

    // Fetch global software enabled status
    fetchGlobalSoftwareEnabled();

    // Load gateway details when the Gateway tab is opened
    if (activeTab === 'gateway') {
      fetchGatewayDetails();
    }

    // Removed auto-disappear watchdog - machines stay visible until manually removed

    return () => {
      supabase.removeChannel(machineChannel);
      supabase.removeChannel(commandChannel);
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(softwareEnabledChannel);
      supabase.removeChannel(gatewayChannel);
    };
  }, [activeTab]);

  // On-demand logs - fetch only when button clicked, no real-time
  // Logs are fetched on-demand (not real-time) to avoid quota issues

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [errors]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function fetchCommands() {
    const { data: commandsData } = await supabase
      .from('commands')
      .select('*')
      .eq('executed', false);

    const cmdMap: Record<string, string> = {};
    commandsData?.forEach(cmd => {
      cmdMap[cmd.mac_address] = cmd.command;
    });
    setCommands(cmdMap);
  }

  async function fetchData() {
    try {
      setLoading(true);
      // Fetch machines
      const { data: machinesData } = await supabase
        .from('machines')
        .select('*')
        .order('last_seen', { ascending: false });

      setMachines(machinesData || []);
      
      // Fetch current sessions for each machine
      if (machinesData) {
        const sessionIds = machinesData
          .map(m => m.current_session_id)
          .filter(Boolean);
        
        if (sessionIds.length > 0) {
          const { data: sessionsData } = await supabase
            .from('sessions')
            .select('*')
            .in('id', sessionIds);
          
          const sessionMap: Record<string, Session> = {};
          sessionsData?.forEach(session => {
            sessionMap[session.mac_address] = session;
          });
          setCurrentSessions(sessionMap);
        }
      }
      
      await fetchCommands();
      await fetchSoftwareEnabled();
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function clearOldLogs(macAddress: string) {
    try {
      // Delete all logs for this machine
      await supabase.from('error_logs')
        .delete()
        .eq('mac_address', macAddress);
      
      // Clear the errors state
      setErrors([]);
      
      alert('Old logs cleared! New logs will show correct time.');
    } catch (error) {
      console.error('Error clearing logs:', error);
      alert('Failed to clear logs');
    }
  }

  async function clearStuckCommands(macAddress: string) {
    try {
      // Delete all pending commands for this machine
      await supabase.from('commands')
        .delete()
        .eq('mac_address', macAddress)
        .eq('executed', false);
      
      // Refresh commands
      await fetchCommands();
      
      alert('Stuck commands cleared!');
    } catch (error) {
      console.error('Error clearing commands:', error);
      alert('Failed to clear commands');
    }
  }

  async function sendCommand(macAddress: string, command: string) {
    try {
      const machine = machines.find(m => m.mac_address === macAddress);
      
      // First, delete any existing pending commands for this machine to avoid conflicts
      await supabase.from('commands')
        .delete()
        .eq('mac_address', macAddress)
        .eq('executed', false);
      
      // Insert new command
      await supabase.from('commands').insert({
        mac_address: macAddress,
        command: command,
        executed: false,
      });

      // Optimistic updates for immediate feedback (only for DESTRUCT/RECOVER)
      if (command === 'DESTRUCT') {
        setMachines(prev => prev.map(m => m.mac_address === macAddress ? { ...m, blocked: true, status: 'DESTRUCTED' } : m));
        // Update machine record and block by IP to prevent reinstallation
        await supabase.from('machines').update({ 
          blocked: true, 
          status: 'DESTRUCTED' 
        }).eq('mac_address', macAddress);
        
        // Also create a blocked entry for the IP address to prevent reinstall
        if (machine?.public_ip) {
          await supabase.from('machines').upsert({
            mac_address: `BLOCKED_IP_${machine.public_ip}`,
            pc_name: `BLOCKED_${machine.pc_name}`,
            username: machine.username,
            public_ip: machine.public_ip,
            last_seen: new Date().toISOString(),
            status: 'DESTRUCTED',
            blocked: true,
          });
        }
      }
      if (command === 'RECOVER') {
        setMachines(prev => prev.map(m => m.mac_address === macAddress ? { ...m, blocked: false, status: 'ACTIVE' } : m));
        await supabase.from('machines').update({ blocked: false, status: 'ACTIVE' }).eq('mac_address', macAddress);
        
        // Remove IP block if exists
        if (machine?.public_ip) {
          await supabase.from('machines').delete().eq('mac_address', `BLOCKED_IP_${machine.public_ip}`);
        }
      }
      // For LOCK/UNLOCK, let the software update the status after executing the command
      // This prevents the "PENDING" status from getting stuck
    } catch (error) {
      console.error('Error sending command:', error);
      alert('Failed to send command');
    }
  }

  async function fetchErrors(macAddress: string) {
    setShowErrors(macAddress);
    // Fetch last 10 logs (on-demand, not real-time)
    const { data } = await supabase
      .from('error_logs')
      .select('*')
      .eq('mac_address', macAddress)
      .order('created_at', { ascending: false })
      .limit(10);
    
    // Reverse to show oldest first, newest last
    setErrors((data || []).reverse());
  }

  async function fetchSessions() {
    try {
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .order('start_time', { ascending: false })
        .limit(100);
      setSessions(data || []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  }

  // Gateway: detailed rows from gateway_status (version, platforms, errors)
  async function fetchGatewayDetails() {
    try {
      const { data } = await supabase
        .from('gateway_status')
        .select('*');
      const detailMap: Record<string, GatewayDetail> = {};
      data?.forEach(row => {
        detailMap[row.mac_address] = row as GatewayDetail;
      });
      setGatewayDetails(detailMap);
    } catch (error) {
      console.error('Error fetching gateway details:', error);
    }
  }

  // Gateway: recent operations for one machine (audit trail)
  async function fetchGatewayOps(macAddress: string) {
    if (opsOpen === macAddress) {
      setOpsOpen(null);
      return;
    }
    setOpsOpen(macAddress);
    try {
      const { data } = await supabase
        .from('hermes_operations_log')
        .select('*')
        .eq('mac_address', macAddress)
        .order('created_at', { ascending: false })
        .limit(8);
      setGatewayOps(prev => ({ ...prev, [macAddress]: (data || []) as GatewayOp[] }));
    } catch (error) {
      console.error('Error fetching gateway ops:', error);
    }
  }

  function getGatewayState(machine: Machine): 'running' | 'error' | 'starting' | 'stopped' | 'not-installed' | 'unknown' {
    if (machine.hermes_installed === false) return 'not-installed';
    const s = (machine.gateway_status || 'unknown').toLowerCase();
    if (s === 'running') return 'running';
    if (s === 'error') return 'error';
    if (s === 'starting' || s === 'installing' || s === 'migrating') return 'starting';
    if (s === 'stopping') return 'stopped';
    if (s === 'stopped') return 'stopped';
    return 'unknown';
  }

  function gatewaySort(a: Machine, b: Machine) {
    const rank = (m: Machine) => {
      const st = getGatewayState(m);
      if (st === 'running') return 0;
      if (st === 'error') return 1;
      if (st === 'starting') return 2;
      if (st === 'stopped') return 3;
      if (st === 'not-installed') return 4;
      return 5;
    };
    return rank(a) - rank(b);
  }

  // NEW: Global software enabled status (for all machines)
  const [globalSoftwareEnabled, setGlobalSoftwareEnabled] = useState<boolean | null>(null);

  // NEW: Fetch global software enabled status
  async function fetchGlobalSoftwareEnabled() {
    try {
      // Check if there's a global "all" record
      const { data } = await supabase
        .from('software_enabled')
        .select('*')
        .eq('mac_address', 'GLOBAL_ALL')
        .single();
      
      if (data) {
        setGlobalSoftwareEnabled(data.enabled);
      } else {
        setGlobalSoftwareEnabled(true); // Default to enabled
      }
    } catch (error) {
      setGlobalSoftwareEnabled(true);
    }
  }

  // NEW: Toggle global software stop/unstop
  async function toggleGlobalSoftwareEnabled() {
    const currentEnabled = globalSoftwareEnabled !== false;
    const newEnabled = !currentEnabled;
    
    const action = newEnabled ? 'UNSTOP' : 'STOP';
    if (!confirm(`Are you sure you want to ${action} ALL software globally?\n\nThis will affect ALL computers (running and future).`)) {
      return;
    }

    try {
      await supabase.from('software_enabled').upsert({
        mac_address: 'GLOBAL_ALL',
        enabled: newEnabled,
      });
      
      setGlobalSoftwareEnabled(newEnabled);
      alert(`✅ All software ${newEnabled ? 'enabled' : 'disabled'} globally!`);
      
      // Refresh data
      fetchData();
    } catch (error) {
      console.error('Error toggling global software:', error);
      alert('❌ Failed to toggle global software');
    }
  }
  async function fetchSoftwareEnabled() {
    try {
      const { data } = await supabase
        .from('software_enabled')
        .select('*');
      
      const enabledMap: Record<string, boolean> = {};
      data?.forEach(item => {
        enabledMap[item.mac_address] = item.enabled;
      });
      setSoftwareEnabled(enabledMap);
    } catch (error) {
      console.error('Error fetching software enabled status:', error);
    }
  }

  // NEW: Toggle software stop/unstop
  async function toggleSoftwareEnabled(macAddress: string) {
    const currentEnabled = softwareEnabled[macAddress] !== false; // Default to true
    const newEnabled = !currentEnabled;
    
    const action = newEnabled ? 'UNSTOP' : 'STOP';
    if (!confirm(`Are you sure you want to ${action} the software on this machine?`)) {
      return;
    }

    try {
      await supabase.from('software_enabled').upsert({
        mac_address: macAddress,
        enabled: newEnabled,
      });
      
      setSoftwareEnabled(prev => ({ ...prev, [macAddress]: newEnabled }));
      alert(`✅ Software ${newEnabled ? 'enabled' : 'disabled'} successfully!`);
      
      // Refresh data
      fetchData();
    } catch (error) {
      console.error('Error toggling software:', error);
      alert('❌ Failed to toggle software');
    }
  }

  // NEW: Change terminal credentials remotely
  async function changeTerminalCredentials(macAddress: string) {
    const newUsername = prompt('Enter new username:');
    if (!newUsername) return;
    
    const newPassword = prompt('Enter new password:');
    if (!newPassword) return;
    
    if (confirm(`Change credentials for this machine to:\nUsername: ${newUsername}\nPassword: ${newPassword}`)) {
      try {
        await supabase.from('commands').insert({
          mac_address: macAddress,
          command: `SET_CREDENTIALS:${newUsername}:${newPassword}`,
          executed: false,
        });
        alert('✅ Credentials change command sent! The machine will update on next check.');
      } catch (error) {
        console.error('Error sending credentials command:', error);
        alert('❌ Failed to send command');
      }
    }
  }

  // NEW: Global credentials management
  const [globalUsername, setGlobalUsername] = useState('');
  const [globalPassword, setGlobalPassword] = useState('');
  const [currentUsername, setCurrentUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function fetchGlobalCredentials() {
    try {
      const { data, error } = await supabase
        .from('global_credentials')
        .select('*')
        .eq('credential_type', 'terminal_login')
        .single();
      
      if (data) {
        // Set both current and new fields with current credentials
        setCurrentUsername(data.username);
        setCurrentPassword(data.password);
        setGlobalUsername(data.username);
        setGlobalPassword(data.password);
      } else {
        // Set defaults if not found
        setCurrentUsername('admin');
        setCurrentPassword('admin123');
        setGlobalUsername('admin');
        setGlobalPassword('admin123');
      }
    } catch (error) {
      console.error('Error fetching global credentials:', error);
      // Set defaults on error
      setCurrentUsername('admin');
      setCurrentPassword('admin123');
      setGlobalUsername('admin');
      setGlobalPassword('admin123');
    }
  }

  async function updateGlobalCredentials() {
    if (!currentPassword) {
      alert('⚠️ Please enter current password');
      return;
    }

    if (!globalUsername || !globalPassword) {
      alert('⚠️ Username and password cannot be empty');
      return;
    }

    // Verify current password matches
    try {
      const { data } = await supabase
        .from('global_credentials')
        .select('password')
        .eq('credential_type', 'terminal_login')
        .single();
      
      if (data && currentPassword !== data.password) {
        alert('❌ Current password is incorrect');
        return;
      }
    } catch (error) {
      console.error('Error verifying password:', error);
    }

    if (confirm(`Update global credentials?\n\nNew Username: ${globalUsername}\nNew Password: ${globalPassword}\n\n⚠️ This will affect ALL terminals!`)) {
      try {
        await supabase
          .from('global_credentials')
          .update({
            username: globalUsername,
            password: globalPassword
          })
          .eq('credential_type', 'terminal_login');
        
        alert('✅ Global credentials updated successfully!\n\nAll terminals will use these credentials on next login.');
        fetchGlobalCredentials(); // Refresh to show new values
      } catch (error) {
        console.error('Error updating credentials:', error);
        alert('❌ Failed to update credentials');
      }
    }
  }

  // Fetch global credentials when switching to credentials tab.
  // NOTE: no auto-refresh interval here on purpose - polling would wipe
  // whatever the admin is currently typing into the new-username/password
  // fields. Refresh happens on tab open and via the Reset button.
  useEffect(() => {
    if (activeTab === 'credentials') {
      fetchGlobalCredentials();
    }
  }, [activeTab]);

  // Remove a stale OFFLINE machine entirely (row + switch state).
  // Only offered for offline machines: online ones are managed live.
  async function removeMachine(macAddress: string, pcName: string) {
    if (!confirm(`Remove ${pcName} from the system?\n\nDeletes its machine record, pending commands and switch state. History rows that reference it are removed too. This cannot be undone.`)) {
      return;
    }
    if (!confirm(`Really remove ${pcName}? Double-check this is a stale duplicate, not a live machine.`)) {
      return;
    }
    try {
      // Order matters: child rows first where no cascade exists.
      await supabase.from('software_enabled').delete().eq('mac_address', macAddress);
      await supabase.from('commands').delete().eq('mac_address', macAddress);
      const { error } = await supabase.from('machines').delete().eq('mac_address', macAddress);
      if (error) throw error;
      setMachines(prev => prev.filter(m => m.mac_address !== macAddress));
      alert(`✅ ${pcName} removed.`);
      fetchData();
    } catch (error) {
      console.error('Error removing machine:', error);
      alert('❌ Failed to remove machine (it may have come back online - refresh and retry).');
    }
  }

  // NEW: Delete single session
  async function deleteSession(sessionId: string) {
    if (confirm('Delete this session from history?')) {
      try {
        await supabase.from('sessions').delete().eq('id', sessionId);
        fetchSessions();
        alert('✅ Session deleted');
      } catch (error) {
        console.error('Error deleting session:', error);
        alert('❌ Failed to delete session');
      }
    }
  }

  // NEW: Delete selected sessions
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  
  async function deleteSelectedSessions() {
    if (selectedSessions.length === 0) {
      alert('No sessions selected');
      return;
    }
    
    if (confirm(`Delete ${selectedSessions.length} selected session(s)?`)) {
      try {
        await supabase.from('sessions').delete().in('id', selectedSessions);
        setSelectedSessions([]);
        fetchSessions();
        alert(`✅ ${selectedSessions.length} session(s) deleted`);
      } catch (error) {
        console.error('Error deleting sessions:', error);
        alert('❌ Failed to delete sessions');
      }
    }
  }

  // NEW: Clear all history
  async function clearAllHistory() {
    if (confirm('⚠️ WARNING: This will permanently delete ALL session history from the database. This action cannot be undone. Continue?')) {
      if (confirm('Are you absolutely sure? This will delete ALL history records.')) {
        try {
          // Delete all sessions (except dummy ones if any)
          const { error } = await supabase
            .from('sessions')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
          
          if (error) throw error;
          
          setSessions([]);
          setSelectedSessions([]);
          alert('✅ All history cleared successfully!');
        } catch (error) {
          console.error('Error clearing history:', error);
          alert('❌ Failed to clear history');
        }
      }
    }
  }

  // NEW: Toggle session selection
  function toggleSessionSelection(sessionId: string) {
    setSelectedSessions(prev => {
      if (prev.includes(sessionId)) {
        return prev.filter(id => id !== sessionId);
      } else {
        return [...prev, sessionId];
      }
    });
  }

  // NEW: Select all sessions
  function selectAllSessions() {
    if (selectedSessions.length === sessions.length) {
      setSelectedSessions([]);
    } else {
      setSelectedSessions(sessions.map(s => s.id));
    }
  }

  function formatDuration(start: string, end: string) {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const diff = Math.floor((e - s) / 1000);

    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  }

  function isOnline(machine: Machine) {
    if (!machine.last_seen) return false;
    const diff = Date.now() - new Date(machine.last_seen).getTime();
    return diff < 30000; // 30 second threshold (software reports every 5 seconds)
  }

  function getStatusColor(machine: Machine) {
    if (!isOnline(machine)) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    if (machine.blocked) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (machine.status === 'LOCKED') return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (machine.status === 'DESTRUCTED') return 'bg-red-900/40 text-red-500 border-red-700/50';
    return 'bg-green-500/20 text-green-400 border-green-500/30';
  }

  function getStatusIndicator(machine: Machine) {
    if (!isOnline(machine)) return 'bg-gray-600';
    if (machine.blocked || machine.status === 'DESTRUCTED') return 'bg-red-500';
    if (machine.status === 'LOCKED') return 'bg-orange-500';
    return 'bg-green-500';
  }

  function getStatusText(machine: Machine, pendingCmd?: string) {
    if (pendingCmd) return `⏳ PENDING: ${pendingCmd}`;
    if (!isOnline(machine)) return 'OFFLINE';
    if (machine.blocked) return 'BLOCKED';
    return machine.status;
  }

  function getRunningTime(dateStr: string) {
    if (!dateStr) return 'Unknown';
    
    try {
      const now = Date.now();
      const timestamp = new Date(dateStr).getTime();
      
      // If timestamp is invalid or in the future, return error message
      if (isNaN(timestamp) || timestamp > now) {
        return 'Just now';
      }
      
      const seconds = Math.floor((now - timestamp) / 1000);
      
      // Handle negative or very small values
      if (seconds < 0 || seconds < 10) return 'Just now';
      if (seconds < 60) return `${seconds}s ago`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
      return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ago`;
    } catch (error) {
      return 'Unknown';
    }
  }

  function getSessionStartTime(machine: Machine) {
    const session = currentSessions[machine.mac_address];
    if (session && session.start_time) {
      return session.start_time;
    }
    // Fallback to machine created_at if no session
    return machine.created_at;
  }

  function formatLogTime(dateStr: string) {
    if (!dateStr) return 'Unknown';
    
    try {
      // Parse the date string - it might be in ISO format with or without timezone
      const date = new Date(dateStr);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid time';
      }
      
      // Get current date to check if log is from today
      const now = new Date();
      const isToday = date.getDate() === now.getDate() && 
                      date.getMonth() === now.getMonth() && 
                      date.getFullYear() === now.getFullYear();
      
      // Format: HH:MM:SS (using local timezone)
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      
      // If not today, also show date
      if (!isToday) {
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${month}/${day} ${hours}:${minutes}:${seconds}`;
      }
      
      return `${hours}:${minutes}:${seconds}`;
    } catch (error) {
      return 'Unknown';
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden font-sans">
      {/* Ambient Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px] animate-pulse-slow" style={{ animationDelay: '1.5s' }}></div>
      </div>

      {/* Header */}
      <header className="relative z-20 bg-gray-900/30 backdrop-blur-md border-b border-gray-800/50 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                Security Command
              </h1>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <p className="text-gray-400 text-xs tracking-wider font-semibold">SYSTEM ACTIVE</p>
              </div>
            </div>

            <nav className="flex items-center gap-1 bg-gray-900/50 p-1 rounded-xl border border-gray-800 ml-8">
              <button
                onClick={() => setActiveTab('live')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'live' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                📡 Live
              </button>
              <button
                onClick={() => setActiveTab('gateway')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'gateway' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                🔌 Gateway
              </button>
              <button
                onClick={() => setActiveTab('locked')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'locked' ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                🔒 Locked/Destructed
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                ⏳ History
              </button>
              <button
                onClick={() => setActiveTab('credentials')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'credentials' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                🔑 Credentials
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Global STOP/UNSTOP Button */}
            <button
              onClick={toggleGlobalSoftwareEnabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                globalSoftwareEnabled !== false
                  ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-900/50 hover:border-red-500'
                  : 'bg-green-500/10 hover:bg-green-500/20 text-green-500 border-green-900/50 hover:border-green-500'
              }`}
              title={globalSoftwareEnabled !== false ? 'STOP all software globally' : 'UNSTOP all software globally'}
            >
              {globalSoftwareEnabled !== false ? '⏹️ STOP ALL' : '▶️ UNSTOP ALL'}
            </button>
            <button
              onClick={fetchData}
              className="p-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all active:scale-95 group"
              title="Refresh Data"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
            <div className="h-6 w-px bg-gray-800 hidden md:block"></div>
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-semibold px-4 py-2 rounded-xl transition-all border border-red-500/20 hover:border-red-500/40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              Logout
            </button>
            {/* Mobile Logout Icon Only */}
            <button onClick={handleLogout} className="md:hidden p-2.5 text-red-400 hover:bg-red-500/10 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'live' ? (
          // Live Tab: Show only online machines that are NOT locked/blocked/destructed
          machines.filter(m => isOnline(m) && !m.blocked && m.status !== 'DESTRUCTED' && m.status !== 'LOCKED').length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-24 h-24 bg-gray-800/50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-10 h-10 text-gray-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No active agents found</h3>
              <p className="text-gray-400 max-w-sm mx-auto">
                Running valid software agents will automatically appear here once connected.
              </p>
            </div>
          ) : (
            <div className="grid gap-6">
              {machines.filter(m => isOnline(m) && !m.blocked && m.status !== 'DESTRUCTED' && m.status !== 'LOCKED').map((machine) => (
                <div
                  key={machine.mac_address}
                  className="group relative bg-gray-900/40 backdrop-blur-xl border border-gray-800 hover:border-blue-500/30 rounded-2xl p-6 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-900/10 overflow-hidden"
                >
                  <div className="absolute inset-0 -translate-x-full group-hover:animate-shine bg-gradient-to-r from-transparent via-white/5 to-transparent z-0 pointer-events-none" />
                  <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex items-start gap-4">
                      <div className="relative">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getStatusIndicator(machine)} bg-opacity-10 mb-2`}>
                          {machine.status === 'LOCKED' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-6 h-6 ${machine.status === 'LOCKED' ? 'text-orange-500' : 'text-green-500'}`}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-6 h-6 ${machine.blocked ? 'text-red-500' : 'text-green-500'}`}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                            </svg>
                          )}
                        </div>
                        {!machine.blocked && <div className={`absolute top-0 right-0 w-3 h-3 ${getStatusIndicator(machine)} rounded-full ring-2 ring-gray-900`}></div>}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-lg font-bold text-white tracking-tight">
                            {machine.pc_name}
                          </h2>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider border ${getStatusColor(machine)}`}>
                            {getStatusText(machine, commands[machine.mac_address])}
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-600">👤</span> {machine.username}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-600">🌐</span> {machine.public_ip}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-600">🕒</span> Running for {getRunningTime(getSessionStartTime(machine))}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-600">📅</span> Started {new Date(getSessionStartTime(machine)).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="bg-gray-800/50 rounded-xl p-1 flex items-center border border-gray-700">
                        {machine.status === 'LOCKED' ? (
                          <button
                            onClick={() => sendCommand(machine.mac_address, 'UNLOCK')}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                          >
                            🔓 UNLOCK
                          </button>
                        ) : (
                          <button
                            onClick={() => sendCommand(machine.mac_address, 'LOCK')}
                            disabled={machine.blocked}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${machine.blocked ? 'opacity-50 cursor-not-allowed bg-transparent' : 'bg-gradient-to-r from-orange-600 to-red-600 hover:shadow-lg hover:shadow-orange-900/40 text-white'}`}
                          >
                            🔒 LOCK
                          </button>
                        )}
                      </div>
                      {/* STOP/UNSTOP Button */}
                      <button
                        onClick={() => toggleSoftwareEnabled(machine.mac_address)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                          softwareEnabled[machine.mac_address] !== false
                            ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-900/50 hover:border-red-500'
                            : 'bg-green-500/10 hover:bg-green-500/20 text-green-500 border-green-900/50 hover:border-green-500'
                        }`}
                        title={softwareEnabled[machine.mac_address] !== false ? 'Stop software permanently' : 'Unstop software'}
                      >
                        {softwareEnabled[machine.mac_address] !== false ? '⏹️ STOP' : '▶️ UNSTOP'}
                      </button>
                      {/* Show Clear Pending button if there's a pending command */}
                      {commands[machine.mac_address] && (
                        <button
                          onClick={() => clearStuckCommands(machine.mac_address)}
                          className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-900/50 hover:border-yellow-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                          title="Clear stuck pending command"
                        >
                          🔄 Clear Pending
                        </button>
                      )}
                      {!machine.blocked && (
                        <>
                          <button
                            onClick={() => changeTerminalCredentials(machine.mac_address)}
                            className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-900/50 hover:border-blue-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                            title="Change terminal login credentials"
                          >
                            🔑 Credentials
                          </button>
                          <button
                            onClick={() => sendCommand(machine.mac_address, 'START_GATEWAY')}
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-900/50 hover:border-emerald-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                            title="Start gateway on this machine (skipped if already running)"
                          >
                            ▶ Start Gateway
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('⚠️ WARNING: This will PERMANENTLY destroy the software on this machine. Are you sure?')) {
                                sendCommand(machine.mac_address, 'DESTRUCT');
                              }
                            }}
                            className="bg-red-500/10 hover:bg-destructive text-red-500 hover:text-red-100 border border-red-900/50 hover:border-red-500 hover:bg-red-600 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                          >
                            💣 DESTRUCT
                          </button>
                        </>
                      )}
                      {machine.blocked && (
                        <button
                          onClick={() => sendCommand(machine.mac_address, 'RECOVER')}
                          className="bg-green-500/10 hover:bg-green-600 text-green-500 hover:text-white border border-green-900/50 hover:border-green-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                        >
                          ♻️ RECOVER
                        </button>
                      )}
                      <button
                        onClick={() => fetchErrors(machine.mac_address)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-xl p-2.5 transition-all"
                        title="View Logs"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeTab === 'locked' ? (
          // Locked/Destructed Tab: Show machines that are locked, blocked, or destructed
          machines.filter(m => m.blocked || m.status === 'DESTRUCTED' || m.status === 'LOCKED').length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-24 h-24 bg-gray-800/50 rounded-full flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-10 h-10 text-gray-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No locked or destructed machines</h3>
              <p className="text-gray-400 max-w-sm mx-auto">
                Machines that are locked or destructed will appear here.
              </p>
            </div>
          ) : (
            <div className="grid gap-6">
              {machines.filter(m => m.blocked || m.status === 'DESTRUCTED' || m.status === 'LOCKED').map((machine) => (
                <div
                  key={machine.mac_address}
                  className="group relative bg-gray-900/40 backdrop-blur-xl border border-gray-800 hover:border-orange-500/30 rounded-2xl p-6 transition-all duration-300 hover:shadow-2xl hover:shadow-orange-900/10 overflow-hidden"
                >
                  <div className="absolute inset-0 -translate-x-full group-hover:animate-shine bg-gradient-to-r from-transparent via-white/5 to-transparent z-0 pointer-events-none" />
                  <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex items-start gap-4">
                      <div className="relative">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getStatusIndicator(machine)} bg-opacity-10 mb-2`}>
                          {machine.status === 'DESTRUCTED' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-red-500">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                          ) : machine.status === 'LOCKED' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-orange-500">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-red-500">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-lg font-bold text-white tracking-tight">
                            {machine.pc_name}
                          </h2>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider border ${getStatusColor(machine)}`}>
                            {getStatusText(machine, commands[machine.mac_address])}
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-600">👤</span> {machine.username}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-600">🌐</span> {machine.public_ip}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-600">🕒</span> Last seen {getRunningTime(machine.last_seen)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {/* Show Clear Pending button if there's a pending command */}
                        {commands[machine.mac_address] && (
                          <button
                            onClick={() => clearStuckCommands(machine.mac_address)}
                            className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-900/50 hover:border-yellow-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                            title="Clear stuck pending command"
                          >
                            🔄 Clear Pending
                          </button>
                        )}
                        {machine.status === 'LOCKED' && (
                          <button
                            onClick={() => sendCommand(machine.mac_address, 'UNLOCK')}
                            className="bg-green-500/10 hover:bg-green-600 text-green-500 hover:text-white border border-green-900/50 hover:border-green-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                          >
                            🔓 UNLOCK
                          </button>
                        )}
                        {(machine.blocked || machine.status === 'DESTRUCTED') && (
                          <button
                            onClick={() => sendCommand(machine.mac_address, 'RECOVER')}
                            className="bg-green-500/10 hover:bg-green-600 text-green-500 hover:text-white border border-green-900/50 hover:border-green-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                          >
                            ♻️ RECOVER
                          </button>
                        )}
                      <button
                        onClick={() => fetchErrors(machine.mac_address)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-xl p-2.5 transition-all"
                        title="View Logs"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeTab === 'history' ? (
          <div className="bg-gray-900/40 backdrop-blur-xl border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* History Controls */}
            <div className="p-4 border-b border-gray-800 bg-gray-900/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedSessions.length === sessions.length && sessions.length > 0}
                  onChange={selectAllSessions}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-gray-400">
                  {selectedSessions.length > 0 ? `${selectedSessions.length} selected` : 'Select all'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedSessions.length > 0 && (
                  <button
                    onClick={deleteSelectedSessions}
                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-900/50 hover:border-red-500 rounded-xl text-sm font-semibold transition-all"
                  >
                    🗑️ Delete Selected ({selectedSessions.length})
                  </button>
                )}
                <button
                  onClick={clearAllHistory}
                  className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-900/50 hover:border-red-500 rounded-xl text-sm font-semibold transition-all"
                >
                  🗑️ Clear All History
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-900/60 border-b border-gray-800">
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest w-12"></th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">PC Name</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">User / IP</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Start Time</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">End Time</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Duration</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">No session history found.</td>
                    </tr>
                  ) : (
                    sessions.map((session) => (
                      <tr key={session.id} className="hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedSessions.includes(session.id)}
                            onChange={() => toggleSessionSelection(session.id)}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-white group-hover:text-blue-400 transition-colors">{session.pc_name}</div>
                          <div className="text-[10px] text-gray-600 font-mono mt-0.5">{session.mac_address}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-300 text-sm">{session.username}</div>
                          <div className="text-gray-500 text-xs">{session.public_ip}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400 font-mono">{new Date(session.start_time).toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-gray-400 font-mono">{session.end_time ? new Date(session.end_time).toLocaleString() : '---'}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-xs font-bold border border-blue-500/20">
                            {session.end_time ? formatDuration(session.start_time, session.end_time) : 'Active...'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => deleteSession(session.id)}
                            className="text-red-500 hover:text-red-400 transition-colors p-2 hover:bg-red-500/10 rounded-lg"
                            title="Delete this session"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === 'gateway' && (
          <div className="grid gap-6">
            <div className="flex items-center justify-between">
              <p className="text-gray-400 text-sm">
                Gateway runs on the machines below. Start it where Autok is online, stop it where it should not run. Commands deliver in seconds.
              </p>
              <button
                onClick={fetchGatewayDetails}
                className="p-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all active:scale-95"
                title="Refresh gateway details"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            </div>
            {[...machines].sort(gatewaySort).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <h3 className="text-xl font-semibold text-white mb-2">No machines reporting yet</h3>
                <p className="text-gray-400 max-w-sm mx-auto">
                  Machines appear here automatically once Autok reports gateway status.
                </p>
              </div>
            ) : (
              [...machines].sort(gatewaySort).map((machine) => {
                const gw = getGatewayState(machine);
                const detail = gatewayDetails[machine.mac_address];
                const pending = commands[machine.mac_address];
                const ops = gatewayOps[machine.mac_address] || [];
                const badge = gw === 'running'
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : gw === 'error'
                    ? 'bg-red-500/20 text-red-400 border-red-500/30'
                    : gw === 'starting'
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      : gw === 'not-installed'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        : 'bg-gray-500/20 text-gray-400 border-gray-500/30';
                const badgeText = gw === 'running'
                  ? `● RUNNING${machine.gateway_pid ? ` (PID ${machine.gateway_pid})` : ''}`
                  : gw === 'error' ? '● ERROR'
                    : gw === 'starting' ? '● STARTING'
                      : gw === 'stopped' ? '○ STOPPED'
                        : gw === 'not-installed' ? '○ NOT INSTALLED'
                          : '○ UNKNOWN';
                return (
                  <div
                    key={machine.mac_address}
                    className="group relative bg-gray-900/40 backdrop-blur-xl border border-gray-800 hover:border-emerald-500/30 rounded-2xl p-6 transition-all duration-300 overflow-hidden"
                  >
                    <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      <div className="flex items-start gap-4">
                        <div>
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <h2 className="text-lg font-bold text-white tracking-tight">
                              {machine.pc_name}
                            </h2>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider border ${badge}`}>
                              {pending ? `⏳ PENDING: ${pending}` : badgeText}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider border ${isOnline(machine) ? 'bg-green-500/10 text-green-500 border-green-900/50' : 'bg-gray-500/10 text-gray-500 border-gray-800'}`}>
                              {isOnline(machine) ? 'Agent online' : 'Agent offline'}
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm text-gray-400">
                            <div className="flex items-center gap-1.5">
                              <span className="text-gray-600">👤</span> {machine.username}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-gray-600">🌐</span> {machine.public_ip}
                            </div>
                            {machine.hermes_version && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-600">🧩</span> v{machine.hermes_version}
                              </div>
                            )}
                            {machine.config_migrated && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-600">✅</span> Config migrated
                              </div>
                            )}
                            {detail?.connected_platforms && detail.connected_platforms.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-600">🔗</span> {detail.connected_platforms.join(', ')}
                              </div>
                            )}
                            {detail?.error_message && (
                              <div className="flex items-center gap-1.5 text-red-400">
                                <span>⚠️</span> {detail.error_message.slice(0, 120)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {machine.hermes_installed === false && (
                          <button
                            onClick={() => {
                              if (confirm(`Install the core engine on ${machine.pc_name}?\n\nDownloads and sets everything up silently in the background (can take ~10-20 minutes on slow networks). Watch live progress under Ops. Only the service is affected - Autok and automation keep running.`)) {
                                sendCommand(machine.mac_address, 'INSTALL_HERMES');
                              }
                            }}
                            className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-900/50 hover:border-blue-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                            title="Install the core engine on this machine"
                          >
                            ⬇️ Install
                          </button>
                        )}
                        {machine.hermes_installed !== false && !machine.config_migrated && (
                          <button
                            onClick={() => {
                              if (confirm(`Migrate configuration on ${machine.pc_name}?\n\nCopies the bundled configuration (missing files only - existing setup is kept). Takes seconds. Watch progress under Ops.`)) {
                                sendCommand(machine.mac_address, 'MIGRATE_CONFIG');
                              }
                            }}
                            className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-900/50 hover:border-purple-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                            title="Migrate configuration on this machine"
                          >
                            🧬 Migrate
                          </button>
                        )}
                        {gw !== 'running' ? (
                          <button
                            onClick={() => sendCommand(machine.mac_address, 'START_GATEWAY')}
                            disabled={!isOnline(machine)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-white ${isOnline(machine) ? 'bg-gradient-to-r from-emerald-600 to-green-600 hover:shadow-lg hover:shadow-emerald-900/40' : 'bg-gray-800 opacity-50 cursor-not-allowed'}`}
                            title={isOnline(machine) ? 'Start gateway on this machine' : 'Agent must be online'}
                          >
                            ▶ Start Gateway
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => sendCommand(machine.mac_address, 'RESTART_GATEWAY')}
                              className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-900/50 hover:border-blue-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                              title="Restart gateway on this machine"
                            >
                              🔄 Restart
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Stop the gateway on ${machine.pc_name}? Autok keeps running, only the service stops.`)) {
                                  sendCommand(machine.mac_address, 'STOP_GATEWAY');
                                }
                              }}
                              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-900/50 hover:border-red-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                              title="Stop gateway on this machine"
                            >
                              ⏹️ Stop Gateway
                            </button>
                          </>
                        )}
                        {pending && (
                          <button
                            onClick={() => clearStuckCommands(machine.mac_address)}
                            className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-900/50 hover:border-yellow-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                            title="Clear stuck pending command"
                          >
                            🔄 Clear Pending
                          </button>
                        )}
                        <button
                          onClick={() => fetchGatewayOps(machine.mac_address)}
                          className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                          title="Recent service operations"
                        >
                          📜 Ops
                        </button>
                        {!isOnline(machine) && (
                          <button
                            onClick={() => removeMachine(machine.mac_address, machine.pc_name)}
                            className="bg-gray-800 hover:bg-red-500/20 text-gray-500 hover:text-red-400 border border-gray-800 hover:border-red-900/50 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                            title="Remove this stale offline machine record"
                          >
                            🗑️ Remove
                          </button>
                        )}
                      </div>
                    </div>
                    {opsOpen === machine.mac_address && (
                      <div className="relative z-10 mt-4 bg-black/30 border border-gray-800 rounded-xl p-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Recent operations</p>
                        {ops.length === 0 ? (
                          <p className="text-gray-500 text-sm">No operations recorded yet.</p>
                        ) : (
                          ops.map((op) => (
                            <div key={op.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-800/50 last:border-0 text-sm">
                              <span className="text-gray-300 font-mono">{op.operation}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${op.status === 'success' ? 'bg-green-500/10 text-green-400 border-green-900/50' : op.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-900/50' : 'bg-gray-500/10 text-gray-400 border-gray-800'}`}>
                                {op.status.toUpperCase()}
                              </span>
                              <span className="text-gray-500 font-mono text-xs">{op.created_at ? new Date(op.created_at).toLocaleString() : ''}</span>
                            </div>
                          ))
                        )}
                        {ops.length > 0 && ops[0].error_message && (
                          <p className="text-red-400/80 text-xs font-mono mt-2 break-all">Last error: {ops[0].error_message.slice(0, 200)}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'credentials' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-gray-900/40 backdrop-blur-xl border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="p-6 border-b border-gray-800 bg-gradient-to-r from-purple-900/20 to-blue-900/20">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-purple-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Global Terminal Credentials</h2>
                    <p className="text-gray-400 text-sm">Manage login credentials for ALL terminals</p>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <div className="text-sm text-yellow-200">
                      <strong>Warning:</strong> Changing these credentials will affect ALL terminals. All users will need to use the new credentials on next login.
                    </div>
                  </div>
                </div>
              </div>

              {/* Form */}
              <div className="p-6 space-y-6">
                {/* Current Username */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Current Username
                  </label>
                  <input
                    type="text"
                    value={currentUsername}
                    readOnly
                    className="w-full px-4 py-3 bg-gray-800/30 border border-gray-700 rounded-xl text-gray-400 cursor-not-allowed"
                  />
                </div>

                {/* Current Password */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Current Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password to verify"
                      className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>

                <div className="h-px bg-gray-800"></div>

                {/* New Username */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    New Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={globalUsername}
                    onChange={(e) => setGlobalUsername(e.target.value)}
                    placeholder="Enter new username"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* New Password */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={globalPassword}
                      onChange={(e) => setGlobalPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-4">
                  <button
                    onClick={updateGlobalCredentials}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-purple-500/50 active:scale-95"
                  >
                    💾 Update Global Credentials
                  </button>
                  <button
                    onClick={fetchGlobalCredentials}
                    className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-semibold rounded-xl transition-all border border-gray-700 hover:border-gray-600"
                  >
                    🔄 Reset
                  </button>
                </div>

                {/* Info Box */}
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                    <div className="text-sm text-blue-200">
                      <strong>How it works:</strong>
                      <ul className="mt-2 space-y-1 list-disc list-inside">
                        <li>All terminals check credentials from this database</li>
                        <li>Changes take effect immediately on next login</li>
                        <li>Terminals can also update credentials from their Settings tab</li>
                        <li>Both methods update the same global database</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showErrors && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowErrors(null)}></div>
          <div className="relative z-10 w-full max-w-3xl bg-[#0F1115] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">📊 System Logs</h3>
                <p className="text-gray-400 text-xs mt-1">
                  {machines.find(m => m.mac_address === showErrors)?.pc_name} ({showErrors})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => fetchErrors(showErrors)}
                  className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-xs font-semibold rounded-lg border border-blue-500/30 transition-all"
                  title="Refresh logs"
                >
                  🔄 Refresh
                </button>
                <button 
                  onClick={() => {
                    if (confirm('Clear all old logs for this machine? This will remove logs with incorrect timestamps. New logs will show correct time.')) {
                      clearOldLogs(showErrors);
                    }
                  }}
                  className="px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 text-xs font-semibold rounded-lg border border-yellow-500/30 transition-all"
                  title="Clear old logs with incorrect timestamps"
                >
                  🗑️ Clear Old Logs
                </button>
                <button onClick={() => setShowErrors(null)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
            <div ref={logContainerRef} className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar bg-black/20">
              {errors.length === 0 ? (
                <div className="text-center py-12 text-gray-500">No logs recorded yet.</div>
              ) : (
                errors.map((err) => (
                  <div key={err.id} className="relative pl-6 py-1 group">
                    <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-800"></div>
                    <div className={`absolute left-[5px] top-4 w-1.5 h-1.5 rounded-full ${err.error_type === 'ERROR' || err.error_type === 'CRITICAL' ? 'bg-red-500' : err.error_type === 'WARNING' ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${err.error_type === 'ERROR' || err.error_type === 'CRITICAL' ? 'bg-red-900/20 text-red-400 border-red-900/50' : err.error_type === 'WARNING' ? 'bg-orange-900/20 text-orange-400 border-orange-900/50' : 'bg-blue-900/20 text-blue-400 border-blue-900/50'}`}>
                          {err.error_type}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {formatLogTime(err.created_at)}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm font-mono leading-relaxed break-all">{err.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
