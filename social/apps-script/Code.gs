/**
 * LCL Social Planner backend
 * Google Sheet = database. This script = the API the app talks to.
 *
 * First time: run setup() once from the editor (Run > setup), approve the
 * permissions, then Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone). Copy the /exec URL into the app.
 */

const SHEETS = {
  POSTS: 'Posts',
  SETTINGS: 'Settings',
  ACTIVITY: 'Activity Log',
  LOGIN: 'Login Log'
};

// Column order of the Posts tab. Analytics columns are reserved for phase two.
const POST_COLS = [
  'ID', 'Brand', 'Title', 'Status', 'Platform', 'Planned Date', 'Planned Time',
  'Caption', 'Goal', 'Pillar', 'Image URL', 'Image ID', 'Notes', 'Archived',
  'Created', 'Last Edited', 'Edited By',
  'Reach', 'Saves', 'Shares', 'Enquiries', 'Objective'
];

const DEFAULT_SETTINGS = {
  Goals: ['Educate', 'Build trust', 'Get enquiries', 'Community', 'Sell'],
  Pillars: ['Formulation education', 'Starting a brand', 'Behind the lab', 'Client wins'],
  Platforms: ['Instagram', 'TikTok', 'LinkedIn', 'Facebook']
};

const IMAGE_FOLDER_NAME = 'LCL Social Planner Images';

// ---------- one time setup ----------
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let posts = ss.getSheetByName(SHEETS.POSTS) || ss.insertSheet(SHEETS.POSTS);
  if (posts.getLastRow() === 0) {
    posts.appendRow(POST_COLS);
    posts.setFrozenRows(1);
    posts.getRange(1, 1, 1, POST_COLS.length).setFontWeight('bold').setBackground('#FFDE59');
    // Keep date and time as plain text so Sheets never reformats them.
    posts.getRange('F:G').setNumberFormat('@');
    // Analytics columns hidden until phase two.
    posts.hideColumns(POST_COLS.indexOf('Reach') + 1, 4);
    // Objective (column V) stays visible after the hidden analytics columns.
  }

  let settings = ss.getSheetByName(SHEETS.SETTINGS) || ss.insertSheet(SHEETS.SETTINGS);
  if (settings.getLastRow() === 0) {
    const keys = Object.keys(DEFAULT_SETTINGS);
    settings.appendRow(keys);
    settings.getRange(1, 1, 1, keys.length).setFontWeight('bold').setBackground('#FFDE59');
    const max = Math.max.apply(null, keys.map(k => DEFAULT_SETTINGS[k].length));
    for (let i = 0; i < max; i++) settings.appendRow(keys.map(k => DEFAULT_SETTINGS[k][i] || ''));
    settings.setFrozenRows(1);
  }

  let activity = ss.getSheetByName(SHEETS.ACTIVITY) || ss.insertSheet(SHEETS.ACTIVITY);
  if (activity.getLastRow() === 0) {
    activity.appendRow(['Timestamp', 'Action', 'Post ID', 'Title', 'Detail', 'By', 'Action ID']);
    activity.setFrozenRows(1);
    activity.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#FFDE59');
  }

  let login = ss.getSheetByName(SHEETS.LOGIN) || ss.insertSheet(SHEETS.LOGIN);
  if (login.getLastRow() === 0) {
    login.appendRow(['Timestamp', 'Role', 'Device']);
    login.setFrozenRows(1);
    login.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#FFDE59');
  }

  const sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);

  imageFolder_();
  return 'Setup complete';
}

// ---------- helpers ----------
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setup() once in the script editor.');
  return sh;
}
function imageFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('IMAGE_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const it = DriveApp.getFoldersByName(IMAGE_FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(IMAGE_FOLDER_NAME);
  props.setProperty('IMAGE_FOLDER_ID', folder.getId());
  return folder;
}
function str_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}
function postToObj_(row) {
  const o = {};
  POST_COLS.forEach((c, i) => { o[c] = row[i]; });
  return {
    id: str_(o['ID']), brand: str_(o['Brand']), title: str_(o['Title']), status: str_(o['Status']),
    platform: str_(o['Platform']), date: str_(o['Planned Date']), time: str_(o['Planned Time']),
    caption: str_(o['Caption']), goal: str_(o['Goal']), pillar: str_(o['Pillar']),
    imageUrl: str_(o['Image URL']), imageId: str_(o['Image ID']), notes: str_(o['Notes']),
    archived: o['Archived'] === true || String(o['Archived']).toUpperCase() === 'TRUE',
    created: o['Created'] instanceof Date ? o['Created'].toISOString() : str_(o['Created']),
    updated: o['Last Edited'] instanceof Date ? o['Last Edited'].toISOString() : str_(o['Last Edited']),
    editedBy: str_(o['Edited By']), objective: str_(o['Objective'])
  };
}
function findRow_(sh, id) {
  const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}
