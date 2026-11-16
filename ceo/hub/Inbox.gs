/**
 * CEO Hub: Inbox (Phase 2)
 *
 * Sorts lueurcosmeticslab@gmail.com into categories with a one line summary
 * of each email, free of charge: no paid AI service is used. Rules come first
 * (known clients, supplier domains, staff, the InstaBrand subject line), then
 * Gmail's own Promotions/Social/Forums tabs, then keywords in the subject and
 * body. Moving an email to another category adds its sender to the rules, so
 * the sorting gets better the more it is corrected. Every category is also a
 * Gmail label under "LCL/".
 *
 * Script Properties used (all optional): TEAM_EMAILS and SUPPLIER_DOMAINS
 * (comma separated), INSTABRAND_SUBJECT.
 */

var CATEGORIES = ['New Inquiries', 'Clients', 'InstaBrand Orders', 'Label Submissions', 'Suppliers',
                  'Team', 'Payments & Finance', 'Regulatory', 'Other'];
var INBOX_QUERY = 'in:inbox newer_than:30d';
var LABEL_ROOT = 'LCL/';

// What each category means.
var CATEGORY_GUIDE = [
  'New Inquiries: a prospect or website form lead asking about LCL services for the first time (custom formulation, private label, pricing, samples, how to start).',
  'Clients: an existing client writing about their project, quote, order, samples or invoice.',
  'InstaBrand Orders: an order notification from InstaBrand.',
  'Label Submissions: a label design or label artwork sent for review, including Label Studio submissions.',
  'Suppliers: a raw material, packaging or equipment supplier (quotes, invoices, shipping updates, catalogues).',
  'Team: an LCL staff member.',
  'Payments & Finance: payment notices, Paystack, banks, Zoho Invoice, receipts, tax.',
  'Regulatory: FDA Ghana, product registration, certificates, inspections, standards bodies.',
  'Other: newsletters, promotions, notifications and anything else.'
].join('\n');

// ---------------------------------------------------------------- rules

function rules_() {
  var sh = hubSheet_('Email Rules');
  var last = sh.getLastRow();
  var out = [];
  if (last >= 2) sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) {
    if (r[0] && CATEGORIES.indexOf(r[1]) >= 0) out.push({ match: String(r[0]).toLowerCase().trim(), category: r[1] });
  });
  list_(prop_('TEAM_EMAILS')).forEach(function (e) { out.push({ match: e, category: 'Team' }); });
  list_(prop_('SUPPLIER_DOMAINS')).forEach(function (d) { out.push({ match: d.charAt(0) === '@' ? d : '@' + d, category: 'Suppliers' }); });
  [['@paystack.com', 'Payments & Finance'], ['@zohoinvoice.com', 'Payments & Finance'], ['@zoho.com', 'Payments & Finance'],
   ['@fdaghana.gov.gh', 'Regulatory'], ['@fda.gov.gh', 'Regulatory']].forEach(function (p) { out.push({ match: p[0], category: p[1] }); });
  return out;
}

function list_(s) {
  return String(s || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(String);
}

// Exact address first, then the domain.
function ruleFor_(email, subject, rules) {
  var ib = String(prop_('INSTABRAND_SUBJECT') || '').trim().toLowerCase();
  if (ib && String(subject || '').toLowerCase().indexOf(ib) >= 0) return 'InstaBrand Orders';
  email = String(email || '').toLowerCase();
  var domain = email.slice(email.indexOf('@'));
  for (var i = 0; i < rules.length; i++) if (rules[i].match === email) return rules[i].category;
  for (var j = 0; j < rules.length; j++) if (rules[j].match.charAt(0) === '@' && rules[j].match === domain) return rules[j].category;
  return '';
}

var FREE_MAIL = ['@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com', '@icloud.com', '@live.com', '@aol.com', '@ymail.com'];

function addRule_(email, category, note) {
  email = String(email || '').toLowerCase().trim();
  if (!email || CATEGORIES.indexOf(category) < 0) return;
  var sh = hubSheet_('Email Rules');
  var hit = sh.getRange('A:A').createTextFinder(email).matchEntireCell(true).findNext();
  if (hit) sh.getRange(hit.getRow(), 2, 1, 3).setValues([[category, new Date(), note || '']]);
  else sh.appendRow([email, category, new Date(), note || '']);
}

// ---------------------------------------------------------------- reading Gmail

function myAddress_() { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); }

