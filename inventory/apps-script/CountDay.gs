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
 *   Late Actions    — anything a phone sends after its Count Day was closed,
 *                     kept so nothing is lost (it doesn't change the count)
 *
 * Approved changes are NOT written to stock from here. The app sends them to
 * the main Inventory script (applyCountAdjustment), which owns stock.
 *
 * Entries, notes and decisions are only ever ADDED as new rows (appendRow),
 * which Google keeps safe when many phones write at once, so they don't
 * wait on the script lock. The newest row for an entry, note or decision is
 * the one that counts; a deleted entry gets a new row marked DELETED.
 * Only starting, submitting and closing a Count Day use the lock.
 */

const TABS = {
  SESSIONS: ['Count Sessions', ['SESSION ID', 'STATUS', 'STARTED BY', 'STARTED AT', 'SUBMITTED BY', 'SUBMITTED AT', 'CLOSED BY', 'CLOSED AT']],
  SNAPSHOT: ['Count Snapshot', ['SESSION ID', 'REF CODE', 'ITEM NAME', 'TYPE', 'RECORDED QTY']],
  ENTRIES: ['Count Entries', ['ENTRY ID', 'SESSION ID', 'REF CODE', 'ITEM NAME', 'TYPE', 'CONTAINER', 'CONTAINER WEIGHT', 'SCALE WEIGHT', 'QUANTITY', 'COUNTED BY', 'COUNTED AT', 'DELETED']],
  NOTES: ['Count Notes', ['SESSION ID', 'REF CODE', 'NOTE', 'BY', 'AT']],
  DECISIONS: ['Count Decisions', ['SESSION ID', 'REF CODE', 'ITEM NAME', 'DECISION', 'RECORDED QTY', 'COUNTED QTY', 'ADJUSTMENT', 'BY', 'AT']],
  LATE: ['Late Actions', ['RECEIVED AT', 'SESSION ID', 'ACTION', 'ITEM', 'QUANTITY', 'BY', 'DETAILS']]
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
  try {
    if (action === 'batch') return jsonOut_(batch_(p));
    return jsonOut_(run_(action, p));
  } catch (err) {
    return jsonOut_({ status: 'error', message: err.message });
  }
}

// Starting, submitting and closing change a shared row, so they take turns.
const LOCKED_ACTIONS = ['startSession', 'submitSession', 'closeSession'];

function run_(action, p) {
  if (LOCKED_ACTIONS.indexOf(action) === -1) return dispatch_(action, p);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(28000);
  } catch (err) {
    return { status: 'error', message: 'Busy, will retry' };
  }
  try {
    return dispatch_(action, p);
  } finally {
    lock.releaseLock();
  }
}

function dispatch_(action, p) {
  switch (action) {
    case 'startSession': return startSession_(p);
    case 'addEntry': return addEntry_(p);
    case 'deleteEntry': return deleteEntry_(p);
    case 'setNote': return setNote_(p);
    case 'submitSession': return setStatus_(p, 'submitted');
    case 'decide': return decide_(p);
    case 'closeSession': return setStatus_(p, 'closed');
    default: return { status: 'error', message: 'Unknown POST action: ' + action };
  }
}

