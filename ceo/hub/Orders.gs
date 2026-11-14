/**
 * CEO Hub: Orders (Phase 2)
 *
 * One list of every paid order, from Zoho Invoice (paid invoices) and
 * InstaBrand order emails. Each status change can send the client a short
 * email, always previewed in the app first and only sent on Send.
 * Order emails are signed: The Lueur Cosmetics Lab Team.
 *
 * Script Properties used: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET,
 * ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID, ZOHO_DOMAIN (optional, default zoho.com),
 * INSTABRAND_SUBJECT (optional; empty means no InstaBrand orders yet).
 */

var ORDER_STATUSES = ['Order confirmed', 'Label received', 'In production', 'Quality check',
                      'Scheduled for pickup', 'Scheduled for delivery', 'Delivered'];
var ORDER_HEAD = ['KEY', 'SOURCE', 'NUMBER', 'CLIENT', 'EMAIL', 'AMOUNT', 'CURRENCY', 'PAID', 'PRODUCTS',
                  'STATUS', 'STATUS DATE', 'LAST UPDATE', 'HISTORY', 'REF'];
var ORDER_DAYS = 120;   // how far back paid orders are pulled in

// ---------------------------------------------------------------- Zoho

function zohoDomain_() { return String(prop_('ZOHO_DOMAIN') || 'zoho.com').replace(/^https?:\/\//, '').replace(/^(www\.|accounts\.)/, ''); }
function zohoReady_() { return !!(prop_('ZOHO_CLIENT_ID') && prop_('ZOHO_CLIENT_SECRET') && prop_('ZOHO_REFRESH_TOKEN') && prop_('ZOHO_ORG_ID')); }

function zohoToken_() {
  var cache = CacheService.getScriptCache();
  var t = cache.get('zoho_token');
  if (t) return t;
  var res = UrlFetchApp.fetch('https://accounts.' + zohoDomain_() + '/oauth/v2/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { refresh_token: prop_('ZOHO_REFRESH_TOKEN'), client_id: prop_('ZOHO_CLIENT_ID'),
               client_secret: prop_('ZOHO_CLIENT_SECRET'), grant_type: 'refresh_token' }
  });
  var data = JSON.parse(res.getContentText());
  if (!data.access_token) throw new Error('Zoho sign in failed: ' + (data.error || res.getResponseCode()));
  cache.put('zoho_token', data.access_token, 3000);
  return data.access_token;
}

function zohoGet_(path, params) {
  var q = Object.keys(params || {}).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  var url = 'https://www.zohoapis.' + zohoDomain_().replace(/^zoho\./, '') + '/invoice/v3/' + path + '?organization_id=' + encodeURIComponent(prop_('ZOHO_ORG_ID')) + (q ? '&' + q : '');
  var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Zoho-oauthtoken ' + zohoToken_() }, muteHttpExceptions: true });
  var data = JSON.parse(res.getContentText());
  if (data.code !== 0) throw new Error('Zoho: ' + (data.message || res.getResponseCode()));
  return data;
}

// ---------------------------------------------------------------- the Orders sheet

function readOrders_() {
  var sh = hubSheet_('Orders');
  var last = sh.getLastRow();
  var out = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, ORDER_HEAD.length).getValues().forEach(function (r) {
    if (!r[0]) return;
    var iso = function (v) { return v instanceof Date ? v.toISOString() : String(v || ''); };
    out[r[0]] = { key: r[0], source: r[1], number: String(r[2]), client: r[3], email: r[4], amount: r[5], currency: r[6],
      paid: iso(r[7]).slice(0, 10), products: r[8], status: r[9], statusDate: iso(r[10]).slice(0, 10), lastUpdate: iso(r[11]),
      history: safeJson_(r[12], []), ref: String(r[13] || '') };
  });
  return out;
}
function safeJson_(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; } }

function writeOrders_(map) {
  var sh = hubSheet_('Orders');
  var rows = Object.keys(map).map(function (k) {
    var o = map[k];
    return [o.key, o.source, "'" + o.number, o.client, o.email, o.amount, o.currency, o.paid, o.products || '',
            o.status || '', o.statusDate || '', o.lastUpdate || '', JSON.stringify(o.history || []), o.ref || ''];
  });
  rows.sort(function (a, b) { return String(b[7]).localeCompare(String(a[7])); });
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, ORDER_HEAD.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, ORDER_HEAD.length).setValues(rows);
}

