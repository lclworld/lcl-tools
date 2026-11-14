/**
 * CEO Hub: Bookings (Phase 3)
 *
 * Complimentary discovery calls. Each Sunday the manager sets the days and
 * times she is free in the coming week; the Hub cuts them into 25 minute
 * slots (5 minutes prep, a 15 minute call, 5 minutes wrap up). The public
 * page (ceo/book/) shows only those free slots. On booking: the slot locks,
 * a Calendar event with Google Meet blocks the full 25 minutes (the manager's
 * personal email is invited), the client gets a confirmation with the
 * generic meeting invoice attached, and reminders go out at 9am on the day,
 * 1 hour before and 5 minutes before. Booking emails are signed
 * Kendra Asare, Brand Experience Manager.
 *
 * Script Properties used: PERSONAL_EMAIL (invited to every call),
 * MEETING_INVOICE_FILE_ID (Drive file ID of the generic meeting invoice PDF),
 * BOOKING_PAGE_URL (optional).
 * For the Meet link, add the "Google Calendar API" service in Apps Script
 * (Services, +). Without it the event is still created, with no Meet link.
 */

var SLOT_MIN = 25, PREP_MIN = 5, CALL_MIN = 15;
var SERVICES = ['Custom Formulation', 'Private Label', 'Other'];
var BOOKING_HEAD = ['ID', 'SLOT START', 'NAME', 'COMPANY', 'EMAIL', 'SERVICE', 'NOTE', 'EVENT ID', 'MEET', 'STATUS', 'CREATED', 'REMINDERS'];
var SIGN_OFF_BOOKINGS = 'Warm regards,\nKendra Asare\nBrand Experience Manager\nLueur Cosmetics Lab';
var FAIR_USE = 'Your first call is complimentary. A missed or rescheduled call is charged GHS 300.';

// ---------------------------------------------------------------- availability

