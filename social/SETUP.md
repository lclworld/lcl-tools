# LCL Social Planner: setup

Live page: https://lclworld.github.io/lcl-tools/social/
PINs: team 2505, manager 2635 (same as LCL Inventory).

## 1. Create the backend (about 5 minutes)
1. In Google Drive, create a new Google Sheet named **LCL Social Planner**.
2. In the Sheet: **Extensions > Apps Script**.
3. Delete the starter code, paste everything from `apps-script/Code.gs`, save.
4. In the function dropdown pick **setup**, press **Run**, and approve the permissions.
   This creates the tabs (Posts, Settings, Activity Log, Login Log) and a Drive folder
   called **LCL Social Planner Images**.
5. **Deploy > New deployment > Web app**
   * Execute as: **Me**
   * Who has access: **Anyone**
6. Copy the URL ending in `/exec`.

## 2. Connect the app
Either:
* **Every device at once (recommended):** paste the URL into `const SCRIPT_URL = "";` near the
  top of the script in `social/index.html`, then bump `CACHE_NAME` in `service-worker.js`.
* **Per device:** open the page, paste the URL on the Connect screen. The device remembers it.

## 3. Day to day
* Settings tab in the Sheet holds the Goals, Pillars and Platforms lists. Edit them there.
* Posts are archived, never deleted. Restore from Manager.
* Analytics columns (Reach, Saves, Shares, Enquiries) are hidden in the Posts tab, reserved for phase two.

## 4. When you change Code.gs later
Deploy > Manage deployments > edit (pencil) > Version: **New version** > Deploy.
This keeps the same URL so the app does not need updating.
