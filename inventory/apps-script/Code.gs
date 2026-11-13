/**
 * LCL Inventory — Backend (Google Apps Script)
 * Deploy this attached to your Master Items Google Sheet.
 * Tabs: Master Items, Use Log, Restock Log, Current Inventory, Login Log,
 * Count Adjustments (approved Count Day changes).
 * Pricing (cost per kg, shipping) lives directly on Master Items — there is
 * no separate Master Pricing tab. There is no Actual Measurement tab either;
 * the Weigh Calculator logs straight to Use Log like every other usage event.
 */

const SHEET_NAMES = {
  ITEMS: 'Master Items',
  USE_LOG: 'Use Log',
  RESTOCK_LOG: 'Restock Log',
  CURRENT_INV: 'Current Inventory',
  LOGIN_LOG: 'Login Log'
};

// Header rows used only if a tab has to be auto-created because it's
// missing or was renamed. This is the fix for restock entries silently
// failing to write: before, a missing/renamed tab made appendRow() throw,
// the frontend's own optimistic local update masked that failure, so the
// app looked correct while the real Sheet got nothing. Now the tab gets
// created on the spot instead of failing.
const SHEET_HEADERS = {
  'Use Log': ['ITEM NAME', 'REF CODE', 'QUANTITY USED', 'DATE', 'PURPOSE', 'LOGGED BY'],
  'Restock Log': ['ITEM NAME', 'REF CODE', 'QUANTITY RESTOCKED', 'DATE', 'QC PASS/FAIL', 'LOGGED BY'],
  'Login Log': ['USER', 'LOCATION', 'DATE']
};

function ss_() {
  const s = SpreadsheetApp.getActiveSpreadsheet();
  try {
    if (s.getSpreadsheetTimeZone() !== 'Etc/GMT') s.setSpreadsheetTimeZone('Etc/GMT');
  } catch (err) {
    // Never let a timezone-setting hiccup take down every single request —
    // this runs on every call, so a failure here used to mean total sync
    // failure across the whole app. Worst case now: dates display in
    // whatever timezone the sheet already has, nothing else breaks.
  }
  return s;
}
function sheet_(name) {
  let sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    if (SHEET_HEADERS[name]) sh.appendRow(SHEET_HEADERS[name]);
  }
  return sh;
}

function getProductionData_() {
  const readSheet = (name, mapRow) => {
    const sh = ss_().getSheetByName(name);
    if (!sh) return [];
    const data = sh.getDataRange().getValues();
    const out = [];
    for (let r = 1; r < data.length; r++) {
      if (!data[r][0]) continue;
      out.push(mapRow(data[r]));
    }
    return out;
  };
  const plans = readSheet('Planning Records', row => ({
    id: row[0], name: row[1], batchSize: row[2], notes: row[3],
    rows: JSON.parse(row[4] || '[]'), savedAt: row[5]
  }));
  const batches = readSheet('Production Batches', row => ({
    id: row[0], name: row[1], batchSize: row[2], notes: row[3],
    rows: JSON.parse(row[4] || '[]'), status: row[5], pushedAt: row[6]
  }));
  return { status: 'ok', plans: plans, batches: batches };
}

// ---------- getLogs: every Use Log and Restock Log row, for the monthly reports ----------
// Kept compact (arrays, not objects) since it's the whole history. Dates go
// out as ISO text; undated rows go out blank and count as opening stock.
function getLogs_() {
  const iso = v => v instanceof Date ? v.toISOString() : String(v || '');
  const use = [];
  sheet_(SHEET_NAMES.USE_LOG).getDataRange().getValues().slice(1).forEach(r => {
    if (r[1]) use.push([r[1], Number(r[2]) || 0, iso(r[3]), String(r[4] || ''), String(r[5] || '')]);
  });
  const rsh = sheet_(SHEET_NAMES.RESTOCK_LOG);
  const cols = verificationCols_(rsh, false);
  const restock = [];
  rsh.getDataRange().getValues().slice(1).forEach(r => {
    if (r[1]) restock.push([r[1], parseFloat(r[2]) || 0, iso(r[3]), String(r[4] || ''), String(r[5] || ''), cols ? String(r[cols.status - 1] || '') : '']);
  });
  return { status: 'ok', use: use, restock: restock };
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- GET: read-only requests ----------
function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === 'getIngredients') return jsonOut_(getIngredients_());
    if (action === 'getProductionData') return jsonOut_(getProductionData_());
    if (action === 'getLogs') return jsonOut_(getLogs_());
    if (action === 'getProjects') return jsonOut_(getProjects_());
    if (action === 'getActivity') return jsonOut_(getActivity_());
    // These carry only a "code" field, small enough to also ride as a
    // URL parameter — so if Apps Script's own redirect handling ever turns
    // the POST into a GET, the action still succeeds instead of piling up
    // as a permanently-failing queued item.
    if (action === 'clearLowStockExclusion') return jsonOut_(clearLowStockExclusion_({ code: e.parameter.code }));
    if (action === 'excludeFromLowStock') return jsonOut_(excludeFromLowStock_({ code: e.parameter.code }));
    if (action === 'markDiscontinued') return jsonOut_(markDiscontinued_({ code: e.parameter.code }));
    if (action === 'clearDiscontinued') return jsonOut_(clearDiscontinued_({ code: e.parameter.code }));
    return jsonOut_({ status: 'error', message: 'Unknown GET action: ' + action });
  } catch (err) {
    return jsonOut_({ status: 'error', message: err.message });
  }
}

