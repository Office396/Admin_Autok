# Admin Panel Features Documentation

## Real-Time Status Display

### What Changed
- **Before**: Showed all machines that ever connected, even if offline
- **After**: Shows ONLY machines that are currently online (last heartbeat < 30 seconds)

### How It Works
1. Software sends heartbeat every 5 seconds
2. Admin panel checks last_seen timestamp
3. If last_seen > 30 seconds ago, machine is removed from display
4. Machines automatically appear when they come online
5. Machines automatically disappear when they go offline

### Benefits
- Accurate real-time view of active software instances
- No confusion about which machines are actually running
- Clean interface showing only relevant information

---

## Real-Time Logs

### What Changed
- **Before**: Logs were static, required manual refresh
- **After**: Logs update automatically in real-time with 50-line rolling window

### How It Works
1. Software sends logs to Supabase `error_logs` table
2. Admin panel subscribes to log updates via WebSocket
3. New logs appear instantly at the bottom
4. When logs exceed 50 lines, oldest logs are removed
5. Auto-scrolls to show newest entries

### Features
- **Live Updates**: New logs appear without refresh
- **50-Line Limit**: Keeps display clean and performant
- **Auto-Scroll**: Always shows the latest logs
- **Color Coding**: 
  - 🔴 Red: ERROR, CRITICAL
  - 🟠 Orange: WARNING
  - 🔵 Blue: INFO
- **Timestamps**: Each log shows exact time

### Log Types
- `INFO`: General information
- `WARNING`: Important notices
- `ERROR`: Error conditions
- `CRITICAL`: Critical failures (destruct, block detected)

---

## History Tab

### What It Shows
Complete session history of all software instances:
- PC Name and MAC Address
- Username and Public IP
- Start Time (when software launched)
- End Time (when software closed)
- Duration (how long it ran)

### Features
- **Real-Time Updates**: New sessions appear instantly
- **Active Sessions**: Shows "Active..." for currently running software
- **Duration Calculation**: Automatic calculation of session length
- **Sorted by Time**: Most recent sessions first
- **Limit**: Shows last 100 sessions

### Use Cases
- Track software usage patterns
- Monitor which machines run the software
- Audit trail for security
- Identify suspicious activity

---

## Lock/Unlock System

### LOCK Command 🔒
**What It Does:**
- Locks the software on the target machine
- User cannot use the software
- Software remains installed
- Can be unlocked later

**How It Works:**
1. Admin clicks LOCK button
2. Command sent to Supabase
3. Software checks for commands every 5 seconds
4. Software receives LOCK command
5. Sets `is_locked = True`
6. UI becomes disabled for user
7. Status updates to "LOCKED"

**Visual Indicators:**
- 🟠 Orange status badge
- Lock icon on machine card
- "LOCKED" status text

### UNLOCK Command 🔓
**What It Does:**
- Unlocks a previously locked machine
- Software becomes usable again
- User can access all features

**How It Works:**
1. Admin clicks UNLOCK button
2. Command sent to Supabase
3. Software receives UNLOCK command
4. Sets `is_locked = False`
5. UI becomes enabled for user
6. Status updates to "ACTIVE"

**Important:**
- Lock persists even if user restarts software
- Lock persists even if user reinstalls software (same MAC)
- Only admin can unlock

---

## Destruct System

### DESTRUCT Command 💣
**What It Does:**
- **PERMANENTLY** destroys the software
- Stops all processes
- Deletes all data files
- Blocks the IP address
- Prevents reinstallation on same IP

**How It Works:**
1. Admin clicks DESTRUCT (requires confirmation)
2. Command sent to Supabase
3. Machine status set to "DESTRUCTED"
4. IP address added to block list
5. Software receives command
6. Software executes self-destruct sequence:
   - Stops automation
   - Kills browser processes
   - Creates batch file to delete everything
   - Exits immediately
7. Batch file runs after exit:
   - Waits 5 seconds
   - Kills remaining processes
   - Deletes data directories
   - Deletes software folder
   - Deletes itself

**IP Blocking:**
- Creates entry: `BLOCKED_IP_<ip_address>`
- Blocks entire IP address
- Prevents reinstallation on same network
- Even with different MAC address

**What Gets Deleted:**
- `/data` directory
- `/logs` directory
- `/exports` directory
- All software files
- Browser profiles
- Configuration files

**Visual Indicators:**
- 🔴 Red status badge
- "DESTRUCTED" status text
- Machine disappears when offline

### RECOVER Command ♻️
**What It Does:**
- Unblocks a destructed machine
- Removes IP ban
- Allows software to run again on that IP

**How It Works:**
1. Admin clicks RECOVER
2. Machine status set to "ACTIVE"
3. `blocked` flag set to `false`
4. IP block entry deleted
5. Software can be reinstalled and will run

