/**
 * LCL Inventory — Backend (Google Apps Script)
 * Deploy this attached to your Master Items Google Sheet.
 * Tabs: Master Items, Use Log, Restock Log, Current Inventory, Login Log.
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
      default: return jsonOut_({ status: 'error', message: 'Unknown POST action: ' + action });
    }
    if (actionId && action !== 'login' && result && result.status === 'ok') {
      markProcessed_(actionId);
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

  return { status: 'ok', ingredients: ingredients, containers: [] };
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
function logRestock_(p) {
  const entries = JSON.parse(p.entries);
  const sh = sheet_(SHEET_NAMES.RESTOCK_LOG);
  entries.forEach(e => {
    if (String(e.qc).toLowerCase() === 'rejected') return; // failed QC never logged as restock
    sh.appendRow([e.name, e.code, e.qty, e.date, e.qc, e.loggedBy || '']);
  });
  return { status: 'ok' };
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
      restockSheet.appendRow([p.name, code, p.firstRestockQty, new Date(), p.firstRestockQC || 'Passed', p.loggedBy || '']);
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