function addressOf_(from) {
  var m = String(from || '').match(/<([^>]+)>/);
  return String(m ? m[1] : from || '').trim().toLowerCase();
}
function nameOf_(from) {
  var s = String(from || '').replace(/<[^>]+>/, '').replace(/"/g, '').trim();
  return s || addressOf_(from);
}

// The latest message from someone other than LCL, or the first message.
function counterpart_(messages) {
  var me = myAddress_();
  for (var i = messages.length - 1; i >= 0; i--) {
    if (addressOf_(messages[i].getFrom()) !== me) return messages[i];
  }
  return messages[0];
}

// ---------------------------------------------------------------- the index

var INDEX_HEAD = ['THREAD ID', 'MESSAGES', 'CATEGORY', 'SUMMARY', 'SOURCE', 'FROM', 'EMAIL', 'SUBJECT', 'DATE', 'UNREAD', 'UPDATED'];

function readIndex_() {
  var sh = hubSheet_('Email Index');
  var last = sh.getLastRow();
  var map = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, INDEX_HEAD.length).getValues().forEach(function (r) {
    if (r[0]) map[r[0]] = { id: r[0], count: Number(r[1]) || 0, category: r[2], summary: r[3], source: r[4], from: r[5],
      email: r[6], subject: r[7], date: r[8] instanceof Date ? r[8].toISOString() : String(r[8] || ''), unread: r[9] === true || r[9] === 'TRUE' };
  });
  return map;
}

function writeIndex_(map) {
  var sh = hubSheet_('Email Index');
  var rows = Object.keys(map).map(function (k) {
    var x = map[k];
    return [x.id, x.count, x.category || '', x.summary || '', x.source || '', x.from || '', x.email || '', x.subject || '', x.date || '', !!x.unread, new Date()];
  });
  rows.sort(function (a, b) { return String(b[8]).localeCompare(String(a[8])); });
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, INDEX_HEAD.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, INDEX_HEAD.length).setValues(rows);
}

/**
 * Brings the index up to date with the inbox. New or changed threads are
 * sorted by rules first, then by Gmail's tabs and keywords. Free: nothing
 * here calls a paid service.
 */
function syncInbox_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return readIndex_();
  try {
    var old = readIndex_();
    var next = {};
    var rules = rules_();
    var threads = GmailApp.search(INBOX_QUERY, 0, 150);
    // Gmail's own Promotions, Social and Forums tabs are newsletters and notifications.
    var bulk = {};
    GmailApp.search(INBOX_QUERY + ' (category:promotions OR category:social OR category:forums)', 0, 150)
      .forEach(function (t) { bulk[t.getId()] = true; });
    var me = myAddress_();
    var relabel = [];

    threads.forEach(function (t) {
      var id = t.getId();
      var count = t.getMessageCount();
      var prev = old[id];
      var entry = {
        id: id, count: count, unread: t.isUnread(), date: t.getLastMessageDate().toISOString(), subject: t.getFirstMessageSubject(),
        category: prev ? prev.category : '', summary: prev ? prev.summary : '', source: prev ? prev.source : '',
        from: prev ? prev.from : '', email: prev ? prev.email : ''
      };
      next[id] = entry;
      if (prev && prev.count === count && prev.category) return; // nothing new in this thread

      var messages = t.getMessages();
      var m = counterpart_(messages);
      entry.from = nameOf_(m.getFrom());
      entry.email = addressOf_(m.getFrom());
      var body = m.getPlainBody();
      entry.summary = summarise_(body, entry.subject);
      if (prev && prev.source === 'manual') return; // the manager chose this category: keep it

      var byRule = ruleFor_(entry.email, entry.subject, rules);
      if (byRule) { entry.category = byRule; entry.source = 'rule'; }
      else {
        var lclReplied = messages.some(function (x) { return addressOf_(x.getFrom()) === me; });
        entry.category = guessCategory_({ email: entry.email, subject: entry.subject, body: body, bulk: !!bulk[id],
          attachments: m.getAttachments({ includeInlineImages: false }).map(function (a) { return a.getName(); }), lclReplied: lclReplied });
        entry.source = 'auto';
      }
      if (!prev || prev.category !== entry.category) relabel.push(entry);
    });

    writeIndex_(next);
    applyLabels_(relabel);
    return next;
  } finally { lock.releaseLock(); }
}

