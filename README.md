# MediReminder

Smart medication reminder app with ESP32 pill-box integration via MQTT (HiveMQ), caregiver Telegram alerts, and adherence tracking.

Built with **React + Vite + TypeScript + Tailwind + shadcn/ui** on the frontend and **Lovable Cloud (Supabase)** on the backend.

---

## 1. Prerequisites

Install these on your machine first:

- **Node.js 18+** — https://nodejs.org
- **Bun** (recommended) — https://bun.sh  
  *or* npm (comes with Node)
- **Git** — https://git-scm.com

Check they work:
```bash
node -v
bun -v        # or: npm -v
git --version
```

---

## 2. Get the code

**Option A — via GitHub (recommended)**
```bash
git clone <your-repo-url>
cd <project-folder>
```

**Option B — download ZIP** from GitHub → `Code` → `Download ZIP` → unzip → `cd` into the folder.

---

## 3. Install dependencies

```bash
bun install
# or
npm install
```

---

## 4. Environment variables

A `.env` file is already included with the backend keys:

```
VITE_SUPABASE_PROJECT_ID="zyhbxzjdtfpvlaahqxdp"
VITE_SUPABASE_URL="https://zyhbxzjdtfpvlaahqxdp.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="..."
```

No editing needed — it points to the live Lovable Cloud backend (auth, database, edge functions for MQTT publish, missed-dose checks, Telegram alerts).

---

## 5. Run the dev server

```bash
bun run dev
# or
npm run dev
```

Open **http://localhost:8080** in your browser.

---

## 6. Useful scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start dev server with hot reload |
| `bun run build` | Build production bundle to `dist/` |
| `bun run preview` | Preview the production build locally |
| `bunx vitest run` | Run unit tests |

---

## 7. Project structure

```
src/
  pages/            Index.tsx (dashboard), Auth.tsx, NotFound.tsx
  components/       MedicineForm, MedicineCard, AlarmModal, AdherenceHistory…
  hooks/            useAuth, useReminderScheduler (alarm engine + MQTT publish)
  integrations/     supabase/client.ts (auto-generated, do not edit)
supabase/
  functions/
    publish-reminder/        Publishes alarm to HiveMQ (topic medreminder/alarm)
    check-missed-doses/      Cron-style missed-dose checker
    test-caregiver-telegram/ Test Telegram alert
public/             Static assets
```

---

## 8. ESP32 firmware

The Arduino sketch for the pill-box is **not** part of this web project — keep it as a separate `.ino` file in the Arduino IDE.

The ESP32 must connect to **HiveMQ** and subscribe to:

```
Topic: medreminder/alarm
```

The browser app calls the `publish-reminder` edge function whenever a reminder fires; that function publishes the JSON payload to HiveMQ, which the ESP32 receives.

---

## 9. Features

- 🔐 Email + Google authentication
- 💊 Add medicines with multiple daily times and pill-box numbers
- ⏰ In-browser scheduler with notifications + on-screen alarm modal
- 📡 Publishes each alarm to HiveMQ MQTT for ESP32 pill-boxes
- 📊 Weekly adherence analytics & history
- 📲 Caregiver Telegram alerts for missed doses

---

## 10. Troubleshooting

- **Port 8080 already in use** → change `port` in `vite.config.ts` or kill the other process.
- **Dependency install errors** → delete `node_modules` and `bun.lock` (or `package-lock.json`) and reinstall.
- **Login fails / data not loading** → make sure the `.env` file is present and you have internet access (it talks to Lovable Cloud).
- **ESP32 shows `MQTT retry` / `rc=-2`** → device can't reach `broker.hivemq.com:8883`. Try a mobile hotspot — most hostel/college WiFi networks block MQTT ports. Verify your Wi-Fi credentials and that the broker URL/port match what the edge function publishes to.