// ---------- POST: everything that writes data ----------
function doPost(e) {
  const action = e.parameter.action;
  let payload = {};
  try { payload = JSON.parse(e.postData.contents); } catch (err) { /* some actions send no body */ }

  try {
    // Idempotency: every queued action carries a unique actionId from the
    // device that created it. If the app never received confirmation of a
    // write (dropped response, flaky connection) it retries the same action
    // later. Without this check, that retry would write a second time even
    // though the first write already succeeded — the exact duplicate-usage
    // bug this fixes. Login has no meaningful "duplicate" concept and isn't
    // worth the extra sheet lookup, so it's excluded. This whole check now
    // lives inside the same try/catch as everything else — nothing here can
    // crash a request uncaught again.
    const actionId = payload.actionId;
    if (actionId && action !== 'login') {
      if (wasAlreadyProcessed_(actionId)) {
        return jsonOut_({ status: 'ok', duplicate: true });
      }
    }

    let result;
    switch (action) {
      case 'login': result = logLogin_(payload); break;
      case 'logUsage': result = logUsage_(payload); break;
      case 'logRestock': result = logRestock_(payload); break;
      case 'createIngredient': result = createIngredient_(payload); break;
      case 'excludeFromLowStock': result = excludeFromLowStock_(payload); break;
      case 'clearLowStockExclusion': result = clearLowStockExclusion_(payload); break;
      case 'markDiscontinued': result = markDiscontinued_(payload); break;
      case 'clearDiscontinued': result = clearDiscontinued_(payload); break;
      case 'logPointInventory': result = logPointInventory_(payload); break;
      case 'savePlanningRecord': result = savePlanningRecord_(payload); break;
      case 'pushToProduction': result = pushToProduction_(payload); break;
      case 'completeProductionBatch': result = completeProductionBatch_(payload); break;
      case 'applyCountAdjustment': result = applyCountAdjustment_(payload); break;
      case 'verifyRestock': result = verifyRestock_(payload); break;
      case 'saveProject': result = saveProject_(payload); break;
      case 'deleteProject': result = deleteProject_(payload); break;
      case 'saveSpendSettings': result = saveSpendSettings_(payload); break;
      case 'setItemCost': result = setItemCost_(payload); break;
      default: return jsonOut_({ status: 'error', message: 'Unknown POST action: ' + action });
    }
    if (actionId && action !== 'login' && result && result.status === 'ok') {
      markProcessed_(actionId);
    }
    if (result && result.status === 'ok' && !result.alreadyVerified) {
      try { logActivity_(action, payload, result); } catch (err) { /* the action itself already succeeded */ }
    }
    return jsonOut_(result);
  } catch (err) {
    return jsonOut_({ status: 'error', message: err.message });
  }
}

function wasAlreadyProcessed_(actionId) {
  try {
    const sh = getOrCreateSheet_('Processed Actions', ['ACTION ID', 'DATE']);
    if (sh.getLastRow() < 2) return false; // log is empty — nothing has been processed yet
    const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat();
    return ids.indexOf(actionId) !== -1;
  } catch (err) {
    // If this check itself ever fails for any reason, fail open — treat it
    // as "not a duplicate" rather than crashing the write entirely. A rare
    // duplicate row is a far smaller problem than every write silently
    // breaking, which is exactly what happened before this fix.
    return false;
  }
}
function markProcessed_(actionId) {
  try {
    const sh = getOrCreateSheet_('Processed Actions', ['ACTION ID', 'DATE']);
    sh.appendRow([actionId, new Date()]);
  } catch (err) {
    // Never let logging the dedup record itself break the response —
    // the actual write already succeeded by the time this runs.
  }
}


