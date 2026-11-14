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

## If a phone is lost
Open the *LCL CEO Hub* Sheet, delete that phone's row in the Devices tab, and
change the PIN. The phone has to sign in with Google again.
