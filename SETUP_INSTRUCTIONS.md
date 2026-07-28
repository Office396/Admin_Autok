# Admin Panel Setup Instructions

## Overview
This admin panel provides real-time monitoring and control of your distributed software. It shows live status, logs, and history of all connected machines.

## Features

### ✅ Real-Time Monitoring
- **Live Status**: Shows only machines that are currently online (heartbeat < 30 seconds)
- **Auto-Remove Offline**: Machines automatically disappear when they go offline
- **Real-Time Logs**: Logs update instantly with a 50-line rolling window
- **Instant Commands**: Lock, unlock, and destruct commands execute immediately

### 🔒 Security Controls
- **LOCK**: Locks the software on a machine (user cannot use it)
- **UNLOCK**: Unlocks the software
- **DESTRUCT**: Permanently destroys the software and blocks the IP address
- **RECOVER**: Unblocks a destructed machine and removes IP ban

### 📊 History Tab
- View all software sessions (when started, when ended, duration)
- Track which machines have run the software
- See session durations and timestamps

### 🚫 Persistent Blocking
- **IP-Based Blocking**: When you DESTRUCT a machine, the IP address is blocked
- **Prevents Reinstallation**: User cannot reinstall the software on the same IP
- **MAC + IP Tracking**: Uses both MAC address and IP for identification
- **RECOVER to Unblock**: Use RECOVER command to remove the IP ban

## Prerequisites

1. **Node.js** (v18 or higher)
2. **npm** or **yarn**
3. **Supabase Account** (free tier works fine)

## Setup Steps

### 1. Supabase Configuration

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be ready (takes ~2 minutes)
3. Go to **Settings** > **API**
4. Copy your:
   - Project URL
   - Anon/Public Key

### 2. Database Setup

1. In your Supabase project, go to **SQL Editor**
2. Open the file `supabase_schema.sql` in this directory
3. Copy the entire SQL content
4. Paste it into the Supabase SQL Editor
5. Click **Run** to create all tables and policies

### 3. Environment Configuration

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` and add your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run on Localhost

#### Development Mode (with hot reload)
```bash
npm run dev
```

The admin panel will be available at: **http://localhost:3000**

#### Production Mode (optimized)
```bash
npm run build
npm start
```

The admin panel will be available at: **http://localhost:3000**

## Usage Guide

### Live Tab
- Shows all currently running software instances
- Each machine card displays:
  - PC Name and Username
  - Public IP Address
  - Last Seen timestamp
  - Current Status (ACTIVE, LOCKED, DESTRUCTED)
  - Online indicator (green dot)

### Control Buttons

**🔒 LOCK**
- Locks the software on the target machine
- User cannot use the software but it remains installed
- Can be unlocked later

**🔓 UNLOCK**
- Unlocks a previously locked machine
- Software becomes usable again

**💣 DESTRUCT**
- **WARNING**: This is permanent!
- Stops the software
- Deletes all data
- Blocks the IP address
- User cannot reinstall on the same IP

**♻️ RECOVER**
- Unblocks a destructed machine
- Removes the IP ban
- Allows reinstallation

**📊 Logs Button**
- Opens real-time log viewer
- Shows last 50 log entries
- Auto-updates as new logs arrive
- Auto-scrolls to newest entries

### History Tab
- Shows all software sessions (past and present)
- Displays:
  - PC Name and MAC Address
  - Username and IP Address
  - Start Time
  - End Time (or "Active..." if still running)
  - Session Duration

## How It Works

### Real-Time Updates
1. **Heartbeat System**: Software reports status every 5 seconds
2. **30-Second Timeout**: If no heartbeat for 30 seconds, machine is considered offline
3. **Auto-Removal**: Offline machines automatically disappear from the Live tab
4. **Supabase Realtime**: Uses WebSocket subscriptions for instant updates

### Log System
- Software sends logs to Supabase
- Admin panel subscribes to log updates
- Automatically maintains 50-line limit
- Old logs are deleted when limit is exceeded

### Session Tracking
- New session created when software starts
- End time updated every 5 seconds (heartbeat)
- Session closed when software stops
- All sessions stored in history

### Blocking System
1. **DESTRUCT Command**:
   - Marks machine as DESTRUCTED
   - Creates IP-based block entry
   - Software self-destructs on target machine

2. **IP Block Check**:
   - Software checks MAC address and IP on startup
   - If IP is blocked, software self-destructs immediately
   - Prevents reinstallation on the same network

3. **RECOVER Command**:
   - Removes DESTRUCTED status
   - Deletes IP block entry
   - Allows software to run again

## Troubleshooting

### Machines Not Appearing
- Check if software is running on target machines
- Verify Supabase credentials in `.env.local`
- Check browser console for errors
- Ensure Supabase Realtime is enabled (it is by default)

### Logs Not Updating
- Refresh the page
- Close and reopen the log viewer
- Check if machine is still online
- Verify Supabase connection

### Commands Not Working
- Check if machine is online
- Verify command was sent (check Supabase `commands` table)
- Wait a few seconds (software checks every 5 seconds)
- Check software logs on target machine

### Port Already in Use
If port 3000 is already in use, you can change it:
```bash
# Run on a different port
PORT=3001 npm run dev
```

## Security Notes

⚠️ **Important Security Considerations**:

1. **Authentication**: The current setup uses Supabase RLS policies set to allow all access. For production, implement proper authentication.

2. **Environment Variables**: Never commit `.env.local` to version control. It contains sensitive credentials.

3. **HTTPS**: For production deployment, always use HTTPS to encrypt communication.

4. **Access Control**: Consider adding admin authentication before deploying publicly.

## Deployment (Optional)

### Deploy to Vercel (Recommended)
1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add environment variables in Vercel dashboard
5. Deploy

### Deploy to Other Platforms
The admin panel is a standard Next.js app and can be deployed to:
- Netlify
- Railway
- Render
- Any Node.js hosting platform

## Support

For issues or questions:
1. Check the browser console for errors
2. Check Supabase logs
3. Verify all environment variables are set correctly
4. Ensure the database schema is properly created

## Summary

Your admin panel is now ready! It provides:
- ✅ Real-time status monitoring
- ✅ Live log streaming (50-line limit)
- ✅ Session history tracking
- ✅ Remote lock/unlock control
- ✅ Permanent destruct with IP blocking
- ✅ Recovery and unblocking capabilities

Run `npm run dev` and open http://localhost:3000 to get started!
