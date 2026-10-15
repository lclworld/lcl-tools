/**
 * LCL Inventory — Count Day backend (Google Apps Script)
 * Deploy this attached to the separate "LCL Count Day" Google Sheet, NOT the
 * Master Items Sheet. Every phone sends its count entries here, so all
 * company devices share one live count.
 *
 * Tabs (created automatically the first time they're needed):
 *   Count Sessions  — one row per Count Day: who started, submitted, closed it
 *   Count Snapshot  — the recorded stock frozen the moment a Count Day starts
 *   Count Entries   — every weighing / count, one row each (deleted ones kept, marked)
 *   Count Notes     — the employee's explanation for each discrepancy
 *   Count Decisions — the manager's audit decision for each item
 *
 * Approved changes are NOT written to stock from here. The app sends them to
 * the main Inventory script (applyCountAdjustment), which owns stock.
 */

const TABS = {
  SESSIONS: ['Count Sessions', ['SESSION ID', 'STATUS', 'STARTED BY', 'STARTED AT', 'SUBMITTED BY', 'SUBMITTED AT', 'CLOSED BY', 'CLOSED AT']],
  SNAPSHOT: ['Count Snapshot', ['SESSION ID', 'REF CODE', 'ITEM NAME', 'TYPE', 'RECORDED QTY']],
  ENTRIES: ['Count Entries', ['ENTRY ID', 'SESSION ID', 'REF CODE', 'ITEM NAME', 'TYPE', 'CONTAINER', 'CONTAINER WEIGHT', 'SCALE WEIGHT', 'QUANTITY', 'COUNTED BY', 'COUNTED AT', 'DELETED']],
  NOTES: ['Count Notes', ['SESSION ID', 'REF CODE', 'NOTE', 'BY', 'AT']],
  DECISIONS: ['Count Decisions', ['SESSION ID', 'REF CODE', 'ITEM NAME', 'DECISION', 'RECORDED QTY', 'COUNTED QTY', 'ADJUSTMENT', 'BY', 'AT']]
};

function tab_(def) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(def[0]);
  if (!sh) {
    sh = ss.insertSheet(def[0]);
    sh.appendRow(def[1]);
  }
  return sh;
}

// All rows below the header, as arrays.
function rows_(def) {
  const sh = tab_(def);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, def[1].length).getValues();
}

function appendRows_(def, rows) {
  if (!rows.length) return;
  const sh = tab_(def);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, def[1].length).setValues(rows);
}

// Update the first row whose key columns match, or append it. Returns true if updated.
function upsert_(def, keyCols, row) {
  const sh = tab_(def);
  const data = rows_(def);
  for (let r = 0; r < data.length; r++) {
    if (keyCols.every(c => String(data[r][c]) === String(row[c]))) {
      sh.getRange(r + 2, 1, 1, def[1].length).setValues([row]);
      return true;
    }
  }
  appendRows_(def, [row]);
  return false;
}

// Typed text that starts with = + - @ would otherwise be run as a formula.
function text_(v) {
  const s = String(v === undefined || v === null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function num_(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function iso_(v) {
  return v instanceof Date ? v.toISOString() : (v || '');
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- GET: read the current Count Day ----------
function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === 'getState') return jsonOut_(getState_());
    return jsonOut_({ status: 'error', message: 'Unknown GET action: ' + action });
  } catch (err) {
    return jsonOut_({ status: 'error', message: err.message });
  }
}

// ---------- POST: everything that writes ----------
function doPost(e) {
  const action = e.parameter.action;
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { /* no body */ }

  // Several phones write at once on Count Day; one at a time keeps upserts
  // from overwriting each other.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return jsonOut_({ status: 'error', message: 'Busy, will retry' });
  }
  try {
    let result;
    switch (action) {
      case 'startSession': result = startSession_(p); break;
      case 'addEntry': result = addEntry_(p); break;
      case 'deleteEntry': result = deleteEntry_(p); break;
      case 'setNote': result = setNote_(p); break;
      case 'submitSession': result = setStatus_(p, 'submitted'); break;
      case 'decide': result = decide_(p); break;
      case 'closeSession': result = setStatus_(p, 'closed'); break;
      default: result = { status: 'error', message: 'Unknown POST action: ' + action };
    }
    return jsonOut_(result);
  } catch (err) {
    return jsonOut_({ status: 'error', message: err.message });
  } finally {
    lock.releaseLock();
  }
}

function sessions_() {
  return rows_(TABS.SESSIONS).filter(r => r[0]).map(r => ({
    id: String(r[0]), status: String(r[1]),
    startedBy: r[2], startedAt: iso_(r[3]),
    submittedBy: r[4], submittedAt: iso_(r[5]),
    closedBy: r[6], closedAt: iso_(r[7])
  }));
}
function openSession_() {
  const open = sessions_().filter(s => s.status !== 'closed');
  return open.length ? open[open.length - 1] : null;
}