// ---------- getIngredients: the single source the app's cache is built from ----------
function getIngredients_() {
  const sh = sheet_(SHEET_NAMES.ITEMS);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => col[h] = i);

  const invSheet = sheet_(SHEET_NAMES.CURRENT_INV);
  const invData = invSheet.getDataRange().getValues();
  const invCol = {};
  invData[0].forEach((h, i) => invCol[h] = i);
  const availByCode = {};
  for (let r = 1; r < invData.length; r++) {
    availByCode[invData[r][invCol['REF CODE']]] = invData[r][invCol['AVAILABLE']];
  }

  // Last Updated is computed here, not read from a manually-maintained
  // column — it's the most recent date across Restock Log and Use Log for
  // that ref code, so it's always accurate to whatever's actually logged,
  // including any historical dates you've gone back and corrected.
  const lastUpdatedByCode = {};
  const trackLatest = (sheetName, codeCol, dateCol) => {
    const s = sheet_(sheetName);
    const d = s.getDataRange().getValues();
    for (let r = 1; r < d.length; r++) {
      const code = d[r][codeCol];
      const dateVal = d[r][dateCol];
      if (!code || !dateVal) continue;
      const t = new Date(dateVal).getTime();
      if (isNaN(t)) continue;
      if (!lastUpdatedByCode[code] || t > lastUpdatedByCode[code]) lastUpdatedByCode[code] = t;
    }
  };
  trackLatest(SHEET_NAMES.RESTOCK_LOG, 1, 3);
  trackLatest(SHEET_NAMES.USE_LOG, 1, 3);

  const ingredients = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const code = row[col['NEW REF CODE']];
    if (!code) continue;
    const rawCost = col['COST'] !== undefined ? row[col['COST']] : row[col['COST PER KG']];
    const rawShipping = row[col['SHIPPING COST']];
    const rawMoq = row[col['MOQ']];
    const moq = (rawMoq === '' || rawMoq === '-' || rawMoq === undefined || rawMoq === null) ? null : parseFloat(rawMoq);
    const notes = parseNotes_(row[col['NOTES']]);
    ingredients.push({
      code: code,
      category: code.replace(/[0-9]/g, ''),
      phase: row[col['PHASE']] || '',
      name: row[col['ITEM NAME']],
      type: row[col['TYPE']] || 'Ingredient',
      inci: row[col['INCI']] || '',
      func: row[col['FUNCTION / CATEGORY']] || '',
      storage: row[col['STORAGE LOCATION']] || '',
      minRate: row[col['MIN USAGE']] || '',
      maxRate: row[col['MAX USAGE']] || '',
      notes: notes.text,
      costPerKg: rawCost || 0,
      shipping: rawShipping || 0,
      moq: moq && !isNaN(moq) ? moq : null,
      qty: availByCode[code] !== undefined ? availByCode[code] : 0,
      lowStockExcluded: notes.markers.indexOf(MARKER_LOW_STOCK) !== -1,
      discontinued: notes.markers.indexOf(MARKER_DISCONTINUED) !== -1,
      lastUpdated: lastUpdatedByCode[code] ? new Date(lastUpdatedByCode[code]).toISOString() : null
    });
  }

  return { status: 'ok', ingredients: ingredients, containers: [], unverified: getUnverified_() };
}


// ---------- login: just an audit trail, doesn't touch inventory ----------
function logLogin_(p) {
  const sh = sheet_(SHEET_NAMES.LOGIN_LOG);
  sh.appendRow([p.user || '', p.location || '', new Date()]);
  return { status: 'ok' };
}

// ---------- logUsage: writes rows AND updates Current Inventory ----------
function logUsage_(p) {
  const entries = JSON.parse(p.entries);
  const sh = sheet_(SHEET_NAMES.USE_LOG);
  entries.forEach(e => {
    sh.appendRow([e.name, e.code, e.qty, e.date, e.purpose + (e.productCode ? ' — ' + e.productCode : ''), e.loggedBy || '']);
  });
  return { status: 'ok' };
  // Current Inventory tab already has SUMIF formulas against this log, so it
  // recalculates automatically — no separate write needed there.
}

// ---------- logRestock: writes rows, QC-failed items are never added ----------
// A restock still in the supplier's packaging is logged with the estimated
// quantity and marked UNVERIFIED in the VERIFICATION column, with its own id
// in RESTOCK ID, so verifyRestock can find it later from any device.
function logRestock_(p) {
  const entries = JSON.parse(p.entries);
  const sh = sheet_(SHEET_NAMES.RESTOCK_LOG);
  const cols = entries.some(e => e.unverified) ? verificationCols_(sh, true) : null;
  entries.forEach(e => {
    if (String(e.qc).toLowerCase() === 'rejected') return; // failed QC never logged as restock
    const row = [e.name, e.code, e.qty, e.date, e.qc, e.loggedBy || ''];
    if (e.paid !== undefined && e.paid !== '' && Number(e.qty) > 0) {
      setItemCost_({ code: e.code, paid: e.paid, delivery: e.delivery, qty: e.qty });
    }
    if (e.unverified) {
      while (row.length < cols.id) row.push('');
      row[cols.status - 1] = VERIFY_PENDING;
      row[cols.id - 1] = e.restockId || '';
    }
    sh.appendRow(row);
  });
  return { status: 'ok' };
}