function shorten_(text, n) {
  var s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------------------------------------------------------------- free sorting

// Words that point to each category, checked in the subject and the start of
// the email. A subject match counts double. Add words here to tune sorting.
var KEYWORDS = {
  'InstaBrand Orders': ['instabrand'],
  'Label Submissions': ['label studio', 'label design', 'label artwork', 'label proof', 'label file', 'my label', 'our label',
                        'the label', 'labels attached', 'attached label', 'artwork', 'label review', 'label approval', 'dieline'],
  'Payments & Finance': ['invoice', 'receipt', 'payment', 'paid', 'transfer', 'bank', 'statement', 'momo', 'mobile money',
                         'paystack', 'transaction', 'refund', 'balance due', 'remittance', 'tax', 'vat'],
  'Regulatory': ['fda', 'food and drugs', 'registration', 'certificate', 'standards authority', 'gsa', 'inspection',
                 'notification number', 'product registration', 'dossier', 'compliance', 'permit', 'license', 'licence'],
  'Suppliers': ['proforma', 'pro forma', 'pro-forma', 'quotation', 'price list', 'catalogue', 'catalog', 'moq', 'lead time',
                'shipment', 'shipping', 'tracking', 'waybill', 'consignment', 'dispatch', 'your order has', 'order confirmation',
                'raw material', 'packaging', 'bottles', 'jars', 'containers', 'sample kit'],
  'New Inquiries': ['inquiry', 'enquiry', 'interested in', 'private label', 'custom formulation', 'formulate', 'start my brand',
                    'my own brand', 'own skincare', 'own brand', 'how much', 'pricing', 'price for', 'quote for', 'samples',
                    'minimum order', 'contact form', 'website form', 'i would like to', "i'd like to", 'looking for a manufacturer']
};
var BULK_SIGNS = ['unsubscribe', 'view in browser', 'view this email in your browser', 'manage your preferences', 'newsletter'];

function guessCategory_(e) {
  var subject = String(e.subject || '').toLowerCase();
  var text = String(e.body || '').slice(0, 2500).toLowerCase();
  var noReply = /no-?reply|do-?not-?reply|notifications?@|mailer|news@|newsletter@|marketing@/.test(e.email);

  if (subject.indexOf('instabrand') >= 0 || text.indexOf('instabrand') >= 0) return 'InstaBrand Orders';

  var score = {};
  Object.keys(KEYWORDS).forEach(function (cat) {
    score[cat] = 0;
    KEYWORDS[cat].forEach(function (w) {
      if (subject.indexOf(w) >= 0) score[cat] += 2;
      if (text.indexOf(w) >= 0) score[cat] += 1;
    });
  });
  // A design file attached with "label" anywhere is a label submission.
  var designFile = (e.attachments || []).some(function (n) { return /\.(ai|pdf|png|jpe?g|psd|svg|eps)$/i.test(n); });
  if (designFile && (subject + ' ' + text).indexOf('label') >= 0) score['Label Submissions'] += 3;

  var best = 'Other', top = 0;
  Object.keys(score).forEach(function (cat) { if (score[cat] > top) { top = score[cat]; best = cat; } });

  var bulky = e.bulk || noReply || BULK_SIGNS.some(function (w) { return text.indexOf(w) >= 0; });
  if (bulky) {
    // Receipts and registration notices come from no-reply addresses too.
    return (best === 'Payments & Finance' || best === 'Regulatory') && top >= 2 ? best : 'Other';
  }
  if (top >= 2) return best;
  // A real person writing to LCL for the first time, with nothing else to go on.
  if (!e.lclReplied && top === 1 && best === 'New Inquiries') return best;
  return top ? best : 'Other';
}

// One line from the email itself: its first real sentence, without greetings,
// quoted replies or signatures.
function summarise_(body, subject) {
  var lines = String(body || '').split(/\r?\n/);
  var kept = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].trim();
    if (/^On .+wrote:$/.test(l) || /^-{2,}\s*(Original|Forwarded)/i.test(l) || /^From:\s/.test(l) || l === '--') break;
    if (!l || l.charAt(0) === '>') continue;
    if (/^(hi|hello|hey|dear|good (morning|afternoon|evening)|greetings)\b[^.!?]{0,40}[,!]?$/i.test(l)) continue;
    kept.push(l);
    if (kept.join(' ').length > 220) break;
  }
  var text = kept.join(' ').replace(/\s+/g, ' ').trim();
  var first = (text.match(/^.*?[.!?](\s|$)/) || [text])[0].trim();
  if (first.length < 25 && text.length > first.length) first = text;
  return shorten_(first || subject || '', 120);
}

