/**
 * LCL CEO Hub (Google Apps Script web app)
 *
 * The one backend the CEO App talks to. It:
 *  - signs the owner in (Google ID token, checked here) and checks the daily PIN
 *  - reads Inventory and Operations Centre through their own read actions,
 *    all at once, so Home loads in one call from the phone
 *  - forwards every change to the owning app's own backend action, so that
 *    app's rules still run. It never writes into another app's Sheet.
 *  - keeps its own Sheet (Devices, Login Log, Processed Actions)
 *
 * Nothing private lives in this file. Every link, ID and the PIN live in
 * Script Properties (see SETUP.md). Deploy: Execute as Me, access Anyone.
 *
 * Request pattern (same as Inventory and Operations Centre):
 *   GET  ?action=config            -> public, returns the Google Client ID
 *   POST body {action, token, ...} -> JSON, sent as text/plain (no CORS preflight)
 */

var TZ = 'Africa/Accra';
var DEVICE_DAYS = 180;          // "Remember this device" lasts this long
var MAX_PIN_TRIES = 5;          // then the device is locked for LOCK_MINUTES
var LOCK_MINUTES = 15;

// Changes the CEO App may send to each app. Only existing actions, nothing new.
var ALLOWED_WRITES = {
  inventory: ['excludeFromLowStock', 'clearLowStockExclusion', 'markDiscontinued', 'clearDiscontinued'],
  ops: ['respondDirectorAttention', 'createTask', 'updateTask', 'updateProduction',
        'updateDelivery', 'updatePurchase', 'updateCalendarEvent']
};

// ---------------------------------------------------------------- entry points

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'config') {
    return json_({ status: 'ok', clientId: prop_('OAUTH_CLIENT_ID') || '' });
  }
  if (action === 'ping') return json_({ status: 'ok', message: 'CEO Hub is running' });
  // Public: the booking page's free slots.
  if (action === 'slots') {
    try { return json_(publicSlots_()); } catch (err) { return json_({ status: 'error', message: 'Booking is not available right now.' }); }
  }
  return json_({ status: 'error', message: 'Unknown action' });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  try {
    switch (body.action) {
      case 'signIn': return json_(signIn_(body));
      case 'unlock': return json_(unlock_(body));
      case 'book': return json_(publicBook_(body));   // public booking page
    }
    var device = requireSession_(body.token);
    if (device.error) return json_(device.error);
    switch (body.action) {
      case 'bundle': return json_(bundle_());
      case 'write': return json_(write_(body));
      case 'signOut': return json_(signOut_(device));
      case 'docsGet': return json_(docsGet_());
      case 'docSet': return json_(docSet_(body));
      case 'docUpdate': return json_(docUpdate_(body));
      // Phase 2: Inbox
      case 'inboxList': return json_(inboxList_());
      case 'inboxThread': return json_(inboxThread_(body));
      case 'inboxReply': return json_(inboxReply_(body));
      case 'inboxMove': return json_(inboxMove_(body));
      // Phase 2: Orders
      case 'ordersList': return json_(ordersList_(body));
      case 'orderDetail': return json_(orderDetail_(body));
      case 'orderPreview': return json_(orderPreview_(body));
      case 'orderSetStatus': return json_(orderSetStatus_(body));
      // Phase 3: Bookings
      case 'bookingsGet': return json_(Object.assign({ status: 'ok' }, bookingsSummary_()));
      case 'setAvailability': return json_(setAvailability_(body));
      default: return json_({ status: 'error', message: 'Unknown action: ' + body.action });
    }
  } catch (err) {
    return json_({ status: 'error', message: String(err && err.message || err) });
  }
}

// ---------------------------------------------------------------- sign in