// ---------- Unverified restocks ----------
const VERIFY_PENDING = 'UNVERIFIED';
// The two columns are found by header, and added after whatever columns
// the Restock Log already uses (older rows have numbers in column H).
// Returns 1-based column numbers, or null if they don't exist yet.
function verificationCols_(sh, create) {
  const width = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, width).getValues()[0];
  let status = headers.indexOf('VERIFICATION') + 1, id = headers.indexOf('RESTOCK ID') + 1;
  if (status && id) return { status: status, id: id };
  if (!create) return null;
  sh.getRange(1, width + 1, 1, 2).setValues([['VERIFICATION', 'RESTOCK ID']]);
  return { status: width + 1, id: width + 2 };
}
function getUnverified_() {
  const sh = sheet_(SHEET_NAMES.RESTOCK_LOG);
  const cols = verificationCols_(sh, false);
  if (!cols) return [];
  const d = sh.getDataRange().getValues();
  const out = [];
  for (let r = 1; r < d.length; r++) {
    if (d[r][cols.status - 1] !== VERIFY_PENDING) continue;
    const date = d[r][3] instanceof Date ? Utilities.formatDate(d[r][3], 'Etc/GMT', 'yyyy-MM-dd') : String(d[r][3]).slice(0, 10);
    out.push({ id: String(d[r][cols.id - 1]), name: d[r][0], code: d[r][1], qty: Number(d[r][2]) || 0, date: date, loggedBy: d[r][5] });
  }
  return out;
}
// The estimate comes back out through the Use Log, and the weighed amount
// (plus anything already used from the supplier pack before weighing) goes
// in as a verified restock. The original row is marked so it leaves the list.
function verifyRestock_(p) {
  const sh = sheet_(SHEET_NAMES.RESTOCK_LOG);
  const cols = verificationCols_(sh, false);
  if (!cols) return { status: 'ok', alreadyVerified: true };
  const d = sh.getDataRange().getValues();
  let r = 1;
  while (r < d.length && !(String(d[r][cols.id - 1]) === String(p.restockId) && d[r][cols.status - 1] === VERIFY_PENDING)) r++;
  if (r >= d.length) return { status: 'ok', alreadyVerified: true };
  const name = d[r][0], code = d[r][1], estimate = Number(d[r][2]) || 0;
  const actual = Number(p.actual), usedBefore = Number(p.usedBefore) || 0;
  if (isNaN(actual) || actual < 0) return { status: 'error', message: 'Verified weight is missing' };
  const now = new Date();
  sheet_(SHEET_NAMES.USE_LOG).appendRow([name, code, estimate, now, 'Previously unverified stock estimate', p.loggedBy || '']);
  const verified = [name, code, actual + usedBefore, now, 'Passed', p.loggedBy || ''];
  while (verified.length < cols.status) verified.push('');
  verified[cols.status - 1] = 'VERIFIED (estimate was ' + estimate + ' g)';
  sh.appendRow(verified);
  sh.getRange(r + 1, cols.status).setValue('VERIFIED ' + Utilities.formatDate(now, 'Etc/GMT', 'dd/MM/yyyy') + ' by ' + (p.loggedBy || '') +
    ' (' + (actual + usedBefore) + ' g)');
  return { status: 'ok', name: name, code: code, estimate: estimate };
}

// ---------- createIngredient: the "propagate everywhere" requirement ----------
// Builds a full row sized to the sheet's actual current headers, placing
// each value under its real header name rather than a fixed position. This
// is what makes writes safe even if columns get reordered or inserted later
// (like MOQ was) — nothing here assumes a column stays at a fixed letter.
function writeRowByHeader_(sheet, valuesByHeader) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (valuesByHeader[h] !== undefined ? valuesByHeader[h] : ''));
  sheet.appendRow(row);
}
function headerCol_(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(headerName);
  return idx === -1 ? null : idx + 1; // 1-based column number for getRange
}

function createIngredient_(p) {
  const itemsSheet = sheet_(SHEET_NAMES.ITEMS);
  const code = nextCode_(p.category);
  const isIngredient = (p.type || 'Ingredient') === 'Ingredient';

  // 1. Master Items — written by header name, not fixed position, so it's
  // safe regardless of column order. Ingredients get MOQ pre-filled at
  // 1000 (grams) per your rule; packaging leaves it blank for you to fill
  // in once you have a real supplier MOQ and cost.
  writeRowByHeader_(itemsSheet, {
    'NEW REF CODE': code,
    'ITEM NAME': p.name,
    'TYPE': p.type || 'Ingredient',
    'INCI': p.inci || '',
    'FUNCTION / CATEGORY': p.func || '',
    'MIN USAGE': p.minRate || '',
    'MAX USAGE': p.maxRate || '',
    'MOQ': isIngredient ? 1000 : '',
    'STORAGE LOCATION': p.storage || '',
    'NOTES': p.notes || ''
  });

  // 2. Current Inventory row, so it shows up with real availability immediately.
  // Open-ended ranges ($B$2:$B) keep counting however long the logs grow.
  const invSheet = sheet_(SHEET_NAMES.CURRENT_INV);
  const lastRow = invSheet.getLastRow() + 1;
  invSheet.appendRow([p.name, code, p.type || 'Ingredient',
    '=SUMIF(\'Restock Log\'!$B$2:$B,$B' + lastRow + ',\'Restock Log\'!$C$2:$C)',
    '=SUMIF(\'Use Log\'!$B$2:$B,$B' + lastRow + ',\'Use Log\'!$C$2:$C)',
    '=D' + lastRow + '-E' + lastRow]);

  // 4. First restock, if provided
  if (p.firstRestockQty) {
    const restockSheet = sheet_(SHEET_NAMES.RESTOCK_LOG);
    if (String(p.firstRestockQC).toLowerCase() !== 'rejected') {
      const row = [p.name, code, p.firstRestockQty, new Date(), p.firstRestockQC || 'Passed', p.loggedBy || ''];
      // Same as an unverified restock: verified later from the dashboard.
      if (p.firstRestockUnverified) {
        const cols = verificationCols_(restockSheet, true);
        while (row.length < cols.id) row.push('');
        row[cols.status - 1] = VERIFY_PENDING;
        row[cols.id - 1] = p.firstRestockId || '';
      }
      restockSheet.appendRow(row);
    }
  }

  return { status: 'ok', code: code };
}