// ---------------------------------------------------------------- Gmail labels

function labelFor_(category) {
  var name = LABEL_ROOT + category;
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function applyLabels_(entries) {
  if (!entries.length) return;
  var labels = {};
  CATEGORIES.forEach(function (c) { labels[c] = null; });
  entries.forEach(function (e) {
    if (!e.category) return;
    try {
      var t = GmailApp.getThreadById(e.id);
      t.getLabels().forEach(function (l) {
        if (l.getName().indexOf(LABEL_ROOT) === 0 && l.getName() !== LABEL_ROOT + e.category) t.removeLabel(l);
      });
      if (!labels[e.category]) labels[e.category] = labelFor_(e.category);
      t.addLabel(labels[e.category]);
    } catch (err) {}
  });
}

// ---------------------------------------------------------------- actions

function inboxList_() {
  var map = syncInbox_();
  var items = Object.keys(map).map(function (k) { return map[k]; })
    .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  return { status: 'ok', categories: CATEGORIES, items: items };
}

function inboxThread_(body) {
  var t = GmailApp.getThreadById(String(body.id || ''));
  if (!t) return { status: 'error', message: 'Email not found' };
  var me = myAddress_();
  var messages = t.getMessages().slice(-8).map(function (m) {
    return {
      from: nameOf_(m.getFrom()), email: addressOf_(m.getFrom()), mine: addressOf_(m.getFrom()) === me,
      date: m.getDate().toISOString(), body: String(m.getPlainBody() || '').slice(0, 8000),
      attachments: m.getAttachments({ includeInlineImages: false }).map(function (a) { return a.getName(); })
    };
  });
  if (t.isUnread()) t.markRead();
  return { status: 'ok', id: t.getId(), subject: t.getFirstMessageSubject(), messages: messages, link: 'https://mail.google.com/mail/u/0/#all/' + t.getId() };
}

// The manager writes and sees the reply before tapping Send in the app.
function inboxReply_(body) {
  var text = String(body.body || '').trim();
  if (!text) return { status: 'error', message: 'The reply is empty' };
  var t = GmailApp.getThreadById(String(body.id || ''));
  if (!t) return { status: 'error', message: 'Email not found' };
  t.reply(text, { name: 'Lueur Cosmetics Lab' });
  t.markRead();
  return { status: 'ok' };
}

function inboxMove_(body) {
  var category = String(body.category || '');
  if (CATEGORIES.indexOf(category) < 0) return { status: 'error', message: 'Unknown category' };
  var map = readIndex_();
  var e = map[body.id];
  if (!e) return { status: 'error', message: 'Email not found' };
  e.category = category; e.source = 'manual';
  writeIndex_(map);
  applyLabels_([e]);
  // Future mail from this sender lands here. Shared mail providers are matched
  // by the full address, company domains by the address too (safest).
  if (e.email && e.email !== myAddress_()) addRule_(e.email, category, 'Moved in the CEO App');
  return { status: 'ok' };
}

// Unread counts per category, for Home.
function inboxSummary_() {
  var map = readIndex_();
  var counts = {}, unread = {};
  CATEGORIES.forEach(function (c) { counts[c] = 0; unread[c] = 0; });
  Object.keys(map).forEach(function (k) {
    var c = map[k].category || 'Other';
    counts[c] = (counts[c] || 0) + 1;
    if (map[k].unread) unread[c] = (unread[c] || 0) + 1;
  });
  return { counts: counts, unread: unread, ready: Object.keys(map).length > 0 };
}