// [{date:'2026-11-17', start:'09:00', end:'12:00'}]
function readAvailability_() {
  var sh = hubSheet_('Availability');
  var last = sh.getLastRow();
  var out = [];
  if (last >= 2) sh.getRange(2, 1, last - 1, 3).getDisplayValues().forEach(function (r) {
    if (r[0] && r[1] && r[2]) out.push({ date: normDate_(r[0]), start: r[1].slice(0, 5), end: r[2].slice(0, 5) });
  });
  return out;
}
function normDate_(s) {
  s = String(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var d = new Date(s);
  return isNaN(d) ? s : Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

// Replaces the ranges for the dates sent; other dates are left alone.
function setAvailability_(body) {
  var days = body.days || [];
  var today = today_();
  var dates = {};
  days.forEach(function (d) { if (d.date >= today) dates[d.date] = true; });
  var keep = readAvailability_().filter(function (a) { return !dates[a.date] && a.date >= CEO_addDays_(today, -1); });
  days.forEach(function (d) {
    if (d.date < today) return;
    (d.ranges || []).forEach(function (r) {
      if (/^\d{2}:\d{2}$/.test(r.start) && /^\d{2}:\d{2}$/.test(r.end) && r.end > r.start) keep.push({ date: d.date, start: r.start, end: r.end });
    });
  });
  var sh = hubSheet_('Availability');
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 3).clearContent();
  if (keep.length) {
    sh.getRange(2, 1, keep.length, 3).setNumberFormat('@');
    sh.getRange(2, 1, keep.length, 3).setValues(keep.map(function (a) { return [a.date, a.start, a.end]; }));
  }
  return { status: 'ok', availability: keep };
}

function CEO_addDays_(d, n) {
  var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

// Accra is UTC all year, so 'yyyy-MM-ddTHH:mm' + 'Z' is the moment.
function at_(date, hhmm) { return new Date(date + 'T' + hhmm + ':00Z'); }

// ---------------------------------------------------------------- bookings sheet

function readBookings_() {
  var sh = hubSheet_('Bookings');
  var last = sh.getLastRow();
  var out = [];
  if (last >= 2) sh.getRange(2, 1, last - 1, BOOKING_HEAD.length).getValues().forEach(function (r, i) {
    if (!r[0]) return;
    out.push({ row: i + 2, id: r[0], slotStart: r[1] instanceof Date ? r[1].toISOString() : String(r[1]), name: r[2], company: r[3],
      email: r[4], service: r[5], note: r[6], eventId: r[7], meet: r[8], status: r[9],
      created: r[10] instanceof Date ? r[10].toISOString() : String(r[10]), reminders: safeJson_(r[11], {}) });
  });
  return out;
}

function callStart_(b) { return new Date(new Date(b.slotStart).getTime() + PREP_MIN * 60000); }

// ---------------------------------------------------------------- free slots

// Free slots from now (plus an hour) to 7 days ahead.
function freeSlots_() {
  var now = new Date();
  var earliest = new Date(now.getTime() + 60 * 60000);
  var until = new Date(now.getTime() + 7 * 86400000);
  var taken = {};
  readBookings_().forEach(function (b) { if (b.status !== 'Cancelled') taken[new Date(b.slotStart).toISOString()] = true; });

  var busy = [];
  try {
    CalendarApp.getDefaultCalendar().getEvents(now, until).forEach(function (ev) {
      if (!ev.isAllDayEvent()) busy.push([ev.getStartTime().getTime(), ev.getEndTime().getTime()]);
    });
  } catch (err) {}

  var slots = [];
  readAvailability_().forEach(function (a) {
    var end = at_(a.date, a.end).getTime();
    for (var t = at_(a.date, a.start).getTime(); t + SLOT_MIN * 60000 <= end; t += SLOT_MIN * 60000) {
      var s = new Date(t);
      if (s < earliest || s > until || taken[s.toISOString()]) continue;
      var clash = busy.some(function (b) { return t < b[1] && t + SLOT_MIN * 60000 > b[0]; });
      if (!clash) slots.push(s.toISOString());
    }
  });
  slots.sort();
  return slots;
}

// Public: what the booking page shows. The time shown is the call itself.
function publicSlots_() {
  return { status: 'ok', slots: freeSlots_().map(function (s) {
    return { slot: s, call: new Date(new Date(s).getTime() + PREP_MIN * 60000).toISOString() };
  }), services: SERVICES, fairUse: FAIR_USE, callMinutes: CALL_MIN };
}

// ---------------------------------------------------------------- booking (public)

function publicBook_(body) {
  if (body.website) return { status: 'ok' }; // a form filled in by a bot
  var name = String(body.name || '').trim().slice(0, 100);
  var company = String(body.company || '').trim().slice(0, 100);
  var email = String(body.email || '').trim().toLowerCase().slice(0, 150);
  var service = String(body.service || '');
  var note = String(body.note || '').trim().slice(0, 1000);
  if (!name || !company || !note) return { status: 'error', message: 'Please fill in every field.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { status: 'error', message: 'Please check your email address.' };
  if (SERVICES.indexOf(service) < 0) return { status: 'error', message: 'Please choose a service.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var booking;
  try {
    var slot = new Date(String(body.slot || ''));
    if (isNaN(slot) || freeSlots_().indexOf(slot.toISOString()) < 0) {
      return { status: 'error', code: 'TAKEN', message: 'Sorry, that time was just taken. Please pick another.' };
    }
    var existing = readBookings_().filter(function (b) {
      return b.email === email && b.status === 'Confirmed' && new Date(b.slotStart) > new Date();
    })[0];
    if (existing) return { status: 'error', message: 'You already have a call booked for ' + fmtCall_(callStart_(existing)) + '. Reply to your confirmation email to change it.' };

    booking = { id: 'BK-' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase(),
      slotStart: slot.toISOString(), name: name, company: company, email: email, service: service, note: note,
      eventId: '', meet: '', status: 'Confirmed', created: new Date().toISOString(), reminders: {} };
    hubSheet_('Bookings').appendRow([booking.id, slot, name, company, email, service, note, '', '', 'Confirmed', new Date(), '{}']);
  } finally { lock.releaseLock(); }

  // Outside the lock: Calendar and Gmail can be slow.
  var ev = createCallEvent_(booking);
  booking.eventId = ev.id; booking.meet = ev.meet;
  var row = readBookings_().filter(function (b) { return b.id === booking.id; })[0];
  if (row) hubSheet_('Bookings').getRange(row.row, 8, 1, 2).setValues([[ev.id, ev.meet]]);
  try { sendConfirmation_(booking); } catch (err) { logLogin_('', '', 'Booking email failed: ' + err.message); }
  return { status: 'ok', call: callStart_(booking).toISOString(), meet: booking.meet };
}

function createCallEvent_(b) {
  var start = new Date(b.slotStart), end = new Date(start.getTime() + SLOT_MIN * 60000);
  var title = 'Discovery call ' + Utilities.formatDate(callStart_(b), TZ, 'HH:mm') + ' · ' + b.name + ' (' + b.company + ')';
  var desc = 'Service: ' + b.service + '\nEmail: ' + b.email + '\n\nTheir note:\n' + b.note +
    '\n\n5 minutes prep, 15 minute call from ' + Utilities.formatDate(callStart_(b), TZ, 'HH:mm') + ', 5 minutes wrap up.';
  var guests = list_(prop_('PERSONAL_EMAIL'));
  try {
    var ev = Calendar.Events.insert({
      summary: title, description: desc,
      start: { dateTime: start.toISOString(), timeZone: TZ }, end: { dateTime: end.toISOString(), timeZone: TZ },
      attendees: guests.map(function (g) { return { email: g }; }),
      conferenceData: { createRequest: { requestId: b.id, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
    }, 'primary', { conferenceDataVersion: 1, sendUpdates: 'all' });
    return { id: ev.id, meet: ev.hangoutLink || '' };
  } catch (err) {
    // No Calendar API service added: still block the time, without Meet.
    var e2 = CalendarApp.getDefaultCalendar().createEvent(title, start, end, { description: desc, guests: guests.join(','), sendInvites: true });
    return { id: e2.getId(), meet: '' };
  }
}

function fmtCall_(d) { return Utilities.formatDate(d, TZ, "EEEE d MMMM 'at' h:mm a") + ' (Ghana time, GMT)'; }

function meetingInvoice_() {
  var id = prop_('MEETING_INVOICE_FILE_ID');
  if (!id) return [];
  try { return [DriveApp.getFileById(id).getBlob()]; } catch (err) { return []; }
}

function sendConfirmation_(b) {
  var first = String(b.name).split(/\s+/)[0];
  var text = 'Hello ' + first + ',\n\n' +
    'Thank you for booking a discovery call with Lueur Cosmetics Lab. Here are your details:\n\n' +
    'When: ' + fmtCall_(callStart_(b)) + '\n' +
    'Length: 15 minutes\n' +
    'Service: ' + b.service + '\n' +
    (b.meet ? 'Join on Google Meet: ' + b.meet + '\n' : 'We will send your Google Meet link before the call.\n') + '\n' +
    'To make the most of our time, please have your product idea, your target customer and any reference products ready.\n\n' +
    'Your meeting invoice is attached for your records. ' + FAIR_USE + '\n\n' +
    'We will send you a reminder on the morning of the call, an hour before, and again 5 minutes before we start.\n\n' +
    SIGN_OFF_BOOKINGS;
  GmailApp.sendEmail(b.email, 'Your discovery call with Lueur Cosmetics Lab, ' + Utilities.formatDate(callStart_(b), TZ, 'EEE d MMM, h:mm a'), text,
    { htmlBody: htmlEmail_(text), name: 'Kendra Asare, Lueur Cosmetics Lab', attachments: meetingInvoice_() });
}

// ---------------------------------------------------------------- reminders (time trigger)

function sendReminders_() {
  var now = new Date();
  var today = today_();
  var sh = hubSheet_('Bookings');
  readBookings_().forEach(function (b) {
    if (b.status !== 'Confirmed') return;
    var call = callStart_(b);
    if (call <= now) return;
    var mins = (call.getTime() - now.getTime()) / 60000;
    var r = b.reminders || {};
    var due = null;
    if (!r.morning && Utilities.formatDate(call, TZ, 'yyyy-MM-dd') === today && Number(Utilities.formatDate(now, TZ, 'H')) >= 9 && mins > 75) due = 'morning';
    else if (!r.hour && mins <= 62 && mins > 12) due = 'hour';
    else if (!r.five && mins <= 8) due = 'five';
    if (!due) return;
    var first = String(b.name).split(/\s+/)[0];
    var lead = { morning: 'A quick reminder that our discovery call is today, ' + fmtCall_(call) + '.',
                 hour: 'Our discovery call starts in about an hour, at ' + Utilities.formatDate(call, TZ, 'h:mm a') + ' (Ghana time).',
                 five: 'We are starting in 5 minutes.' }[due];
    var text = 'Hello ' + first + ',\n\n' + lead + '\n\n' + (b.meet ? 'Join here: ' + b.meet + '\n\n' : '') +
      (due === 'five' ? '' : FAIR_USE + '\n\n') + SIGN_OFF_BOOKINGS;
    try {
      GmailApp.sendEmail(b.email, (due === 'five' ? 'Starting now: ' : 'Reminder: ') + 'your discovery call with Lueur Cosmetics Lab', text,
        { htmlBody: htmlEmail_(text), name: 'Kendra Asare, Lueur Cosmetics Lab' });
      r[due] = new Date().toISOString();
      sh.getRange(b.row, 12).setValue(JSON.stringify(r));
    } catch (err) {}
  });
}

// ---------------------------------------------------------------- manager side

// The week the Sunday card sets: next Monday to Sunday on a weekend,
// otherwise the current week.
function comingWeek_() {
  var d = new Date(today_() + 'T00:00:00Z');
  var w = d.getUTCDay();
  var monday = CEO_addDays_(today_(), w === 0 ? 1 : w === 6 ? 2 : 1 - w);
  var days = [];
  for (var i = 0; i < 7; i++) days.push(CEO_addDays_(monday, i));
  return days;
}

function bookingsSummary_() {
  var from = new Date(Date.now() - 86400000), to = new Date(Date.now() + 14 * 86400000);
  var bookings = readBookings_().filter(function (b) {
    var s = new Date(b.slotStart); return b.status === 'Confirmed' && s >= from && s <= to;
  }).map(function (b) {
    return { id: b.id, call: callStart_(b).toISOString(), name: b.name, company: b.company, email: b.email, service: b.service, note: b.note, meet: b.meet };
  }).sort(function (a, b) { return a.call.localeCompare(b.call); });
  var week = comingWeek_();
  var avail = readAvailability_().filter(function (a) { return a.date >= today_(); });
  var weekSet = avail.some(function (a) { return week.indexOf(a.date) >= 0; });
  return { bookings: bookings, availability: avail, week: week, weekSet: weekSet,
    bookingUrl: prop_('BOOKING_PAGE_URL') || 'https://lclworld.github.io/lcl-tools/ceo/book/' };
}

// Sunday morning: a reminder email to set the week's availability.
function sundayReminder_() {
  var s = bookingsSummary_();
  if (s.weekSet) return;
  sendAlert_('Set this week\'s availability for discovery calls',
    'Good morning. Clients can only book discovery calls in the times you set for the week ahead.\n\n' +
    'Open the CEO App to set them: https://lclworld.github.io/lcl-tools/ceo/');
}
