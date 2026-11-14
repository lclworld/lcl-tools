# LCL CEO App Blueprint

Nov 14, 2026 · Dr Efua K. Dwamena · Version 2, updated with your feedback. Nothing built yet

## 1. The idea

One manager only app that replaces the separate apps you use yourself. Everything you used to do in those apps, you do here. The employee apps stay as they are for the team. Every change you make in the CEO App is written straight into the owning app's own backend, so the team sees it on their next sync.

**Golden rule: calm, never overwhelming.** Each screen shows only what needs you right now. Details open when you tap. Empty sections hide themselves.

## 2. What comes in

### Your apps (see and change everything)

| App | Becomes | How it syncs |
| --- | --- | --- |
| LCL Inventory (low stock, availability, Development Studio, price sheet) | Work > Inventory | Reads the Sheet, writes through Inventory's own backend |
| LCL Operations Centre (tasks, production, deliveries, purchasing, PIDs) | Work > Operations | Same pattern |
| Social Planner | Socials | Same pattern |
| Quote Generator | Clients > Quotes | Moved to GitHub + Sheet so quotes are saved and searchable |

### Tools (open inside the app)

| Tool | Note |
| --- | --- |
| Label Compliance Checker (LabOS) | Also linked from each label submission in Inbox |
| Import Cost Calculator | As it is today |
| Shipping Station | As it is today |
| Packaging Catalog Generator | As it is today |

### Connections

| Service | Used for |
| --- | --- |
| Gmail (lueurcosmeticslab@gmail.com) | Inbox, label submissions, InstaBrand order emails, client update emails |
| Zoho Invoice | Orders and Money |
| Google Calendar + Meet | Bookings, production calendar, payroll dates |
| Instagram | Socials (Claude via Composio still schedules) |

### Left out

Help Desk and LCL Gateway (for the team), Payslip Generator (replaced by the Salary Tracker), Iris and the Email Follow Up Assistant (no longer used), Weigh Calculator, label spec sheets, label content guide, Product Development Brief form, Capability Catalog, hospital tools, personal money apps, Order Center, D&D and LabOS storefront.

## 3. Layout

Bottom bar has four tabs: **Home, Inbox, Orders, Work**. Money, Clients, Socials, Bookings, Compliance, Toolbox and Strategy Room open from tiles on Home.

**How we keep it from feeling busy**

- Home shows at most 5 items that need you, with "See all" for the rest.
- Every section opens on one summary screen with no more than 3 cards.
- One main button per card. Everything else sits behind a tap.
- Lists show 10 at a time.
- Sections with nothing in them disappear from Home until something arrives.

## 4. Sections

### Home

- **Needs you:** up to 5 items, each with a one tap action (PID to approve, post to approve, label design to review, new InstaBrand order, quote close to the 48 hour promise).
- **Today:** production, calls booked, deliveries, payroll dates.
- **Sunday card:** "Set this week's availability" (see Bookings).
- **Search everything:** client, product code, ingredient, quote number, email.

### Inbox

Gmail sorted into categories, each with a one line summary of every email.

| Category | What lands there |
| --- | --- |
| New Inquiries | Prospects and website form leads |
| Clients | Existing clients |
| InstaBrand Orders | Order emails from InstaBrand, turned into order cards (see Orders) |
| Label Submissions | Label Studio submissions and client label emails, with a button to run the Label Compliance Checker |
| Suppliers | FSGH, Formulators Gh, Lotion Crafters, packaging suppliers |
| Team | Staff emails |
| Payments & Finance | Paystack, banks, Zoho |
| Regulatory | FDA and registration mail |
| Other | Everything else |

- **How sorting works:** rules first (known clients, supplier domains, staff), then AI sorts the rest. When you move an email to a different category, that sender is added to the rules.
- **Labels in Gmail too:** the same categories show up as Gmail labels.
- **Reply:** reply in the app, or open the email in Gmail.

### Orders (new)

One list of every paid order, from Zoho Invoice and InstaBrand, so clients are never left in silence after paying.

- **Tap a status and the client gets an email.** Each status sends a short branded email with the order number, signed The Lueur Cosmetics Lab Team.

| Status | Client email says |
| --- | --- |
| Order confirmed | Payment received, order confirmed, next step is your label design |
| Label received | Label received, your order is now in the production queue |
| In production | Your order is currently being processed |
| Quality check | Your products are going through final checks |
| Scheduled for pickup | Ready for pickup on (date) |
| Scheduled for delivery | Scheduled for delivery on (date) |
| Delivered | Delivered, with a short request for feedback |

- **Date picker:** pickup and delivery statuses ask you for the date before sending.
- **Preview first:** you see the email before it goes, with Send or Edit.
- **Silence alert:** an order with no update for 5 working days shows on Home, so nobody goes quiet.
- **Order cards:** client, products, amount, status history.

### Bookings (new, with a client facing page)

For complimentary discovery calls with you. These are the same as today's intro calls. Custom Formulation clients come first, but Private Label clients who want to understand the process can book too.

1. **Slot length:** 25 minutes, made up of 5 minutes prep, a 15 minute call and 5 minutes wrap up. The page says "15 minute call" and the calendar blocks the full 25.
2. **Sunday:** Home shows the availability card, and you also get a reminder. You tap the days you are free this week and add times for each day. The app cuts them into 25 minute slots.
3. **Client page:** a simple LCL branded page that only shows slots for the coming week. To book, the client gives their name, company, email, the service they want (Custom Formulation, Private Label, Other) and a short note on the product they have in mind. This keeps calls focused and puts off people who are only browsing.
4. **Fair use note on the page:** the first call is complimentary, and a missed or rescheduled call is charged GHS 300.
5. **When a client books:** the slot disappears for everyone else. A Calendar event with a Google Meet link is created, your personal email is added to the invite as today, and the client gets the confirmation email with the generic meeting invoice (fee shown as waived) attached. Reminders go out at 9am on the day, 1 hour before and 5 minutes before. Every booking email is signed Kendra Asare, Brand Experience Manager.
6. **Sharing:** your secretary sends the booking link to clients, so nobody has to go back and forth to agree a time.
7. **In the app:** Bookings shows the week's calls, who booked, their service and their note.

