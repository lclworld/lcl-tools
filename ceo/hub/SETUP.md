# CEO Hub: setup

The Hub is the CEO App's own Apps Script backend. Do this once, signed in to
Google as **lueurcosmeticslab@gmail.com** (client emails and login alerts are
sent from the account that deploys it).

## 1. Create the project
1. Go to script.google.com and click **New project**. Name it `LCL CEO Hub`.
2. Delete what is in `Code.gs` and paste in everything from `ceo/hub/Code.gs`.
3. Project Settings (gear icon): set the time zone to **(GMT+00:00) Accra**.

## 2. Add the Script Properties
Project Settings > Script Properties > Add script property. Values are sent to
you in the chat, never stored in GitHub.

| Property | What it is |
| --- | --- |
| OWNER_EMAIL | The Google account allowed to sign in |
| OWNER_NAME | Your name as the team sees it in Operations Centre (Efua) |
| ALERT_EMAIL | Where login alerts go (optional, defaults to OWNER_EMAIL) |
| OAUTH_CLIENT_ID | The Google Client ID (ends in .apps.googleusercontent.com) |
| INVENTORY_URL | Inventory's Web App URL |
| OPS_URL | Operations Centre's Web App URL |
| SOCIAL_URL | Social Planner's Web App URL (used from Phase 4) |
| INVENTORY_SHEET_ID, OPS_SHEET_ID, SOCIAL_SHEET_ID | The three Sheet IDs |
| NEW_PIN | Your manager PIN, 4 to 8 digits. It is removed once saved. |

## 3. Run the two setup functions
1. Pick **setupHub** in the function menu and click **Run**. Approve the
   permissions it asks for. It creates a Sheet called *LCL CEO Hub* in Drive.
2. Pick **setPin** and click **Run**. Your PIN is now stored only as a scrambled
   code, and NEW_PIN disappears from the list.

To change the PIN later: add NEW_PIN again and run setPin.

## 4. Deploy
Deploy > New deployment > type **Web app**. Execute as **Me**, Who has access
**Anyone**. Copy the Web App URL and send it over: it goes into `ceo/config.js`.

After any later change to `Code.gs`: Deploy > Manage deployments > edit (pencil)
> Version: **New version** > Deploy. That keeps the same URL.

## Quote Generator
Quotes, the price book and the Quote Generator's settings are saved in the
*Quote Docs* tab of the Hub Sheet (created on its own the first time).
Don't edit that tab by hand: each row is one saved document.

## Phase 2 and 3: Inbox, Orders and Bookings
The Hub is now four files. In the Apps Script project, keep `Code.gs` and add
three more script files (Files, +, Script) with these exact names, pasting each
from `ceo/hub/`: `Inbox`, `Orders`, `Bookings`.

1. **Calendar API (for Google Meet links):** Services (+ next to Services),
   pick **Google Calendar API**, Add.
2. **Script Properties to add:**

| Property | What it is |
| --- | --- |
| ANTHROPIC_API_KEY | From console.anthropic.com. Sorts and summarises email. |
| ANTHROPIC_MODEL | Optional. Leave it out to use claude-opus-5-5. |
| ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_GRANT_CODE | From api-console.zoho.com, Self Client (see *Connecting Zoho* below). zohoConnect turns the grant code into ZOHO_REFRESH_TOKEN and fills in ZOHO_ORG_ID. |
| ZOHO_DOMAIN | Optional. `zoho.com` unless your Zoho account is on another region (zoho.eu, zoho.in…) |
| INSTABRAND_SUBJECT | The InstaBrand order email subject, once Larnis confirms it. Empty until then. |
| PERSONAL_EMAIL | Your personal email, invited to every discovery call |
| MEETING_INVOICE_FILE_ID | Upload the generic meeting invoice PDF to Drive, open it, and copy the ID from its link (between /d/ and /view) |
| TEAM_EMAILS | Optional. Staff emails, comma separated, so their mail sorts into Team |
| SUPPLIER_DOMAINS | Optional. Supplier domains, comma separated (for example fsgh.com), so their mail sorts into Suppliers |

3. **Run `installTriggers` once** and approve the Gmail, Calendar and Drive
   permissions. It sorts new mail every 10 minutes, sends call reminders every
   5 minutes, pulls paid orders every 30 minutes and emails you on Sunday
   mornings if the week's call times are not set.
4. **Redeploy:** Deploy > Manage deployments > edit > New version > Deploy.

The booking page for clients is **lclworld.github.io/lcl-tools/ceo/book/**.

## Connecting Zoho Invoice (read only)
1. Go to **api-console.zoho.com** signed in to the Zoho account that has your
   invoices. Click **Add Client**, choose **Self Client**, then **Create**.
2. On the **Client Secret** tab, copy the Client ID and Client Secret into
   Script Properties as ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.
3. On the **Generate Code** tab, paste this as the scope:
   `ZohoInvoice.invoices.READ,ZohoInvoice.contacts.READ,ZohoInvoice.settings.READ`
   Time duration: 10 minutes. Description: CEO App. Click **Create** and copy the code.
4. Straight away, add it to Script Properties as ZOHO_GRANT_CODE, then run
   **zohoConnect**. The log lists your organization and says the paid invoices
   were pulled in.

If your Zoho address is not invoice.zoho.com (for example invoice.zoho.eu),
add ZOHO_DOMAIN with that ending (zoho.eu) before running zohoConnect.

## If a phone is lost
Open the *LCL CEO Hub* Sheet, delete that phone's row in the Devices tab, and
change the PIN. The phone has to sign in with Google again.