function getState_() {
  const all = sessions_();
  const closed = all.filter(s => s.status === 'closed');
  const session = openSession_();
  const out = { status: 'ok', session: session, lastClosed: closed.length ? closed[closed.length - 1] : null };
  if (!session) return out;
  const sid = session.id;
  out.snapshot = rows_(TABS.SNAPSHOT).filter(r => String(r[0]) === sid).map(r => ({
    code: String(r[1]), name: String(r[2]), type: String(r[3]), recorded: num_(r[4])
  }));
  out.entries = rows_(TABS.ENTRIES).filter(r => String(r[1]) === sid && r[11] !== true && String(r[11]).toUpperCase() !== 'TRUE').map(r => ({
    id: String(r[0]), code: String(r[2]), name: String(r[3]), type: String(r[4]),
    container: String(r[5]), tare: num_(r[6]), gross: r[7] === '' ? null : num_(r[7]),
    qty: num_(r[8]), by: String(r[9]), at: iso_(r[10])
  }));
  out.notes = rows_(TABS.NOTES).filter(r => String(r[0]) === sid).map(r => ({
    code: String(r[1]), note: String(r[2]), by: String(r[3]), at: iso_(r[4])
  }));
  out.decisions = rows_(TABS.DECISIONS).filter(r => String(r[0]) === sid).map(r => ({
    code: String(r[1]), decision: String(r[3]), recorded: num_(r[4]), counted: num_(r[5]),
    adjustment: num_(r[6]), by: String(r[7]), at: iso_(r[8])
  }));
  return out;
}

// Freezes the recorded stock the app sends. Only one Count Day can be open.
function startSession_(p) {
  const open = openSession_();
  if (open) {
    if (open.id === p.sessionId) return { status: 'ok', sessionId: open.id }; // retry of the same start
    return { status: 'error', message: 'A Count Day is already running (started by ' + open.startedBy + '). Close it before starting a new one.' };
  }
  const items = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || []);
  if (!p.sessionId || !items.length) return { status: 'error', message: 'Nothing to count' };
  appendRows_(TABS.SNAPSHOT, items.map(i => [p.sessionId, text_(i.code), text_(i.name), text_(i.type), num_(i.recorded)]));
  appendRows_(TABS.SESSIONS, [[p.sessionId, 'open', text_(p.by), new Date(), '', '', '', '']]);
  return { status: 'ok', sessionId: p.sessionId };
}

function requireOpen_(sessionId) {
  const open = openSession_();
  if (!open || open.id !== sessionId) throw new Error('This Count Day has been closed');
  return open;
}

// Same entry id sent twice (a retry) updates the row instead of adding a second one.
function addEntry_(p) {
  requireOpen_(p.sessionId);
  upsert_(TABS.ENTRIES, [0], [
    text_(p.id), p.sessionId, text_(p.code), text_(p.name), text_(p.type), text_(p.container),
    p.tare === null || p.tare === undefined ? '' : num_(p.tare),
    p.gross === null || p.gross === undefined ? '' : num_(p.gross),
    num_(p.qty), text_(p.by), p.at ? new Date(p.at) : new Date(), false
  ]);
  return { status: 'ok' };
}

function deleteEntry_(p) {
  const sh = tab_(TABS.ENTRIES);
  const data = rows_(TABS.ENTRIES);
  for (let r = 0; r < data.length; r++) {
    if (String(data[r][0]) === String(p.id)) {
      requireOpen_(String(data[r][1]));
      sh.getRange(r + 2, 12).setValue(true);
      return { status: 'ok' };
    }
  }
  return { status: 'ok' }; // never reached the sheet, nothing to delete
}

function setNote_(p) {
  requireOpen_(p.sessionId);
  upsert_(TABS.NOTES, [0, 1], [p.sessionId, text_(p.code), text_(p.note), text_(p.by), new Date()]);
  return { status: 'ok' };
}

// decisions: approved (stock set to the count), kept (record unchanged), recount
function decide_(p) {
  requireOpen_(p.sessionId);
  const items = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || []);
  const now = new Date();
  items.forEach(i => {
    upsert_(TABS.DECISIONS, [0, 1], [p.sessionId, text_(i.code), text_(i.name), text_(i.decision),
      num_(i.recorded), num_(i.counted), num_(i.adjustment), text_(p.by), now]);
  });
  return { status: 'ok' };
}

function setStatus_(p, status) {
  const sh = tab_(TABS.SESSIONS);
  const data = rows_(TABS.SESSIONS);
  for (let r = 0; r < data.length; r++) {
    if (String(data[r][0]) === String(p.sessionId)) {
      if (String(data[r][1]) === 'closed') return { status: 'ok' }; // already closed
      const col = status === 'submitted' ? 5 : 7;
      // Submitting never reopens or undoes a close; closing always wins.
      sh.getRange(r + 2, 2).setValue(status);
      sh.getRange(r + 2, col, 1, 2).setValues([[text_(p.by), new Date()]]);
      return { status: 'ok' };
    }
  }
  return { status: 'error', message: 'Count Day not found' };
}