**Use Cases:**
- Accidental destruct
- User paid/resolved issue
- Testing purposes
- Changing policies

---

## Persistent Blocking

### How It Works

#### On DESTRUCT:
1. Machine MAC address marked as DESTRUCTED
2. IP address added to block list
3. Entry created: `BLOCKED_IP_<ip_address>`

#### On Software Startup:
1. Software gets MAC address and IP
2. Checks Supabase for blocks:
   - Checks by MAC address
   - Checks by IP address
3. If either is blocked:
   - Logs critical error
   - Executes self-destruct
   - Software cannot run

#### Prevents:
- ❌ Reinstallation on same machine
- ❌ Reinstallation on same IP (different machine)
- ❌ Bypassing by changing MAC address
- ❌ Bypassing by reinstalling

#### Allows (after RECOVER):
- ✅ Software can run again
- ✅ IP is unblocked
- ✅ Normal operation resumes

---

## Technical Details

### Heartbeat System
```
Software → Supabase (every 5 seconds)
- Updates last_seen timestamp
- Updates session end_time
- Reports current status
```

### Command System
```
Admin Panel → Supabase → Software (every 5 seconds)
- Admin creates command
- Software polls for commands
- Software executes command
- Software marks command as executed
```

### Real-Time Subscriptions
```
Supabase → Admin Panel (WebSocket)
- Machine updates (INSERT, UPDATE, DELETE)
- Command updates
- Log updates (when viewing logs)
- Session updates (in history tab)
```

### Offline Detection
```
Every 3 seconds:
- Check all machines
- Calculate time since last_seen
- If > 30 seconds, remove from display
```

### Log Rotation
```
On new log:
- Insert log into database
- Count total logs for machine
- If > 50, delete oldest logs
- Keep only last 50
```

---

## Status Indicators

### Colors
- 🟢 **Green**: ACTIVE (online, working normally)
- 🟠 **Orange**: LOCKED (online, but locked)
- 🔴 **Red**: DESTRUCTED (blocked permanently)
- ⚫ **Gray**: OFFLINE (not responding)

### Status Text
- `ACTIVE`: Software running normally
- `LOCKED`: Software locked by admin
- `DESTRUCTED`: Software destroyed and blocked
- `OFFLINE`: No heartbeat received
- `⏳ PENDING: <command>`: Command waiting to execute

---

## Performance

### Optimizations
- WebSocket subscriptions for instant updates
- 3-second watchdog for offline detection
- 50-line log limit for performance
- Efficient database queries with indexes
- Optimistic UI updates for instant feedback

### Scalability
- Handles 100+ concurrent machines
- Real-time updates for all clients
- Efficient log rotation
- Minimal database load

---

## Security Features

### Identity Tracking
- MAC Address (primary identifier)
- Public IP Address (secondary identifier)
- PC Name (for display)
- Username (for tracking)

### Blocking Mechanisms
1. **MAC-based**: Blocks specific machine
2. **IP-based**: Blocks entire network/IP
3. **Persistent**: Survives reinstallation
4. **Immediate**: Takes effect on next heartbeat (5 seconds)

### Command Security
- Commands stored in database
- Executed flag prevents duplicate execution
- Timestamped for audit trail
- Cannot be bypassed by client

---

## Best Practices

### When to LOCK
- User violated terms
- Temporary suspension
- Investigation needed
- Testing purposes

### When to DESTRUCT
- Permanent ban required
- Security breach detected
- Unauthorized usage
- Refund/chargeback

### When to RECOVER
- Issue resolved
- User paid/complied
- Accidental destruct
- Policy change

### Monitoring
- Check Live tab regularly
- Review History for patterns
- Monitor logs for errors
- Track session durations

---

## Troubleshooting

### Machine Not Appearing
- Wait 5 seconds (heartbeat interval)
- Check if software is running
- Verify Supabase connection
- Check browser console

### Logs Not Updating
- Close and reopen log viewer
- Check if machine is online
- Verify WebSocket connection
- Refresh page

### Command Not Executing
- Wait up to 5 seconds (polling interval)
- Check if machine is online
- Verify command in database
- Check software logs

### Machine Won't Stay Offline
- Check if software is actually stopped
- Verify last_seen timestamp
- Check for multiple instances
- Review session history

---

## Summary

The admin panel now provides:
- ✅ **Accurate Status**: Only shows online machines
- ✅ **Real-Time Logs**: Live updates with 50-line limit
- ✅ **Complete History**: Track all sessions
- ✅ **Persistent Blocking**: IP-based prevention
- ✅ **Instant Commands**: Lock/unlock/destruct
- ✅ **Professional UI**: Clean, modern interface

All features work together to provide complete control and monitoring of your distributed software.