function signIn_(body) {
  var clientId = prop_('OAUTH_CLIENT_ID');
  var owner = String(prop_('OWNER_EMAIL') || '').toLowerCase();
  if (!clientId || !owner) return { status: 'error', message: 'The Hub is not set up yet (OAUTH_CLIENT_ID, OWNER_EMAIL).' };

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(body.idToken || ''),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { status: 'error', code: 'SIGNIN', message: 'Google sign in could not be checked. Try again.' };
  var info = JSON.parse(res.getContentText());
  var email = String(info.email || '').toLowerCase();
  var ok = info.aud === clientId && email === owner &&
           (info.email_verified === true || info.email_verified === 'true') &&
           Number(info.exp) * 1000 > Date.now();
  if (!ok) {
    logLogin_(email || 'unknown', body.device, 'Refused: not the owner account');
    return { status: 'error', code: 'SIGNIN', message: 'This Google account cannot open the CEO App.' };
  }

  var token = Utilities.getUuid() + Utilities.getUuid();
  var sh = hubSheet_('Devices');
  var now = new Date();
  var expires = new Date(now.getTime() + (body.remember === false ? 1 : DEVICE_DAYS) * 86400000);
  // TOKEN HASH, DEVICE, CREATED, EXPIRES, LAST SEEN, PIN DAY, FAILED TRIES, LOCKED UNTIL
  sh.appendRow([hash_(token), String(body.device || 'Unknown device').slice(0, 120), now, expires, now, '', 0, '']);
  logLogin_(email, body.device, 'Google sign in');
  return { status: 'ok', token: token, name: info.given_name || info.name || '' };
}

function unlock_(body) {
  var row = findDevice_(body.token);
  if (!row) return { status: 'error', code: 'SIGNIN', message: 'Please sign in with Google again.' };
  var sh = hubSheet_('Devices');
  var r = row.rowNumber;
  var lockedUntil = row.values[7];
  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
    return { status: 'error', code: 'LOCKED', message: 'Too many wrong PINs. Try again after ' +
      Utilities.formatDate(new Date(lockedUntil), TZ, 'h:mm a') + '.' };
  }
  var pinHash = prop_('PIN_HASH');
  if (!pinHash) return { status: 'error', message: 'The manager PIN is not set in the Hub yet.' };

  if (hash_(String(body.pin || '')) !== pinHash) {
    var tries = Number(row.values[6] || 0) + 1;
    sh.getRange(r, 7).setValue(tries >= MAX_PIN_TRIES ? 0 : tries);
    if (tries >= MAX_PIN_TRIES) {
      sh.getRange(r, 8).setValue(new Date(Date.now() + LOCK_MINUTES * 60000));
      sendAlert_('CEO App locked after wrong PINs', 'Someone entered the wrong manager PIN ' + MAX_PIN_TRIES +
        ' times on "' + row.values[1] + '". The device is locked for ' + LOCK_MINUTES + ' minutes.');
    }
    logLogin_('', row.values[1], 'Wrong PIN');
    return { status: 'error', code: 'PIN', message: 'Incorrect PIN', triesLeft: Math.max(0, MAX_PIN_TRIES - tries) };
  }

  var today = today_();
  sh.getRange(r, 5, 1, 4).setValues([[new Date(), today, 0, '']]);
  var where = body.location ? String(body.location).slice(0, 80) : 'Location not shared';
  logLogin_(prop_('OWNER_EMAIL'), row.values[1], 'Unlocked with PIN · ' + where);
  sendAlert_('CEO App login', 'The CEO App was opened.\n\nDevice: ' + row.values[1] +
    '\nWhen: ' + Utilities.formatDate(new Date(), TZ, 'EEE d MMM yyyy, h:mm a') + ' (Accra)' +
    '\nWhere: ' + where + '\n\nIf this was not you, open the Hub Sheet, delete this device from the Devices tab and change the PIN.');
  return { status: 'ok', day: today };
}

function signOut_(device) {
  hubSheet_('Devices').deleteRow(device.rowNumber);
  return { status: 'ok' };
}

// Every call after sign in: the device must be known, not expired, and the
// PIN must have been entered today (Accra time).
function requireSession_(token) {
  var row = findDevice_(token);
  if (!row) return { error: { status: 'error', code: 'SIGNIN', message: 'Please sign in with Google again.' } };
  if (String(row.values[5]) !== today_()) return { error: { status: 'error', code: 'PIN', message: 'Enter your PIN.' } };
  return row;
}