function nextCode_(category) {
  const sh = sheet_(SHEET_NAMES.ITEMS);
  const data = sh.getDataRange().getValues();
  let max = 999;
  for (let r = 1; r < data.length; r++) {
    const code = data[r][0];
    if (code && code.indexOf(category) === 0) {
      const num = parseInt(code.replace(category, ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return category + (max + 1);
}

// ---------- Low-stock flags, stored at the start of an item's NOTES ----------
// NOTES can begin with flags, e.g. "DISCONTINUED | LOW STOCK EXCLUDED | real
// note text". Setting or clearing a flag keeps the rest of the note: before,
// Move to Normal replaced the whole note with "LOW STOCK EXCLUDED".
const MARKER_DISCONTINUED = 'DISCONTINUED';
const MARKER_LOW_STOCK = 'LOW STOCK EXCLUDED';
const MARKERS = [MARKER_DISCONTINUED, MARKER_LOW_STOCK];

function parseNotes_(raw) {
  let text = String(raw || '').trim();
  const markers = [];
  let found = true;
  while (found) {
    found = false;
    for (let i = 0; i < MARKERS.length; i++) {
      if (text.indexOf(MARKERS[i]) === 0) {
        if (markers.indexOf(MARKERS[i]) === -1) markers.push(MARKERS[i]);
        text = text.slice(MARKERS[i].length).replace(/^[\s|]+/, '');
        found = true;
      }
    }
  }
  return { markers: markers, text: text };
}

function setNotesMarker_(code, marker, on) {
  const sh = sheet_(SHEET_NAMES.ITEMS);
  const notesCol = headerCol_(sh, 'NOTES');
  if (!notesCol) return { status: 'error', message: 'NOTES column not found on Master Items' };
  const data = sh.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === code) {
      const notes = parseNotes_(data[r][notesCol - 1]);
      const markers = MARKERS.filter(m => m === marker ? on : notes.markers.indexOf(m) !== -1);
      const value = markers.concat(notes.text ? [notes.text] : []).join(' | ');
      sh.getRange(r + 1, notesCol).setValue(value);
      break;
    }
  }
  return { status: 'ok' };
}

// Move to Normal: hidden from Low Stock until restocked above threshold.
function excludeFromLowStock_(p) { return setNotesMarker_(p.code, MARKER_LOW_STOCK, true); }
// Auto-cleared by the app once stock is back above threshold.
function clearLowStockExclusion_(p) { return setNotesMarker_(p.code, MARKER_LOW_STOCK, false); }
// Discontinued: hidden from Low Stock and listed under Discontinued.
function markDiscontinued_(p) { return setNotesMarker_(p.code, MARKER_DISCONTINUED, true); }
function clearDiscontinued_(p) { return setNotesMarker_(p.code, MARKER_DISCONTINUED, false); }

// ---------- logPointInventory: pre/post weigh calculator ----------
function logPointInventory_(p) {
  logUsage_({ entries: JSON.stringify([{ name: p.name, code: p.code, qty: p.preWeight - p.postWeight, date: p.date, purpose: 'Weigh Calculator', loggedBy: p.loggedBy }]) });
  return { status: 'ok' };
}

// ---------- Planning records & production batches get their own tabs ----------
function getOrCreateSheet_(name, headers) {
  let sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    sh.appendRow(headers);
  }
  return sh;
}

function savePlanningRecord_(p) {
  const sh = getOrCreateSheet_('Planning Records', ['ID', 'NAME', 'BATCH SIZE', 'NOTES', 'ROWS (JSON)', 'SAVED AT']);
  sh.appendRow([p.id, p.name, p.batchSize, p.notes || '', JSON.stringify(p.rows), p.savedAt]);
  return { status: 'ok' };
}

function pushToProduction_(p) {
  const sh = getOrCreateSheet_('Production Batches', ['ID', 'NAME', 'BATCH SIZE', 'NOTES', 'ROWS (JSON)', 'STATUS', 'PUSHED AT']);
  sh.appendRow([p.id, p.name, p.batchSize, p.notes || '', JSON.stringify(p.rows), p.status, p.pushedAt]);
  return { status: 'ok' };
}

function completeProductionBatch_(p) {
  const sh = getOrCreateSheet_('Production Batches', ['ID', 'NAME', 'BATCH SIZE', 'NOTES', 'ROWS (JSON)', 'STATUS', 'PUSHED AT']);
  const data = sh.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === p.batchId) {
      sh.getRange(r + 1, 5).setValue(JSON.stringify(p.rows)); // updated rows with confirmed quantities
      sh.getRange(r + 1, 6).setValue('completed');
      break;
    }
  }
  return { status: 'ok' };
}

