# Admin Panel - Real-Time Software Control Center

A professional, real-time monitoring and control dashboard for distributed software management.

## 🚀 Quick Start

```bash
cd admin-panel
npm install
npm run dev
```

Open http://localhost:3000

**First time?** See [QUICK_START.md](QUICK_START.md) for 5-minute setup guide.

---

## ✨ Features

### 📡 Real-Time Monitoring
- Live status of all running software instances
- Machines appear when online, disappear when offline
- 30-second timeout for accurate status
- Instant updates via WebSocket

### 📊 Live Logs
- Real-time log streaming
- 50-line rolling window
- Auto-scroll to newest entries
- Color-coded by severity (INFO, WARNING, ERROR, CRITICAL)

### 📜 History Tracking
- Complete session history
- Start/end times and durations
- Track all machines and IPs
- Real-time updates for active sessions

### 🔒 Remote Control
- **LOCK**: Disable software on target machine
- **UNLOCK**: Re-enable locked software
- **DESTRUCT**: Permanently destroy and block IP
- **RECOVER**: Unblock and allow reinstallation

### 🚫 Persistent Blocking
- IP-based blocking prevents reinstallation
- MAC + IP dual verification
- Survives software reinstall
- Only admin can unblock

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [QUICK_START.md](QUICK_START.md) | Get running in 5 minutes |
| [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md) | Complete setup guide |
| [FEATURES.md](FEATURES.md) | Detailed feature documentation |
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | Technical architecture |
| [CHANGELOG.md](CHANGELOG.md) | What changed in this version |

---

## 🎯 What's New in v2.0

### ✅ Fixed Issues
- ❌ **Before**: Showed all machines ever connected (confusing)
- ✅ **After**: Shows only currently online machines

- ❌ **Before**: Logs required manual refresh
- ✅ **After**: Real-time log updates with 50-line limit

- ❌ **Before**: No history tracking
- ✅ **After**: Complete session history with durations

- ❌ **Before**: Users could reinstall after DESTRUCT
- ✅ **After**: IP-based blocking prevents reinstallation

### 🎨 UI Improvements
- Clean, modern interface
- Color-coded status indicators
- Real-time updates without refresh
- Professional log viewer
- Responsive design

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL + Real-time)
- **Real-time**: WebSocket subscriptions
- **Backend**: Python (client software)

---

## 📋 Requirements

- Node.js 18+
- npm or yarn
- Supabase account (free tier works)
- Modern web browser

---

## 🔧 Setup

### 1. Supabase Setup
1. Create project at [supabase.com](https://supabase.com)
2. Run `supabase_schema.sql` in SQL Editor
3. Copy URL and Anon Key from Settings > API

### 2. Environment Setup
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key-here
```

### 3. Install & Run
```bash
npm install
npm run dev
```

---

## 📖 Usage

### Live Tab
View all currently running software instances with:
- PC name, username, IP address
- Online status indicator
- Last seen timestamp
- Current status (ACTIVE, LOCKED, DESTRUCTED)

### Control Buttons

**🔒 LOCK**
- Locks software on target machine
- User cannot use it
- Can be unlocked later

**🔓 UNLOCK**
- Unlocks previously locked software
- Restores full functionality

**💣 DESTRUCT** (Permanent!)
- Stops software
- Deletes all data
- Blocks IP address
- Prevents reinstallation

**♻️ RECOVER**
- Unblocks destructed machine
- Removes IP ban
- Allows reinstallation

**📊 Logs**
- Opens real-time log viewer
- Shows last 50 entries
- Auto-updates as new logs arrive

### History Tab
- View all past sessions
- See start/end times
- Check session durations
- Track usage patterns

---

## 🔐 Security

### Identity Tracking
- Primary: MAC Address
- Secondary: Public IP
- Display: PC Name, Username

### Blocking System
1. **MAC-based**: Blocks specific machine
2. **IP-based**: Blocks entire network/IP
3. **Persistent**: Survives reinstallation
4. **Immediate**: Takes effect within 5 seconds

### Command Security
- Stored in database
- Cannot be bypassed by client
- Timestamped for audit trail
- Executed flag prevents duplicates

---

## ⚡ Performance

- **Command Latency**: 0-5 seconds
- **Status Updates**: Instant (WebSocket)
- **Offline Detection**: 30 seconds max
- **Scalability**: 100+ concurrent machines
- **Resource Usage**: Minimal (~10 MB RAM)

---

## 🐛 Troubleshooting

### Machines Not Appearing
- Check if software is running
- Verify Supabase credentials
- Check browser console
- Wait 5 seconds for heartbeat

### Logs Not Updating
- Close and reopen log viewer
- Refresh the page
- Check if machine is online

### Commands Not Working
- Wait up to 5 seconds
- Check if machine is online
- Verify command in database

### Port Already in Use
```bash
PORT=3001 npm run dev
```

---

## 🚀 Deployment

### Vercel (Recommended)
1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy

### Other Platforms
Works on any Node.js hosting:
- Netlify
- Railway
- Render
- Heroku

---

## 📊 System Architecture

```
Admin Panel (Next.js)
       ↕ WebSocket + REST
Supabase (Database + Real-time)
       ↕ REST + Polling
Client Software (Python)
```

**Heartbeat**: Every 5 seconds  
**Command Check**: Every 5 seconds  
**Offline Timeout**: 30 seconds  
**Real-time Updates**: Instant

See [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) for details.

---

## 📝 Database Schema

### Tables
- `machines`: Machine status and identity
- `commands`: Command queue
- `error_logs`: Log entries (50-line limit)
- `sessions`: Usage history

### Indexes
- `idx_commands_mac`: Fast command lookup
- `idx_error_logs_mac`: Fast log queries
- `idx_sessions_mac`: Fast session queries

---

## 🎓 How It Works

### Real-Time Status
1. Software sends heartbeat every 5 seconds
2. Updates `last_seen` timestamp
3. Admin panel checks timestamps
4. Removes machines offline > 30 seconds

### Command Execution
1. Admin clicks button
2. Command inserted into database
3. Software polls every 5 seconds
4. Software executes command
5. Status updates instantly

### IP Blocking
1. DESTRUCT creates IP block entry
2. Software checks IP on startup
3. If blocked, self-destructs immediately
4. RECOVER removes IP block

---

## 🤝 Contributing

This is a private project, but suggestions are welcome!

---

## 📄 License

Proprietary - All rights reserved

---

## 📞 Support

For issues:
1. Check documentation files
2. Review browser console
3. Check Supabase logs
4. Verify environment variables

---

## 🎯 Summary

This admin panel provides:
- ✅ Real-time monitoring (accurate status)
- ✅ Live log streaming (50-line limit)
- ✅ Complete history tracking
- ✅ Remote control (lock/unlock/destruct)
- ✅ Persistent blocking (IP-based)
- ✅ Professional UI/UX
- ✅ Comprehensive documentation

**Version**: 2.0.0  
**Status**: Production Ready ✅  
**Last Updated**: 2026-02-23

---

## 🚀 Get Started Now

```bash
npm install
npm run dev
```

Open http://localhost:3000 and start monitoring!

For detailed setup, see [QUICK_START.md](QUICK_START.md)
