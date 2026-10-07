# Memory

## Me
Pepe (josechain@gmail.com) — builds single-file HTML/React PWA apps hosted on GitHub Pages.

## Tech Stack Preferences
| What | Choice |
|------|--------|
| Frontend | Single-file HTML with compiled React 18 (no JSX transpiler, use `React.createElement`) |
| Hosting | GitHub Pages |
| Backend | Cloudflare Workers (free tier) + Cloudflare KV |
| Notifications | Web Push API + VAPID + Service Worker |
| Build style | Python patch scripts for exact-string replacement on large HTML files |

## Active Projects
| Name | What |
|------|------|
| **LB Planner** | Life & Business Planner 2026 — single HTML PWA at josechain-eng.github.io/lbplanner/ |

→ Details: @memory/projects/lb-planner.md

## Key Terms
| Term | Meaning |
|------|---------|
| **worker.js** | Cloudflare Worker — handles push, sync, alarm scheduling |
| **sw.js** | Service Worker — handles push events, SW-side timers, notifications |
| **VAPID** | Auth keys for Web Push — already generated, stored in worker.js |
| **syncKey** | Per-device secret key (e.g. `lbp_0mnvmyv9uh8wciya`) stored in localStorage |
| **LBP_KV** | Cloudflare KV namespace binding name (must match exactly) |
| **check()** | 30s interval in app that fires alarms when app is open |
| **scheduleAlarms** | Function that registers alarms with SW + Cloudflare on data change |
| **heads-up** | Android floating notification banner — requires PWA install or channel set to Urgent |

→ Full push notification knowledge: @memory/context/pwa-push-notifications.md

## Debugging Rule
**When sync or any runtime problem is reported: open the browser console FIRST.**
The console reveals the real cause immediately (CORS errors, network failures, JS exceptions)
instead of spending sessions guessing at code logic.
Steps:
1. F12 → Console tab (NOT Elements)
2. Hard-refresh (Cmd+Shift+R)
3. Reproduce the problem
4. Read the errors — they tell you exactly what's broken
Example: hours were spent on merge logic while the real issue was CORS errors blocking
every single worker request — visible in 2 seconds with the console open.