// ---------- Count Day: manager-approved stock count adjustments ----------
// Current Inventory is Restocks minus Usage (SUMIF formulas), so an approved
// count is applied as one Use Log row for the difference: positive when stock
// was missing, negative when more was found. Nothing about the existing
// formulas changes. Each change is also written to Count Adjustments so the
// before and after numbers and who approved them stay on record.
// adjustment = counted − recorded, where recorded is the stock frozen when
// that Count Day started, so usage logged during the count isn't lost.
function applyCountAdjustment_(p) {
  const items = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || []);
  if (!items.length) return { status: 'ok' };
  const now = new Date();
  const useRows = [];
  const auditRows = [];
  items.forEach(it => {
    const adj = Number(it.adjustment) || 0;
    if (Math.abs(adj) > 1e-9) {
      useRows.push([it.name, it.code, Math.round(-adj * 100) / 100, now,
        'Stock Count Adjustment — Count Day ' + (it.sessionId || ''), it.approvedBy || '']);
    }
    auditRows.push([it.sessionId || '', it.name, it.code, Number(it.recorded) || 0,
      Number(it.counted) || 0, Math.round(adj * 100) / 100, it.approvedBy || '', now]);
  });
  if (useRows.length) {
    const use = sheet_(SHEET_NAMES.USE_LOG);
    use.getRange(use.getLastRow() + 1, 1, useRows.length, 6).setValues(useRows);
  }
  const audit = getOrCreateSheet_('Count Adjustments',
    ['COUNT DAY', 'ITEM NAME', 'REF CODE', 'RECORDED', 'COUNTED', 'ADJUSTMENT', 'APPROVED BY', 'DATE']);
  audit.getRange(audit.getLastRow() + 1, 1, auditRows.length, 8).setValues(auditRows);
  return { status: 'ok' };
}


// ---------- Project Spend Tracker (manager only) ----------
// Each card is kept whole as JSON in Projects (the app's source of truth),
// with its spend lines also written out row by row in Spend Lines so they
// can be read in the Sheet. Running Costs holds the bills plus the tracker's
// settings; Item List holds the spend-line dropdown.
const PROJECT_HEADERS = ['ID', 'PRODUCT CODE', 'CLIENT', 'PRODUCT', 'PRODUCT TYPE', 'BATCH SIZE (g)', 'STATUS', 'MONEY IN', 'NET TAKE HOME', 'MARGIN %', 'UPDATED', 'CARD (JSON)'];
const SPEND_LINE_HEADERS = ['CARD ID', 'PRODUCT CODE', 'CLIENT', 'STAGE', 'ITEM', 'TYPE', 'STOCK ITEM', 'QUANTITY', 'AMOUNT (GHS)', 'EDITED', 'AUTO'];
const RUNNING_COST_HEADERS = ['NAME', 'AMOUNT (GHS)', 'FREQUENCY'];

function getProjects_() {
  const projects = [];
  const sh = getOrCreateSheet_('Projects', PROJECT_HEADERS);
  sh.getDataRange().getValues().slice(1).forEach(r => {
    if (!r[0]) return;
    try { projects.push(JSON.parse(r[11])); } catch (err) { /* a hand-edited JSON cell is skipped, not fatal */ }
  });
  const bills = [], settings = {};
  getOrCreateSheet_('Running Costs', RUNNING_COST_HEADERS).getDataRange().getValues().slice(1).forEach(r => {
    if (!r[0]) return;
    if (r[2] === 'setting') settings[r[0]] = r[1];
    else bills.push({ name: String(r[0]), amount: Number(r[1]) || 0, frequency: String(r[2] || 'monthly').toLowerCase() });
  });
  const items = getOrCreateSheet_('Item List', ['ITEM']).getDataRange().getValues().slice(1).map(r => String(r[0])).filter(Boolean);
  return { status: 'ok', projects: projects, bills: bills, settings: settings, items: items };
}

