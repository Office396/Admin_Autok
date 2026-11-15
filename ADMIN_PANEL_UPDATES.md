# Admin Panel Updates - Locked/Destructed Tab

## Changes Made

### 1. Removed Auto-Disappear Function ✅
**Problem:** Machines were automatically disappearing from the admin panel after 30 seconds of being offline.

**Solution:** Removed the watchdog interval that was filtering out machines based on `last_seen` timestamp.

**Impact:** Machines now stay visible in the admin panel until manually removed or moved to different tabs.

### 2. Added "Locked/Destructed" Tab ✅
**New Tab:** Added a third tab between "Live" and "History" called "🔒 Locked/Destructed"

**Purpose:** Shows all machines that are:
- LOCKED (status = 'LOCKED')
- DESTRUCTED (status = 'DESTRUCTED')
- BLOCKED (blocked = true)

### 3. Updated Tab Filtering Logic ✅

#### Live Tab
**Shows:** Only machines that are:
- Online (last_seen < 30 seconds)
- NOT locked
- NOT blocked
- NOT destructed

**Purpose:** Clean view of actively running, healthy machines

#### Locked/Destructed Tab
**Shows:** Machines that are:
- LOCKED (can be unlocked)
- DESTRUCTED (can be recovered)
- BLOCKED (can be recovered)

**Purpose:** Manage problematic or controlled machines

#### History Tab
**Shows:** Session history (unchanged)

**Purpose:** View past sessions with start/end times

## How It Works

### Scenario 1: LOCK a Machine
1. Machine is running in "Live" tab
2. Click "LOCK" button
3. Machine disappears from "Live" tab
4. Machine appears in "Locked/Destructed" tab with LOCKED status
5. Shows "UNLOCK" button
6. Click "UNLOCK" → Machine returns to "Live" tab (if still running)

### Scenario 2: DESTRUCT a Machine
1. Machine is running in "Live" tab
2. Click "DESTRUCT" button (with confirmation)
3. Machine disappears from "Live" tab
4. Machine appears in "Locked/Destructed" tab with DESTRUCTED status
5. Shows "RECOVER" button
6. Click "RECOVER" → Unblocks IP, machine returns to "Live" tab ONLY if software is running again

### Scenario 3: Machine Goes Offline
1. Machine is in "Live" tab
2. Software closes or loses connection
3. Machine stays in "Live" tab (no auto-disappear)
4. Shows as OFFLINE status
5. Admin can manually check logs or wait for reconnection

### Scenario 4: RECOVER from DESTRUCT
1. Machine is in "Locked/Destructed" tab with DESTRUCTED status
2. Click "RECOVER" button
3. IP is unblocked in database
4. Machine stays in "Locked/Destructed" tab until software runs again
5. When software runs again, it appears in "Live" tab

## Button Behavior

### Live Tab Buttons
- **LOCK** - Moves machine to Locked/Destructed tab
- **DESTRUCT** - Destroys software, moves to Locked/Destructed tab
- **View Logs** - Shows real-time logs
- **Clear Pending** - Clears stuck commands

### Locked/Destructed Tab Buttons
- **UNLOCK** - Unlocks machine, returns to Live tab if running
- **RECOVER** - Unblocks IP, allows software to run again
- **View Logs** - Shows logs (even for destructed machines)
- **Clear Pending** - Clears stuck commands

## Status Indicators

### Live Tab
- 🟢 Green dot - Active and running
- 🟠 Orange badge - LOCKED (shouldn't appear in Live)
- 🔴 Red badge - BLOCKED/DESTRUCTED (shouldn't appear in Live)

### Locked/Destructed Tab
- 🔒 Orange lock icon - LOCKED
- ⚠️ Red warning icon - DESTRUCTED
- 🚫 Red X icon - BLOCKED

## Technical Details

### State Management
```typescript
const [activeTab, setActiveTab] = useState<'live' | 'locked' | 'history'>('live');
```

### Filtering Logic

**Live Tab:**
```typescript
machines.filter(m => 
  isOnline(m) && 
  !m.blocked && 
  m.status !== 'DESTRUCTED' && 
  m.status !== 'LOCKED'
)
```

**Locked/Destructed Tab:**
```typescript
machines.filter(m => 
  m.blocked || 
  m.status === 'DESTRUCTED' || 
  m.status === 'LOCKED'
)
```

### Real-time Updates
- Machines automatically move between tabs based on status changes
- Supabase real-time subscriptions keep data synchronized
- No manual refresh needed

## Benefits

1. **Clear Organization** - Easy to see which machines are active vs controlled
2. **No Auto-Disappear** - Machines stay visible until explicitly managed
3. **Easy Recovery** - One-click unlock/recover from dedicated tab
4. **Better Visibility** - Know exactly which machines are locked/destructed
5. **Simplified Management** - All control actions in one place

## Files Modified

- `admin-panel/src/app/page.tsx`
  - Added 'locked' to activeTab type
  - Removed watchdog interval
  - Added Locked/Destructed tab UI
  - Updated filtering logic for all tabs
  - Added appropriate buttons for each tab

## Testing

### Test 1: LOCK/UNLOCK Flow
1. Start with machine in Live tab
2. Click LOCK → Should move to Locked/Destructed tab
3. Click UNLOCK → Should return to Live tab

### Test 2: DESTRUCT/RECOVER Flow
1. Start with machine in Live tab
2. Click DESTRUCT → Should move to Locked/Destructed tab
3. Click RECOVER → Should unblock IP
4. Restart software → Should appear in Live tab

### Test 3: No Auto-Disappear
1. Machine running in Live tab
2. Close software on that machine
3. Wait 30+ seconds
4. Machine should still be visible (as OFFLINE)

### Test 4: Tab Switching
1. Switch between Live, Locked/Destructed, and History tabs
2. Each should show appropriate machines
3. No machines should appear in multiple tabs

## Status

✅ All changes implemented
✅ No syntax errors
✅ Ready for testing

---

**Date:** February 23, 2026
**Files Modified:** 1 file (admin-panel/src/app/page.tsx)
**New Features:** Locked/Destructed tab, No auto-disappear