function findDevice_(token) {
  if (!token) return null;
  var sh = hubSheet_('Devices');
  var last = sh.getLastRow();
  if (last < 2) return null;
  var h = hash_(token);
  var values = sh.getRange(2, 1, last - 1, 8).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === h) {
      if (values[i][3] && new Date(values[i][3]).getTime() < Date.now()) {
        sh.deleteRow(i + 2);
        return null;
      }
      values[i][5] = values[i][5] instanceof Date ? Utilities.formatDate(values[i][5], TZ, 'yyyy-MM-dd') : values[i][5];
      return { rowNumber: i + 2, values: values[i] };
    }
  }
  return null;
}

// ---------------------------------------------------------------- reading

// Everything Home and Work need, fetched from both apps in parallel.
function bundle_() {
  var inv = prop_('INVENTORY_URL'), ops = prop_('OPS_URL');
  var calls = [
    ['inventory', 'getIngredients', inv], ['inventory', 'getProductionData', inv],
    ['ops', 'getDirectorAttention', ops], ['ops', 'getTasks', ops], ['ops', 'getProduction', ops],
    ['ops', 'getDeliveries', ops], ['ops', 'getPurchases', ops], ['ops', 'getCalendar', ops]
  ].filter(function (c) { return c[2]; });

  var responses = UrlFetchApp.fetchAll(calls.map(function (c) {
    return { url: c[2] + '?action=' + c[1], muteHttpExceptions: true, followRedirects: true };
  }));

  var out = { status: 'ok', today: today_(), serverTime: new Date().toISOString(), errors: [] };
  // The Hub's own data for Home: inbox counts, orders, bookings.
  try { out.inbox = inboxSummary_(); } catch (err) { out.errors.push('inbox: ' + err.message); }
  try { out.orders = ordersSummary_(); } catch (err) { out.errors.push('orders: ' + err.message); }
  try { out.bookings = bookingsSummary_(); } catch (err) { out.errors.push('bookings: ' + err.message); }
  responses.forEach(function (res, i) {
    var name = calls[i][1];
    var data;
    try { data = JSON.parse(res.getContentText()); } catch (err) { data = { status: 'error', message: 'Not JSON (HTTP ' + res.getResponseCode() + ')' }; }
    if (data.status !== 'ok') { out.errors.push(calls[i][0] + ' ' + name + ': ' + (data.message || 'failed')); return; }
    switch (name) {
      case 'getIngredients':
        out.ingredients = (data.ingredients || []).map(function (x) {
          return { code: x.code, name: x.name, type: x.type, category: x.category, func: x.func, qty: x.qty,
                   moq: x.moq, lowStockExcluded: !!x.lowStockExcluded, discontinued: !!x.discontinued, lastUpdated: x.lastUpdated };
        });
        break;
      case 'getProductionData':
        out.batches = (data.batches || []).map(function (b) {
          return { id: b.id, name: b.name, batchSize: b.batchSize, status: b.status, pushedAt: b.pushedAt };
        });
        break;
      case 'getDirectorAttention': out.attention = live_(data.items); break;
      case 'getTasks': out.tasks = live_(data.tasks); break;
      case 'getProduction': out.production = live_(data.records); break;
      case 'getDeliveries': out.deliveries = live_(data.deliveries); break;
      case 'getPurchases': out.purchases = live_(data.purchases); break;
      case 'getCalendar': out.calendar = live_(data.events); break;
    }
  });
  return out;
}

function live_(rows) {
  return (rows || []).filter(function (r) { return r.archived !== 'Yes'; });
}

// ---------------------------------------------------------------- writing

// Forwards one change to the owning app's own backend. Each change carries
// an actionId from the phone, so a retry after a dropped connection is
// never written twice.
function write_(body) {
  var app = body.app, action = body.writeAction, payload = body.payload || {};
  if (!ALLOWED_WRITES[app] || ALLOWED_WRITES[app].indexOf(action) < 0) {
    return { status: 'error', message: 'Not allowed: ' + app + ' ' + action };
  }
  var actionId = String(body.actionId || '');
  if (actionId && alreadyDone_(actionId)) return { status: 'ok', duplicate: true };

  var url = prop_(app === 'inventory' ? 'INVENTORY_URL' : 'OPS_URL');
  if (!url) return { status: 'error', message: 'The Hub has no link for ' + app + ' yet.' };
  if (app === 'ops') {
    var who = prop_('OWNER_NAME') || 'Efua';
    payload.updatedBy = payload.updatedBy || who;
    payload.respondedBy = payload.respondedBy || who;
    payload.createdBy = payload.createdBy || who;
    payload.tier = 'Manager';
  } else {
    payload.actionId = actionId; // Inventory has its own duplicate check too
  }
  var q = '?action=' + encodeURIComponent(action) + (payload.code ? '&code=' + encodeURIComponent(payload.code) : '');
  var res = UrlFetchApp.fetch(url + q, {
    method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify(payload),
    muteHttpExceptions: true, followRedirects: true
  });
  var data;
  try { data = JSON.parse(res.getContentText()); } catch (err) {
    return { status: 'error', retry: true, message: 'The ' + app + ' backend did not answer properly. It will retry.' };
  }
  if (data.status === 'ok' && actionId) markDone_(actionId);
  return data;
}