function saveProject_(p) {
  const card = typeof p.card === 'string' ? JSON.parse(p.card) : p.card;
  const sh = getOrCreateSheet_('Projects', PROJECT_HEADERS);
  const row = [card.id, card.productCode || '', card.client || '', card.product || '', card.productType || '', card.batchSize || '',
    card.status, card.summary ? card.summary.moneyIn : '', card.summary ? card.summary.net : '', card.summary ? card.summary.margin : '',
    new Date(), JSON.stringify(card)];
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  const at = ids.indexOf(String(card.id));
  if (at >= 0) sh.getRange(at + 2, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  writeSpendLines_(card);
  return { status: 'ok' };
}
function deleteProject_(p) {
  const sh = getOrCreateSheet_('Projects', PROJECT_HEADERS);
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  const at = ids.indexOf(String(p.id));
  if (at >= 0) sh.deleteRow(at + 2);
  writeSpendLines_({ id: p.id, lines: {} });
  return { status: 'ok' };
}
// Replaces this card's rows in Spend Lines with its current lines.
function writeSpendLines_(card) {
  const sh = getOrCreateSheet_('Spend Lines', SPEND_LINE_HEADERS);
  const data = sh.getDataRange().getValues();
  const keep = data.slice(1).filter(r => r[0] !== '' && String(r[0]) !== String(card.id));
  const mine = [];
  ['estimate', 'actual'].forEach(stage => {
    (((card.sheetLines || card.lines || {})[stage]) || []).forEach(l => {
      if (l.off) return;
      mine.push([card.id, card.productCode || '', card.client || '', stage, l.item || '', l.type || '', l.stockName || '', l.qty === undefined ? '' : l.qty,
        Number(l.amount) || 0, l.edited ? 'yes' : '', l.auto ? 'yes' : '']);
    });
  });
  const rows = keep.concat(mine);
  if (data.length > 1) sh.getRange(2, 1, data.length - 1, SPEND_LINE_HEADERS.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, SPEND_LINE_HEADERS.length).setValues(rows);
}

function saveSpendSettings_(p) {
  const bills = typeof p.bills === 'string' ? JSON.parse(p.bills) : (p.bills || []);
  const settings = typeof p.settings === 'string' ? JSON.parse(p.settings) : (p.settings || {});
  const items = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || []);
  const rc = getOrCreateSheet_('Running Costs', RUNNING_COST_HEADERS);
  const rows = bills.map(b => [b.name, Number(b.amount) || 0, b.frequency || 'monthly'])
    .concat(Object.keys(settings).map(k => [k, settings[k], 'setting']));
  replaceRows_(rc, RUNNING_COST_HEADERS.length, rows);
  replaceRows_(getOrCreateSheet_('Item List', ['ITEM']), 1, items.map(i => [i]));
  return { status: 'ok' };
}
function replaceRows_(sh, width, rows) {
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, width).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, width).setValues(rows);
}

// Stored unit cost is (COST + SHIPPING COST) ÷ MOQ on Master Items, so a
// purchase of qty for paid + delivery sets it to exactly that price.
function setItemCost_(p) {
  const sh = sheet_(SHEET_NAMES.ITEMS);
  const data = sh.getDataRange().getValues();
  const h = data[0];
  const cCode = h.indexOf('NEW REF CODE'), cCost = h.indexOf('COST') >= 0 ? h.indexOf('COST') : h.indexOf('COST PER KG'),
    cShip = h.indexOf('SHIPPING COST'), cMoq = h.indexOf('MOQ');
  const qty = Number(p.qty);
  if (cCost < 0 || cMoq < 0 || !(qty > 0)) return { status: 'error', message: 'Master Items needs COST and MOQ columns, and a quantity' };
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][cCode]) !== String(p.code)) continue;
    sh.getRange(r + 1, cCost + 1).setValue(Number(p.paid) || 0);
    if (cShip >= 0) sh.getRange(r + 1, cShip + 1).setValue(Number(p.delivery) || 0);
    sh.getRange(r + 1, cMoq + 1).setValue(qty);
    return { status: 'ok' };
  }
  return { status: 'ok', notFound: true };
}


// ---------- Activity log (last 7 days, shown to everyone) ----------
// One row per thing someone did, with the time it was done on the phone (it
// may reach the Sheet later if the phone was offline) and who did it.
const ACTIVITY_HEADERS = ['TIME', 'WHO', 'ACTION', 'ITEM', 'REF CODE', 'QUANTITY', 'DETAIL'];
const ACTIVITY_DAYS = 7;
function logActivity_(action, p, result) {
  const at = p.at ? new Date(p.at) : new Date();
  const who = p.by || p.loggedBy || '';
  const rows = [];
  const add = (act, item, code, qty, detail, by) => rows.push([at, who || by || '', act, item || '', code || '', qty === undefined ? '' : qty, detail || '']);
  if (action === 'logUsage') {
    JSON.parse(p.entries).forEach(e => add('Used', e.name, e.code, Number(e.qty), e.purpose + (e.productCode ? ' — ' + e.productCode : ''), e.loggedBy));
  } else if (action === 'logRestock') {
    JSON.parse(p.entries).forEach(e => add('Restocked', e.name, e.code, Number(e.qty),
      String(e.qc).toLowerCase() === 'rejected' ? 'Rejected at QC, not added' : (e.unverified ? 'Unverified (estimate)' : '') + (e.paid !== undefined && e.paid !== '' ? (e.unverified ? ' · ' : '') + 'Paid GHS ' + e.paid + (e.delivery ? ' + ' + e.delivery + ' delivery' : '') : ''), e.loggedBy));
  } else if (action === 'verifyRestock') {
    add('Verified', result.name, result.code, Number(p.actual) + (Number(p.usedBefore) || 0), 'Estimate was ' + result.estimate + (Number(p.usedBefore) ? ' · ' + p.usedBefore + ' already used' : ''));
  } else if (action === 'createIngredient') {
    add('Added new item', p.name, result.code || p.code, p.firstRestockQty ? Number(p.firstRestockQty) : '', (p.type || 'Ingredient') + (p.firstRestockUnverified ? ' · first restock unverified' : ''));
  } else if (action === 'pushToProduction') {
    add('Pushed to production', p.name, p.productCode, Number(p.batchSize), p.brief && p.brief.batchType ? p.brief.batchType + ' batch' : '');
  } else if (action === 'completeProductionBatch') {
    add('Completed batch', p.name || '', p.productCode || '', '', p.alreadyLogged ? 'Marked already logged' : '');
  } else if (action === 'excludeFromLowStock') {
    add('Moved to normal', p.name, p.code, '', 'Taken off Low Stock');
  } else if (action === 'markDiscontinued') {
    add('Marked discontinued', p.name, p.code, '', '');
  } else if (action === 'clearDiscontinued' && p.undo) {
    add('Undid discontinued', p.name, p.code, '', '');
  }
  if (!rows.length) return;
  const sh = getOrCreateSheet_('Activity', ACTIVITY_HEADERS);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, ACTIVITY_HEADERS.length).setValues(rows);
}