// Many queued actions in one request; one result per action, in order.
// Entries, deletions, notes and decisions are turned into rows first and
// written with ONE call per tab (a row-by-row write of 25 actions took over
// a minute and the phone gave up). Start/submit/close still run one at a time.
function batch_(p) {
  const actions = typeof p.actions === 'string' ? JSON.parse(p.actions) : (p.actions || []);
  const results = [];
  let open = openSession_();
  let pending = { ENTRIES: [], NOTES: [], DECISIONS: [], LATE: [] };
  let pendingIdx = []; // which results are waiting to be written

  const flush = () => {
    if (!pendingIdx.length) return true;
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(28000);
    } catch (err) {
      return false;
    }
    try {
      Object.keys(pending).forEach(k => {
        const rows = pending[k];
        if (!rows.length) return;
        const sh = tab_(TABS[k]);
        sh.getRange(sh.getLastRow() + 1, 1, rows.length, TABS[k][1].length).setValues(rows);
      });
    } finally {
      lock.releaseLock();
    }
    pending = { ENTRIES: [], NOTES: [], DECISIONS: [], LATE: [] };
    pendingIdx = [];
    return true;
  };
  const lateRow = (action, q, item, qty) => [new Date(), q.sessionId || '', action, text_(item || ''),
    qty === undefined ? '' : qty, text_(q.by || ''), text_(JSON.stringify(q))];

  for (let i = 0; i < actions.length; i++) {
    const type = actions[i].type;
    const q = actions[i].payload || {};
    const isOpen = !!open && open.id === q.sessionId;
    try {
      if (type === 'addEntry') {
        if (isOpen) pending.ENTRIES.push([text_(q.id), q.sessionId, text_(q.code), text_(q.name), text_(q.type), text_(q.container),
          q.tare === null || q.tare === undefined ? '' : num_(q.tare),
          q.gross === null || q.gross === undefined ? '' : num_(q.gross),
          num_(q.qty), text_(q.by), q.at ? new Date(q.at) : new Date(), false]);
        else pending.LATE.push(lateRow('addEntry', q, q.name, num_(q.qty)));
      } else if (type === 'deleteEntry') {
        if (isOpen) pending.ENTRIES.push([text_(q.id), q.sessionId, '', '', '', '', '', '', 0, text_(q.by), new Date(), true]);
        else pending.LATE.push(lateRow('deleteEntry', q, q.id));
      } else if (type === 'setNote') {
        if (isOpen) pending.NOTES.push([q.sessionId, text_(q.code), text_(q.note), text_(q.by), new Date()]);
        else pending.LATE.push(lateRow('setNote', q, q.code));
      } else if (type === 'decide') {
        const items = typeof q.items === 'string' ? JSON.parse(q.items) : (q.items || []);
        if (isOpen) {
          const now = new Date();
          items.forEach(it => pending.DECISIONS.push([q.sessionId, text_(it.code), text_(it.name), text_(it.decision),
            num_(it.recorded), num_(it.counted), num_(it.adjustment), text_(q.by), now]));
        } else {
          pending.LATE.push(lateRow('decide', q, items.map(it => it.name + ': ' + it.decision).join(', ')));
        }
      } else {
        // start / submit / close: write everything before it first, then run it on its own.
        if (!flush()) { pendingIdx.forEach(j => { results[j] = { status: 'error', message: 'Busy, will retry' }; }); pendingIdx = []; break; }
        const r = run_(type, q);
        if (r.status !== 'ok') { results.push(r); break; }
        open = openSession_();
        results.push(r);
        continue;
      }
      pendingIdx.push(results.length);
      results.push({ status: 'ok' });
    } catch (err) {
      results.push({ status: 'error', message: err.message });
      break;
    }
  }
  if (!flush()) {
    // Nothing waiting to be written was saved: report those as not done so the phone resends them.
    pendingIdx.forEach(j => { results[j] = { status: 'error', message: 'Busy, will retry' }; });
  }
  return { status: 'ok', results: results };
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
  // Newest row per entry id wins; a DELETED row removes the entry.
  const latest = {};
  const order = [];
  rows_(TABS.ENTRIES).forEach(r => {
    if (String(r[1]) !== sid) return;
    const id = String(r[0]);
    if (!(id in latest)) order.push(id);
    latest[id] = r;
  });
  out.entries = order.map(id => latest[id])
    .filter(r => r[11] !== true && String(r[11]).toUpperCase() !== 'TRUE')
    .map(r => ({
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

function isOpen_(sessionId) {
  const open = openSession_();
  return !!open && open.id === sessionId;
}

// Something sent after its Count Day closed: kept here instead of lost.
function late_(action, p, item, qty) {
  tab_(TABS.LATE).appendRow([new Date(), p.sessionId || '', action, text_(item || ''),
    qty === undefined ? '' : qty, text_(p.by || ''), text_(JSON.stringify(p))]);
  return { status: 'ok', late: true };
}

// A retry of the same entry adds a duplicate row; getState keeps only the newest.
function addEntry_(p) {
  if (!isOpen_(p.sessionId)) return late_('addEntry', p, p.name, num_(p.qty));
  tab_(TABS.ENTRIES).appendRow([
    text_(p.id), p.sessionId, text_(p.code), text_(p.name), text_(p.type), text_(p.container),
    p.tare === null || p.tare === undefined ? '' : num_(p.tare),
    p.gross === null || p.gross === undefined ? '' : num_(p.gross),
    num_(p.qty), text_(p.by), p.at ? new Date(p.at) : new Date(), false
  ]);
  return { status: 'ok' };
}

function deleteEntry_(p) {
  if (!isOpen_(p.sessionId)) return late_('deleteEntry', p, p.id);
  tab_(TABS.ENTRIES).appendRow([text_(p.id), p.sessionId, '', '', '', '', '', '', 0, text_(p.by), new Date(), true]);
  return { status: 'ok' };
}

function setNote_(p) {
  if (!isOpen_(p.sessionId)) return late_('setNote', p, p.code);
  tab_(TABS.NOTES).appendRow([p.sessionId, text_(p.code), text_(p.note), text_(p.by), new Date()]);
  return { status: 'ok' };
}

// decisions: approved (stock set to the count), kept (record unchanged), recount
function decide_(p) {
  const items = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || []);
  if (!isOpen_(p.sessionId)) return late_('decide', p, items.map(i => i.name + ': ' + i.decision).join(', '));
  const now = new Date();
  const sh = tab_(TABS.DECISIONS);
  items.forEach(i => {
    sh.appendRow([p.sessionId, text_(i.code), text_(i.name), text_(i.decision),
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