function logActivity_(action, post, detail, by, actionId) {
  sheet_(SHEETS.ACTIVITY).appendRow([new Date(), action, post.id || '', post.title || '', detail || '', by || '', actionId || '']);
}
function alreadyProcessed_(actionId) {
  if (!actionId) return false;
  const sh = sheet_(SHEETS.ACTIVITY);
  const last = sh.getLastRow();
  if (last < 2) return false;
  const start = Math.max(2, last - 500);
  const ids = sh.getRange(start, 7, last - start + 1, 1).getValues();
  return ids.some(r => String(r[0]) === String(actionId));
}

// ---------- reads ----------
function getAll_() {
  const sh = sheet_(SHEETS.POSTS);
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, POST_COLS.length).getValues() : [];
  const posts = rows.filter(r => r[0]).map(postToObj_);

  const st = sheet_(SHEETS.SETTINGS);
  const data = st.getDataRange().getValues();
  const settings = {};
  (data[0] || []).forEach((k, ci) => {
    if (!k) return;
    settings[k] = data.slice(1).map(r => String(r[ci] || '').trim()).filter(Boolean);
  });
  return { status: 'ok', posts: posts, settings: settings, serverTime: new Date().toISOString() };
}

// ---------- writes ----------
function savePost_(p) {
  const post = p.post || {};
  if (!post.id) throw new Error('Post has no ID');
  if (!post.title) throw new Error('Post needs a title');
  const sh = sheet_(SHEETS.POSTS);
  const now = new Date();
  const row = findRow_(sh, post.id);
  const existing = row > 0 ? sh.getRange(row, 1, 1, POST_COLS.length).getValues()[0] : null;

  const values = [
    post.id, post.brand || 'LCL', post.title, post.status || 'Idea', post.platform || '',
    post.date || '', post.time || '', post.caption || '', post.goal || '', post.pillar || '',
    post.imageUrl || '', post.imageId || '', post.notes || '', post.archived ? true : false,
    existing ? existing[POST_COLS.indexOf('Created')] : now, now, p.by || '',
    existing ? existing[17] : '', existing ? existing[18] : '', existing ? existing[19] : '', existing ? existing[20] : '',
    post.objective !== undefined ? post.objective : (existing ? existing[21] : '')
  ];
  if (row > 0) sh.getRange(row, 1, 1, values.length).setValues([values]);
  else sh.appendRow(values);

  let detail = row > 0 ? 'Edited' : 'Created as ' + values[3];
  if (existing && String(existing[3]) !== String(values[3])) detail = existing[3] + ' → ' + values[3];
  const wasArchived = existing && (existing[13] === true || String(existing[13]).toUpperCase() === 'TRUE');
  if (existing && wasArchived !== values[13]) detail = values[13] ? 'Archived' : 'Restored';
  logActivity_(row > 0 ? 'update' : 'create', post, detail, p.by, p.actionId);
  return { status: 'ok', id: post.id, updated: now.toISOString() };
}

function uploadImage_(p) {
  if (!p.data) throw new Error('No image data');
  const bytes = Utilities.base64Decode(p.data);
  const blob = Utilities.newBlob(bytes, p.mimeType || 'image/jpeg', p.name || ('post-' + Date.now() + '.jpg'));
  const file = imageFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const id = file.getId();
  return { status: 'ok', imageId: id, imageUrl: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1080' };
}

function logLogin_(p) {
  sheet_(SHEETS.LOGIN).appendRow([new Date(), p.role || '', p.device || '']);
  return { status: 'ok' };
}

// ---------- entry points ----------
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'getAll';
  try {
    if (action === 'getAll') return jsonOut_(getAll_());
    if (action === 'ping') return jsonOut_({ status: 'ok' });
    return jsonOut_({ status: 'error', message: 'Unknown GET action: ' + action });
  } catch (err) {
    return jsonOut_({ status: 'error', message: err.message });
  }
}

function doPost(e) {
  const action = e.parameter.action;
  let payload = {};
  try { payload = JSON.parse(e.postData.contents); } catch (err) {}

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (payload.actionId && action === 'savePost' && alreadyProcessed_(payload.actionId)) {
      return jsonOut_({ status: 'ok', duplicate: true });
    }
    let result;
    switch (action) {
      case 'savePost': result = savePost_(payload); break;
      case 'uploadImage': result = uploadImage_(payload); break;
      case 'login': result = logLogin_(payload); break;
      default: result = { status: 'error', message: 'Unknown POST action: ' + action };
    }
    return jsonOut_(result);
  } catch (err) {
    return jsonOut_({ status: 'error', message: err.message });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