function alreadyDone_(id) {
  var sh = hubSheet_('Processed Actions');
  return !!sh.createTextFinder(id).matchEntireCell(true).findNext();
}
function markDone_(id) {
  hubSheet_('Processed Actions').appendRow([id, new Date()]);
}

// ---------------------------------------------------------------- Quote Generator storage
// The Quote Generator (ceo/quotes.html) keeps its quotes, price book and
// settings here: one row per document, JSON split across columns because a
// Sheet cell holds at most 50,000 characters.

var DOC_PATH = /^(quotes\/q\d{1,7}|book\/main|settings\/main)$/;
var CHUNK = 45000;

function docsGet_() {
  var sh = hubSheet_('Quote Docs');
  var last = sh.getLastRow();
  var docs = [];
  if (last >= 2) {
    var values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    values.forEach(function (r) {
      if (!r[0]) return;
      try { docs.push({ path: String(r[0]), data: JSON.parse(r.slice(2).join('')) }); } catch (err) {}
    });
  }
  return { status: 'ok', docs: docs };
}

function docSet_(body) {
  if (!DOC_PATH.test(String(body.path || ''))) return { status: 'error', message: 'Not allowed: ' + body.path };
  saveDoc_(body.path, body.data || {});
  return { status: 'ok' };
}

function docUpdate_(body) {
  if (!DOC_PATH.test(String(body.path || ''))) return { status: 'error', message: 'Not allowed: ' + body.path };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var row = findDocRow_(body.path);
    var current = row ? JSON.parse(row.values.slice(2).join('')) : {};
    var patch = body.patch || {};
    Object.keys(patch).forEach(function (k) { current[k] = patch[k]; });
    saveDoc_(body.path, current, row);
  } finally { lock.releaseLock(); }
  return { status: 'ok' };
}

function findDocRow_(path) {
  var sh = hubSheet_('Quote Docs');
  var hit = sh.getRange('A:A').createTextFinder(path).matchEntireCell(true).findNext();
  if (!hit) return null;
  var r = hit.getRow();
  return { rowNumber: r, values: sh.getRange(r, 1, 1, sh.getLastColumn()).getValues()[0] };
}

function saveDoc_(path, data, knownRow) {
  var sh = hubSheet_('Quote Docs');
  var json = JSON.stringify(data);
  var chunks = [];
  // The leading apostrophe keeps each piece as plain text (never a formula or a number).
  for (var i = 0; i < json.length; i += CHUNK) chunks.push("'" + json.slice(i, i + CHUNK));
  if (!chunks.length) chunks.push("'{}");
  var row = knownRow || findDocRow_(path);
  var width = Math.max(sh.getLastColumn(), 2 + chunks.length);
  var line = [path, new Date()].concat(chunks);
  while (line.length < width) line.push('');
  if (row) sh.getRange(row.rowNumber, 1, 1, width).setValues([line]);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, width).setValues([line]);
}

// ---------------------------------------------------------------- Hub Sheet

