# Quick Start Guide

## 🚀 Get Running in 5 Minutes

### Step 1: Setup Supabase (2 minutes)
1. Go to https://supabase.com and create account
2. Create new project (wait ~2 minutes)
3. Go to Settings > API
4. Copy your URL and Anon Key

### Step 2: Setup Database (1 minute)
1. In Supabase, go to SQL Editor
2. Copy content from `supabase_schema.sql`
3. Paste and click Run

### Step 3: Configure Environment (30 seconds)
```bash
cd admin-panel
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key-here
```

### Step 4: Install & Run (1 minute)
```bash
npm install
npm run dev
```

### Step 5: Open Browser
Go to: **http://localhost:3000**

---

## ✅ What You Get

### Live Tab
- See all running software in real-time
- Machines appear when online, disappear when offline
- Control buttons: Lock, Unlock, Destruct, Recover
- View real-time logs

### History Tab
- See all past sessions
- Track when software ran and for how long
- Monitor usage patterns

---

## 🎮 How to Use

### View Status
- Open Live tab
- See all online machines
- Green dot = online
- Status badge shows current state

### Lock a Machine
1. Click 🔒 LOCK button
2. Software becomes locked on that machine
3. User cannot use it
4. Click 🔓 UNLOCK to unlock

### Destruct a Machine (Permanent)
1. Click 💣 DESTRUCT button
2. Confirm the warning
3. Software self-destructs
4. IP address is blocked
5. User cannot reinstall

### Recover a Machine
1. Find destructed machine
2. Click ♻️ RECOVER button
3. IP block is removed
4. Software can run again

### View Logs
1. Click 📊 Logs button on any machine
2. See real-time logs (last 50 lines)
3. Logs update automatically
4. Close when done

### View History
1. Click History tab
2. See all sessions
3. Check start/end times
4. View durations

---

## 🔧 Common Commands

### Development (with hot reload)
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Different Port
```bash
PORT=3001 npm run dev
```

---

## 📊 Understanding Status

| Status | Meaning | Color |
|--------|---------|-------|
| ACTIVE | Running normally | 🟢 Green |
| LOCKED | Locked by admin | 🟠 Orange |
| DESTRUCTED | Permanently blocked | 🔴 Red |
| OFFLINE | Not responding | ⚫ Gray |

---

## ⚡ Key Features

### Real-Time Updates
- Software reports every 5 seconds
- Admin panel updates instantly
- No refresh needed

### Accurate Status
- Only shows online machines
- Offline machines disappear automatically
- 30-second timeout

### Live Logs
- Updates in real-time
- 50-line rolling window
- Auto-scrolls to newest

### Persistent Blocking
- DESTRUCT blocks IP address
- Prevents reinstallation
- RECOVER to unblock

---

## 🆘 Troubleshooting

### Nothing Shows Up
- Check if software is running on target machines
- Verify `.env.local` has correct credentials
- Check browser console for errors

### Logs Not Updating
- Close and reopen log viewer
- Refresh the page
- Check if machine is online

### Port 3000 In Use
```bash
PORT=3001 npm run dev
```

---

## 📚 More Information

- **Full Setup**: See `SETUP_INSTRUCTIONS.md`
- **Features**: See `FEATURES.md`
- **Database Schema**: See `supabase_schema.sql`

---

## 🎯 That's It!

You now have a fully functional admin panel with:
- ✅ Real-time monitoring
- ✅ Live logs
- ✅ Session history
- ✅ Remote control
- ✅ Persistent blocking

Open http://localhost:3000 and start monitoring!