// The last 7 days. Before the Activity tab existed, usage and restocks are
// read from the Use Log and Restock Log instead (who and exact time may be missing there).
function getActivity_() {
  const since = Date.now() - ACTIVITY_DAYS * 86400000;
  const iso = v => v instanceof Date ? v.toISOString() : String(v || '');
  const out = [];
  const act = getOrCreateSheet_('Activity', ACTIVITY_HEADERS).getDataRange().getValues().slice(1).filter(r => r[0] !== '');
  let first = Infinity;
  act.forEach(r => {
    const t = new Date(r[0]).getTime();
    if (!isNaN(t) && t < first) first = t;
    if (t >= since) out.push({ at: iso(r[0]), by: String(r[1] || ''), action: String(r[2]), item: String(r[3] || ''), code: String(r[4] || ''), qty: r[5], detail: String(r[6] || '') });
  });
  const firstDay = first === Infinity ? '9999' : new Date(first).toISOString().slice(0, 10);
  // Anything the Activity tab already has (same item and amount, within 5 minutes) isn't added again.
  const already = (code, qty, t) => out.some(a => a.code === String(code) && Number(a.qty) === Number(qty) && Math.abs(Date.parse(a.at) - t) < 300000);
  const older = (sheetName, actionName, detailCol, statusCol) => {
    sheet_(sheetName).getDataRange().getValues().slice(1).forEach(r => {
      if (!r[1] || !r[3]) return;
      const t = new Date(r[3]).getTime();
      const dateOnly = r[3] instanceof Date ? (r[3].getUTCHours() === 0 && r[3].getUTCMinutes() === 0 && r[3].getUTCSeconds() === 0) : !/T\d/.test(String(r[3]));
      // Entries from before the Activity tab started. A timed entry counts up
      // to the minute the tab started; a date-only one (most restocks) only
      // for days before that day.
      if (isNaN(t) || t < since || (dateOnly ? new Date(t).toISOString().slice(0, 10) >= firstDay : t >= first)) return;
      if (!dateOnly && already(r[1], r[2], t)) return;
      const detail = String(r[detailCol] || '');
      if (/^Stock Count Adjustment|^Previously unverified stock estimate/.test(detail)) return;
      const status = statusCol !== null ? String(r[statusCol] || '') : '';
      const verified = /^VERIFIED \(estimate was ([\d.]+)/.exec(status);
      out.push({ at: iso(r[3]), by: String(r[5] || ''), action: verified ? 'Verified' : actionName, item: String(r[0]), code: String(r[1]), qty: r[2],
        detail: actionName === 'Used' ? detail : verified ? 'Estimate was ' + verified[1] : status === 'UNVERIFIED' ? 'Unverified (estimate)' : '', dateOnly: dateOnly });
    });
  };
  older(SHEET_NAMES.USE_LOG, 'Used', 4, null);
  const vcols = verificationCols_(sheet_(SHEET_NAMES.RESTOCK_LOG), false);
  older(SHEET_NAMES.RESTOCK_LOG, 'Restocked', 4, vcols ? vcols.status - 1 : null);
  // A blank name (sent by a phone on an older version of the app) is taken
  // from the matching Use Log or Restock Log row, logged within 5 minutes.
  const blanks = out.filter(r => !r.by && (r.action === 'Used' || r.action === 'Restocked'));
  if (blanks.length) {
    const byCode = {};
    [SHEET_NAMES.USE_LOG, SHEET_NAMES.RESTOCK_LOG].forEach(n => sheet_(n).getDataRange().getValues().slice(1).forEach(r => {
      if (r[1] && r[5]) (byCode[r[1]] = byCode[r[1]] || []).push([new Date(r[3]).getTime(), String(r[5])]);
    }));
    blanks.forEach(r => {
      const t = Date.parse(r.at);
      const m = (byCode[r.code] || []).find(x => Math.abs(x[0] - t) < 300000);
      if (m) r.by = m[1];
    });
  }
  out.sort((a, b) => b.at < a.at ? -1 : b.at > a.at ? 1 : 0);
  return { status: 'ok', days: ACTIVITY_DAYS, activity: out };
}
