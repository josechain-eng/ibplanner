# Cloudflare Worker Setup Guide
### Life Business Planner 2026 — Reliable Push Notifications & Cross-Device Sync

This guide takes about 15–20 minutes. After completing it you'll have:
- **100% reliable push notifications** that fire even when Chrome is closed
- **Cross-device data sync** — set an alarm on desktop, it fires on your phone

---

## Step 1 — Create a Free Cloudflare Account

1. Go to **https://dash.cloudflare.com/sign-up**
2. Enter your email and a password, then click **Create Account**
3. Verify your email address (Cloudflare sends a confirmation email)
4. You land on the Cloudflare dashboard — the free plan is enough for this

---

## Step 2 — Create the KV Namespace

The Worker uses Cloudflare KV (key-value storage) to store your data and scheduled alarms.

1. In the Cloudflare sidebar click **Workers & Pages**
2. Click **KV** in the sub-menu on the left
3. Click **Create a namespace**
4. Name it exactly: `LBP_KV`
5. Click **Add** — you'll see it appear in the list with an ID like `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
6. **Copy that ID** — you'll need it in Step 4

---

## Step 3 — Deploy the Worker

### 3a — Open the Workers editor
1. In the Cloudflare sidebar click **Workers & Pages**
2. Click **Create application**
3. Click **Create Worker**
4. Give it a name, e.g. `life-planner` (this becomes part of your URL)
5. Click **Deploy** — this creates a placeholder Worker

### 3b — Paste the Worker code
1. After deploying, click **Edit code** (top-right)
2. You'll see the code editor. **Delete all existing code** in the editor
3. Open the file `worker.js` that came with your app
4. **Copy its entire contents** and paste it into the Cloudflare editor
5. Click **Save and deploy**

---

## Step 4 — Bind the KV Namespace to the Worker

1. Go back to your Worker's dashboard page (click the Worker name in Workers & Pages)
2. Click the **Settings** tab
3. Scroll down to **Bindings** → click **Add binding**
4. Choose **KV Namespace**
5. Set **Variable name** to exactly: `LBP_KV`
6. In the **KV namespace** dropdown select `LBP_KV` (the one you created in Step 2)
7. Click **Save**

---

## Step 5 — Enable the Cron Trigger (alarm scheduler)

The Worker checks for due alarms every minute via a Cron Trigger.

1. Still in your Worker's **Settings** tab
2. Scroll to **Triggers** → **Cron Triggers** → click **Add Cron Trigger**
3. Enter the schedule: `* * * * *`  (this means "every minute")
4. Click **Save**

---

## Step 6 — Get Your Worker URL

1. Click the **Overview** tab of your Worker
2. You'll see a URL that looks like:
   ```
   https://life-planner.YOUR-SUBDOMAIN.workers.dev
   ```
3. **Copy this URL** — you'll paste it into the app

---

## Step 7 — Enter the Worker URL in the App

1. Open your Life Business Planner app (on any device)
2. Look for the **🔌 cloud button** in the top-right corner (near the notification bell)
3. Click it to open the Cloud Sync Settings panel
4. Paste your Worker URL into the **Cloudflare Worker URL** field
5. Click **Test** — you should see ✅ Connected
6. Click **Save URL**

---

## Step 8 — Enable Notifications

1. Click the **🔔 notification bell** button (top-right)
2. Click **Enable Notifications** and allow when the browser asks
3. Click **Send Test Notification** to confirm it works
4. You should see a system notification appear — even if you switch away from the app

---

## Step 9 — Sync to Another Device (optional)

To have the same data and alarms on your phone and desktop:

1. On your **first device**, open ☁️ Cloud Sync Settings
2. Click **Copy** next to your Sync Key (it looks like `lbp_a1b2c3d4e5f6g7h8`)
3. On your **second device**, open the app and open ☁️ Cloud Sync Settings
4. Paste the sync key into **"Use sync key from another device"** and click **Apply & Reload**
5. Both devices now share the same data and receive each other's alarms

> ⚠️ **Important:** Both devices need the Worker URL entered and notifications enabled (Steps 7–8) for cross-device push to work.

---

## How It Works (for the curious)

| Feature | How |
|---|---|
| Reliable background notifications | Cloudflare Worker sends a Web Push message directly to your phone's push service (FCM/APNs), bypassing Chrome entirely |
| Alarms fire even with Chrome closed | The push message is delivered by the OS, not the browser |
| Cross-device sync | Your app data is stored in Cloudflare KV; every save syncs to the cloud and every load merges from it |
| Privacy | Only you know your Sync Key — Cloudflare only sees an opaque key, not your identity |

---

## Troubleshooting

**"Cannot reach Worker" when testing:**
- Double-check the URL has no trailing slash
- Make sure you clicked "Save and deploy" in the code editor
- Check the KV binding variable name is exactly `LBP_KV` (case-sensitive)

**Notifications work on WiFi but not mobile data:**
- This is normal — the first notification after the screen wakes may be delayed by a few seconds by the OS. This is not a bug in the app.

**Data not syncing between devices:**
- Confirm both devices have the same Sync Key (Settings → copy/paste)
- Confirm both devices have the Worker URL saved

**Cron trigger not firing alarms:**
- Cloudflare free plan Cron Triggers fire at most once per minute. An alarm may be up to 60 seconds late.
- Make sure the Cron expression is exactly `* * * * *`

---

*Setup time: ~15 minutes. Cloudflare free tier limits: 100,000 Worker requests/day and unlimited KV reads — more than enough for personal use.*