var HUB_TABS = {
  'Devices': ['TOKEN HASH', 'DEVICE', 'CREATED', 'EXPIRES', 'LAST SEEN', 'PIN DAY', 'FAILED TRIES', 'LOCKED UNTIL'],
  'Login Log': ['DATE', 'ACCOUNT', 'DEVICE', 'EVENT'],
  'Processed Actions': ['ACTION ID', 'DATE'],
  'Quote Docs': ['PATH', 'UPDATED', 'JSON'],
  'Email Rules': ['MATCH (EMAIL OR @DOMAIN)', 'CATEGORY', 'ADDED', 'NOTE'],
  'Email Index': ['THREAD ID', 'MESSAGES', 'CATEGORY', 'SUMMARY', 'SOURCE', 'FROM', 'EMAIL', 'SUBJECT', 'DATE', 'UNREAD', 'UPDATED'],
  'Orders': ['KEY', 'SOURCE', 'NUMBER', 'CLIENT', 'EMAIL', 'AMOUNT', 'CURRENCY', 'PAID', 'PRODUCTS', 'STATUS', 'STATUS DATE', 'LAST UPDATE', 'HISTORY', 'REF'],
  'Availability': ['DATE', 'START', 'END'],
  'Bookings': ['ID', 'SLOT START', 'NAME', 'COMPANY', 'EMAIL', 'SERVICE', 'NOTE', 'EVENT ID', 'MEET', 'STATUS', 'CREATED', 'REMINDERS']
};

function hubSheet_(name) {
  var id = prop_('HUB_SHEET_ID');
  if (!id) throw new Error('Run setupHub() once in the Apps Script editor.');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HUB_TABS[name]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function logLogin_(account, device, event) {
  try { hubSheet_('Login Log').appendRow([new Date(), account || '', String(device || '').slice(0, 120), event]); } catch (err) {}
}

function sendAlert_(subject, text) {
  var to = prop_('ALERT_EMAIL') || prop_('OWNER_EMAIL');
  if (!to) return;
  try { MailApp.sendEmail({ to: to, subject: subject, body: text, name: 'LCL CEO App' }); } catch (err) {}
}

// ---------------------------------------------------------------- one-time setup

/**
 * Run once from the editor (Run > setupHub). Creates the Hub Sheet in your
 * Drive and asks for the Gmail, Drive and fetch permissions.
 */
function setupHub() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('HUB_SHEET_ID')) {
    var ss = SpreadsheetApp.create('LCL CEO Hub');
    props.setProperty('HUB_SHEET_ID', ss.getId());
    var first = ss.getSheets()[0];
    Object.keys(HUB_TABS).forEach(function (name) { hubSheet_(name); });
    ss.deleteSheet(first);
  }
  Logger.log('Hub Sheet: https://docs.google.com/spreadsheets/d/' + props.getProperty('HUB_SHEET_ID'));
  Logger.log('Properties set: ' + Object.keys(props.getProperties()).join(', '));
}

/**
 * Run once from the editor after adding Phase 2 and 3 (Run > installTriggers).
 * Sorts new mail every 10 minutes, sends call reminders every 5 minutes,
 * pulls paid orders every 30 minutes, and emails the Sunday availability
 * reminder at 8am on Sundays. Running it again replaces them, never doubles.
 */
function installTriggers() {
  var handlers = ['triggerInbox', 'triggerReminders', 'triggerOrders', 'triggerSunday'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('triggerInbox').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('triggerReminders').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('triggerOrders').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('triggerSunday').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(8).inTimezone(TZ).create();
  Logger.log('Timed jobs installed.');
}
function triggerInbox() { syncInbox_(20); }
function triggerReminders() { sendReminders_(); }
function triggerOrders() { refreshOrders_(); }
function triggerSunday() { sundayReminder_(); }

/**
 * To set or change the manager PIN: put the new PIN in Script Properties as
 * NEW_PIN, run setPin once. It is stored only as a hash and NEW_PIN is removed.
 */
function setPin() {
  var props = PropertiesService.getScriptProperties();
  var pin = props.getProperty('NEW_PIN');
  if (!pin || !/^\d{4,8}$/.test(pin)) throw new Error('Add NEW_PIN (4 to 8 digits) to Script Properties first.');
  props.setProperty('PIN_HASH', hash_(pin));
  props.deleteProperty('NEW_PIN');
  Logger.log('PIN saved.');
}

// ---------------------------------------------------------------- helpers

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function hash_(s) {
  var salt = prop_('HASH_SALT');
  if (!salt) { salt = Utilities.getUuid(); PropertiesService.getScriptProperties().setProperty('HASH_SALT', salt); }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + s)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