// Pulls new paid invoices from Zoho and InstaBrand order emails. Statuses and
// history already saved are never touched here.
function refreshOrders_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { errors: ['Busy, try again'] };
  var errors = [];
  try {
    var map = readOrders_();
    var since = Utilities.formatDate(new Date(Date.now() - ORDER_DAYS * 86400000), 'Africa/Accra', 'yyyy-MM-dd');

    if (zohoReady_()) {
      try {
        var page = 1, more = true;
        while (more && page <= 5) {
          var data = zohoGet_('invoices', { status: 'paid', date_start: since, sort_column: 'date', sort_order: 'D', per_page: 200, page: page });
          (data.invoices || []).forEach(function (inv) {
            var key = 'Z-' + inv.invoice_id;
            var o = map[key] || { key: key, source: 'Zoho', status: '', history: [] };
            o.number = inv.invoice_number; o.client = inv.customer_name; o.amount = inv.total; o.currency = inv.currency_code;
            o.paid = inv.last_payment_date || inv.date; o.ref = inv.customer_id;
            if (!o.email) o.email = inv.email || '';
            map[key] = o;
          });
          more = data.page_context && data.page_context.has_more_page;
          page++;
        }
        // Client emails for invoices that came without one.
        Object.keys(map).forEach(function (k) {
          var o = map[k];
          if (o.source !== 'Zoho' || o.email || !o.ref) return;
          try {
            var c = zohoGet_('contacts/' + o.ref, {}).contact || {};
            o.email = c.email || ((c.contact_persons || [])[0] || {}).email || '';
          } catch (err) {}
        });
        // Paying clients are known clients: their mail sorts into Clients.
        Object.keys(map).forEach(function (k) { if (map[k].source === 'Zoho' && map[k].email) addRuleIfNew_(map[k].email, 'Clients'); });
      } catch (err) { errors.push(String(err.message || err)); }
    }

    var subject = String(prop_('INSTABRAND_SUBJECT') || '').trim();
    if (subject) {
      GmailApp.search('subject:"' + subject.replace(/"/g, '') + '" newer_than:' + ORDER_DAYS + 'd', 0, 100).forEach(function (t) {
        var m = t.getMessages()[0];
        var key = 'IB-' + m.getId();
        var o = map[key] || { key: key, source: 'InstaBrand', status: '', history: [] };
        var replyTo = m.getReplyTo();
        o.number = (m.getSubject().match(/#\s?([A-Z0-9-]+)/i) || [])[1] || m.getId().slice(-6).toUpperCase();
        o.client = o.client || nameOf_(replyTo || m.getFrom());
        o.email = o.email || addressOf_(replyTo || m.getFrom());
        o.paid = m.getDate().toISOString().slice(0, 10);
        o.products = o.products || shorten_(m.getPlainBody(), 300);
        o.ref = t.getId();
        map[key] = o;
      });
    }
    writeOrders_(map);
    PropertiesService.getScriptProperties().setProperty('ORDERS_REFRESHED', new Date().toISOString());
  } finally { lock.releaseLock(); }
  return { errors: errors };
}

function addRuleIfNew_(email, category) {
  var sh = hubSheet_('Email Rules');
  if (!sh.getRange('A:A').createTextFinder(String(email).toLowerCase()).matchEntireCell(true).findNext()) addRule_(email, category, 'Paying client (Zoho)');
}

// ---------------------------------------------------------------- the emails

var SIGN_OFF_ORDERS = 'Warm regards,\nThe Lueur Cosmetics Lab Team';

function orderEmail_(o, status, date) {
  var first = String(o.client || '').split(/\s+/)[0] || 'there';
  var when = date ? Utilities.formatDate(new Date(date + 'T12:00:00Z'), 'Africa/Accra', 'EEEE d MMMM yyyy') : '(date)';
  var ref = 'order ' + o.number;
  var lines = {
    'Order confirmed': ['We have received your payment and your ' + ref + ' is confirmed. Thank you for choosing Lueur Cosmetics Lab.',
                        'The next step is your label design. Please send it over when it is ready, and we will review it with you.'],
    'Label received': ['We have received your label for ' + ref + '. Your order is now in our production queue.',
                       'We will let you know as soon as production begins.'],
    'In production': ['Good news: your ' + ref + ' is currently being processed in our lab.',
                      'We will update you again once it moves to final checks.'],
    'Quality check': ['Your products for ' + ref + ' are going through their final quality checks.',
                      'This makes sure everything meets our standards before it reaches you.'],
    'Scheduled for pickup': ['Your ' + ref + ' will be ready for pickup on ' + when + '.',
                             'Please reply to this email if you need to arrange a different time.'],
    'Scheduled for delivery': ['Your ' + ref + ' is scheduled for delivery on ' + when + '.',
                               'Please make sure someone is available to receive it, and reply to this email if anything changes.'],
    'Delivered': ['Your ' + ref + ' has been delivered. Thank you for working with us.',
                  'Once you have started using your products, we would love to hear how they are going. A short reply to this email with your feedback means a lot to our team.']
  }[status];
  return {
    to: o.email,
    subject: 'Your Lueur Cosmetics Lab order ' + o.number + ': ' + status,
    body: 'Hello ' + first + ',\n\n' + lines.join('\n\n') + '\n\n' + SIGN_OFF_ORDERS
  };
}

function htmlEmail_(text) {
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var paras = String(text).split(/\n{2,}/).map(function (p) { return '<p style="margin:0 0 14px">' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
  return '<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#2B1D17;max-width:560px">' +
    '<div style="border-top:4px solid #FF914D;padding-top:18px">' + paras + '</div></div>';
}

// ---------------------------------------------------------------- actions

function ordersList_(body) {
  var refreshed = prop_('ORDERS_REFRESHED');
  var errors = [];
  if (body && body.refresh || !refreshed || Date.now() - new Date(refreshed).getTime() > 10 * 60000) errors = refreshOrders_().errors;
  var map = readOrders_();
  var list = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return String(b.paid).localeCompare(String(a.paid)); });
  return { status: 'ok', orders: list, statuses: ORDER_STATUSES, errors: errors, zohoReady: zohoReady_(), instabrandReady: !!prop_('INSTABRAND_SUBJECT') };
}

// Products from the Zoho invoice, fetched the first time a card is opened.
function orderDetail_(body) {
  var map = readOrders_();
  var o = map[body.key];
  if (!o) return { status: 'error', message: 'Order not found' };
  if (!o.products && o.source === 'Zoho' && zohoReady_()) {
    try {
      var inv = zohoGet_('invoices/' + o.key.slice(2), {}).invoice || {};
      o.products = (inv.line_items || []).map(function (l) { return l.name + ' × ' + l.quantity; }).join('\n');
      if (!o.email) o.email = inv.email || ((inv.contact_persons_details || [])[0] || {}).email || '';
      writeOrders_(map);
    } catch (err) {}
  }
  return { status: 'ok', order: o };
}

function orderPreview_(body) {
  var o = readOrders_()[body.key];
  if (!o) return { status: 'error', message: 'Order not found' };
  if (ORDER_STATUSES.indexOf(body.status) < 0) return { status: 'error', message: 'Unknown status' };
  if (/^Scheduled/.test(body.status) && !body.date) return { status: 'error', message: 'Pick the date first' };
  return { status: 'ok', email: orderEmail_(o, body.status, body.date) };
}

// Saves the status, and sends the email only when the manager tapped Send
// on the previewed (and possibly edited) text.
function orderSetStatus_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var map = readOrders_();
    var o = map[body.key];
    if (!o) return { status: 'error', message: 'Order not found' };
    if (ORDER_STATUSES.indexOf(body.status) < 0) return { status: 'error', message: 'Unknown status' };
    var sent = false;
    if (body.send) {
      var to = String(body.to || o.email || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { status: 'error', message: 'This order has no client email. Add one, or save without emailing.' };
      var text = String(body.body || '').trim();
      if (!text) return { status: 'error', message: 'The email is empty' };
      GmailApp.sendEmail(to, String(body.subject || orderEmail_(o, body.status, body.date).subject), text,
        { htmlBody: htmlEmail_(text), name: 'Lueur Cosmetics Lab' });
      if (!o.email) o.email = to;
      sent = true;
    }
    var now = new Date().toISOString();
    o.status = body.status;
    o.statusDate = body.date || '';
    o.lastUpdate = now;
    o.history = (o.history || []).concat([{ status: body.status, at: now, date: body.date || '', emailed: sent }]);
    writeOrders_(map);
    return { status: 'ok', order: o, sent: sent };
  } finally { lock.releaseLock(); }
}

// Mon to Fri days since the last update.
function workingDaysSince_(iso) {
  if (!iso) return 0;
  var d = new Date(iso), now = new Date(), n = 0;
  d.setUTCHours(0, 0, 0, 0);
  while (d < now) { d.setUTCDate(d.getUTCDate() + 1); var w = d.getUTCDay(); if (w !== 0 && w !== 6 && d <= now) n++; }
  return n;
}

// What Home needs: new paid orders with no status yet, and orders gone quiet.
function ordersSummary_() {
  var map = readOrders_();
  var list = Object.keys(map).map(function (k) { return map[k]; });
  return list.filter(function (o) { return o.status !== 'Delivered'; }).map(function (o) {
    return { key: o.key, number: o.number, client: o.client, source: o.source, status: o.status || '', paid: o.paid,
      quietDays: workingDaysSince_(o.lastUpdate || o.paid), statusDate: o.statusDate };
  });
}
