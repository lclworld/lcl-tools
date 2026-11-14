# CEO App: standing rules for Claude Code

Read ceo/docs/BLUEPRINT.md before every task. It is the source of truth.

What this is
- A manager only PWA at lclworld.github.io/lcl-tools/ceo/ for the LCL Lab Manager.
- It replaces her own use of the separate apps. The employee apps stay unchanged.

Architecture
- Front end: ceo/ (index.html, manifest.json, service-worker.js, one JS file per section, loaded only when opened).
- Offline first, same pattern as lcl-tools/inventory: local cache plus a write queue that syncs on reconnect.
- CEO Hub: a new Apps Script web app (code in ceo/hub/). It holds every private key in Script Properties, sends client emails from lueurcosmeticslab@gmail.com, reads Gmail, talks to Zoho Invoice and Google Calendar, and serves the booking page data.
- Reading: the Hub reads each app through that app's own read actions, all fetched in parallel in one Hub call, so no app's rules (for example Inventory's stock maths) are copied. Sheet IDs sit in Script Properties for any later direct read where no read action exists.
- Writing: every change goes through the owning app's own backend action, so its rules still run. Never write straight into another app's Sheet.
- Existing backends: never change or remove an existing action. Only add new, clearly named manager actions, and list every addition in ceo/docs/BACKEND_CHANGES.md.
- The Hub keeps its own Sheet for order statuses, bookings, availability, salary records and email rules.

Security
- Google sign in limited to the owner's Google account, remembered per device.
- Manager PIN once per day after that.
- Login alert email on every login, the same as Inventory.
- No keys, Sheet IDs or URLs hardcoded in public files beyond the Hub URL.

Look
- LCL Classic: white background, text #2B1D17 and #5B4239, Urbanist for UI, Playfair Display for headings, outline buttons (never solid fills), full bleed on every device, real stroke icons (never emoji).
- One accent colour per section, from the blueprint's accent table (Option 1: Soft). Accents are used only on the section header band, icons, the active tab and status chips. Cards and content stay white.
- Text contrast at least 4.5 to 1. Touch targets at least 44px.

Calm rules (never break these)
- Home shows at most 5 items that need attention, plus See all.
- Each section opens on one summary screen with no more than 3 cards.
- One main button per card. Everything else sits behind a tap.
- Lists show 10 at a time.
- Empty sections hide from Home.
- Bottom bar: Home, Inbox, Orders, Work. Everything else opens from tiles on Home.

Client emails
- Every client email is previewed first and only sent when the manager taps Send.
- Order emails are signed: The Lueur Cosmetics Lab Team.
- Booking emails are signed: Kendra Asare, Brand Experience Manager.
- No phone numbers in sign offs.
- Time zone: Africa/Accra.

Working style
- Plan first and wait for approval before writing code.
- Build on existing code where it exists, rather than rewriting it.
- At the end of each phase, write ceo/docs/PHASE_<n>_TESTS.md with a short checklist the manager can tick on her phone.