### Work

Production calendar, batches, push to production, PID approvals, deliveries, purchasing and tasks (Operations), plus low stock, availability, Development Studio and the price sheet (Inventory). Everything you do in those apps today.

### Clients

Quotes (the Quote Generator), plus a client card with contact details, quotes, orders, label submissions and emails in one place.

### Socials

Ideas, Draft, Approved, Scheduled, Posted. Approve from your phone. Analytics come later.

### Money

- **Zoho Invoice:** invoiced, paid, outstanding and overdue.
- **Salary Tracker:** each employee, pay date (mid month or end of month), amount, paid or not yet paid. Home reminds you two days before each pay date.
- **Project Spend Tracker:** what each project earned against what it cost, so you can check your pricing.

### Compliance

FDA registration tracker, BMR audit tracker, plus SOPs and role manuals with their version numbers. Label reviews live in Inbox.

### Toolbox

Label Compliance Checker, Import Cost Calculator, Shipping Station, Packaging Catalog Generator.

### Strategy Room

Monthly trends (revenue, profit per project, turnaround days, inquiries that became paying clients), capacity and the Friday review.

## 5. Under the hood

- **Front end:** one offline capable app at lclworld.github.io/lcl-tools/ceo/, built like Inventory. Each section loads only when you open it.
- **CEO Hub:** its own Apps Script on the LCL Google account. It keeps the Zoho and AI keys on the server, sends the client emails from lueurcosmeticslab@gmail.com and runs the booking page.
- **Reading:** the Hub reads each app's Sheet directly, so Home loads in one call.
- **Writing:** every change goes through the owning app's own backend, so that app's rules still run.
- **Order statuses** are saved in the Hub's own Sheet, linked to the Zoho invoice or InstaBrand order number.
- **Fix first:** production batches must sync from the backend across devices.

## 6. Sign in

Google sign in limited to your account, done once per device with "Remember this device". After that, the manager PIN once a day. A login alert email works like Inventory's.

## 7. Built for speed

- **7am Daily Brief** in the app and by email.
- **One tap actions** with undo.
- **Smart reminders:** the 48 hour quote promise, the label return window, orders with no update, pay dates, and Sunday availability.
- **Friday weekly review.**

## 8. Look: LCL Classic with a colour per section

Base stays LCL Classic: white background, brown #5B4239 text, Urbanist + Playfair Display, outline buttons, full bleed. Each section gets its own accent, used only on its header band, icons, active tab and status chips. Cards and content stay white, so colour helps you know where you are without getting in the way.

| Section | Option 1: Soft | Option 2: Rich |
| --- | --- | --- |
| Home | Orange #FF914D | Orange #F2762E |
| Inbox | Sky #6FA8DC | Ocean #2F6FA3 |
| Orders | Sage #7FB48E | Forest #2E7D52 |
| Work | Clay #B08968 | Brown #5B4239 |
| Money | Butter #F2C94C | Gold #C99A06 |
| Clients | Peach #F4A988 | Terracotta #C8553D |
| Socials | Rose #E79AAE | Berry #B83B6B |
| Bookings | Lilac #B9A3D9 | Plum #6B4C8A |
| Compliance | Mint #8CCFC4 | Teal #1F7F78 |
| Strategy Room | Slate #9AA5B1 | Charcoal #3E4752 |

**Settled: Option 1 (Soft).**

## 9. Build phases

| Phase | What ships |
| --- | --- |
| 1 Foundation | Sign in, Hub, Home, Work (Inventory + Operations), Toolbox |
| 2 Inbox + Orders | Gmail sorting, label submissions, InstaBrand order cards, Zoho orders with status emails |
| 3 Bookings | Sunday availability, client booking page, Calendar + Meet, confirmation emails |
| 4 Clients + Socials | Quote Generator moved in, client cards, planner approvals |
| 5 Money + Compliance | Zoho summary, Salary Tracker, Project Spend Tracker, FDA and BMR trackers |
| 6 Strategy Room | Trends, capacity, Friday review |

## 10. Decisions

**Settled**

1. **Booking:** a 25 minute slot (5 minutes prep, 15 minute call, 5 minutes wrap up). It is the same call as today's intro call.
2. **Who can book:** open to every service. The service and project note fields plus the fair use note protect your time.
3. **Booking email sign off:** Kendra Asare, Brand Experience Manager.
4. **Order emails:** always previewed first, then you tap Send, so a status tapped by mistake never reaches a client.
5. **Tabs:** Home, Inbox, Orders, Work, with Money as a tile.
6. **Accent set:** Option 1 Soft.

**Still open**

1. **InstaBrand subject line:** you will send it once Larnis confirms. It is built as a setting, so adding it later needs no rebuild.

## Quick glance

1. One calm app that replaces your own use of the separate apps. Each screen shows only what needs you.
2. Coming in: Inventory, Operations, Social Planner, Quote Generator, four tools, Gmail, Zoho, Calendar and Instagram.
3. New: Orders with previewed client update emails, a Sunday availability booking page (25 minute slots, signed by Kendra), a Salary Tracker and label submissions in Inbox.
4. Sign in with Google once per device, then a PIN once a day.
5. LCL Classic look with a soft accent colour per section.
6. Only one thing left: the InstaBrand subject line.
