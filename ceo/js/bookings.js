/* Bookings: this week's discovery calls, setting the week's availability,
   and the link the secretary sends to clients. */
(function () {
  "use strict";
  const CEO = window.CEO, esc = CEO.esc;
  const k = () => (CEO.data() && CEO.data().bookings) || { bookings: [], availability: [], week: [] };

  async function refresh() {
    const r = await CEO.hub("bookingsGet");
    if (r.status !== "ok") throw new Error(r.message);
    const b = CEO.data();
    if (b) { b.bookings = r; CEO.store.set("ceo_bundle", b); }
    return r;
  }

  function callRow(c) {
    return `<div class="row" role="button" tabindex="0" data-booking="${esc(c.id)}">${CEO.icon("video", "accent")}
      <div class="txt"><span class="t">${esc(c.name)}${c.company ? " · " + esc(c.company) : ""}</span>
      <span class="m">${esc(CEO.fmtWhen(c.call))} · ${esc(c.service)}</span><span class="m">${esc(c.note)}</span></div></div>`;
  }

  function openBooking(id) {
    const c = (k().bookings || []).find((x) => x.id === id);
    if (!c) return CEO.toast("Call not found");
    CEO.sheet(`<h2>${esc(c.name)}</h2>
      <dl class="kv"><dt>When</dt><dd>${esc(CEO.fmtWhen(c.call))} (15 min)</dd><dt>Company</dt><dd>${esc(c.company)}</dd>
        <dt>Service</dt><dd>${esc(c.service)}</dd><dt>Email</dt><dd>${esc(c.email)}</dd><dt>Their note</dt><dd style="white-space:pre-wrap">${esc(c.note)}</dd></dl>
      ${c.meet ? `<a class="btn wide" href="${esc(c.meet)}" target="_blank" rel="noopener">${CEO.icon("video")} Join on Google Meet</a>` : `<p class="note">No Meet link on this call: the Hub needs the Google Calendar API service.</p>`}`);
  }

  // ---------------------------------------------------------------- availability
  function openAvailability() {
    const s = k();
    const week = s.week && s.week.length ? s.week : [];
    const today = CEO.today();
    const byDate = {};
    (s.availability || []).forEach((a) => { (byDate[a.date] = byDate[a.date] || []).push({ start: a.start, end: a.end }); });
    const dayName = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

    CEO.screen("bookings", "This week's availability", week.length ? CEO.fmtDate(week[0]) + " to " + CEO.fmtDate(week[6]) : "", `
      <div class="content"><section class="card">
        <p class="note">Tap the days you are free and add your times. Each 25 minutes becomes one bookable slot: 5 minutes prep, a 15 minute call, 5 minutes wrap up.</p>
        <div data-days></div>
        <button class="btn wide" data-save>Save availability</button>
      </section></div>`, (el) => {
      const box = el.querySelector("[data-days]");
      const state = week.map((d) => ({ date: d, on: !!(byDate[d] && byDate[d].length), ranges: (byDate[d] || []).slice(), past: d < today }));
      const draw = () => {
        box.innerHTML = state.map((d, i) => `<div class="more" style="padding:6px 0">
          <label class="check"><input type="checkbox" data-on="${i}" ${d.on ? "checked" : ""} ${d.past ? "disabled" : ""}> <strong>${esc(dayName(d.date))}</strong>${d.past ? " (past)" : ""}</label>
          ${d.on ? d.ranges.map((r, j) => `<div class="actions" style="align-items:flex-end;margin:4px 0 8px 30px">
              <div class="field"><label>From</label><input type="time" step="300" value="${esc(r.start)}" data-start="${i}:${j}"></div>
              <div class="field"><label>To</label><input type="time" step="300" value="${esc(r.end)}" data-end="${i}:${j}"></div>
              <button class="icon-btn" aria-label="Remove these times" data-del="${i}:${j}">${CEO.icon("close", "sm")}</button></div>`).join("") +
            `<button class="link" style="margin-left:30px" data-add="${i}">+ Add more times</button>` : ""}</div>`).join("");
        box.querySelectorAll("[data-on]").forEach((c) => c.onchange = () => {
          const d = state[c.dataset.on]; d.on = c.checked;
          if (d.on && !d.ranges.length) d.ranges.push({ start: "10:00", end: "12:00" });
          draw();
        });
        box.querySelectorAll("[data-add]").forEach((b) => b.onclick = () => { state[b.dataset.add].ranges.push({ start: "14:00", end: "16:00" }); draw(); });
        box.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { const [i, j] = b.dataset.del.split(":"); state[i].ranges.splice(j, 1); if (!state[i].ranges.length) state[i].on = false; draw(); });
        box.querySelectorAll("[data-start],[data-end]").forEach((inp) => inp.onchange = () => {
          const [i, j] = (inp.dataset.start || inp.dataset.end).split(":");
          state[i].ranges[j][inp.dataset.start ? "start" : "end"] = inp.value;
        });
      };
      draw();
      el.querySelector("[data-save]").onclick = async (e) => {
        const bad = state.some((d) => d.on && d.ranges.some((r) => !r.start || !r.end || r.end <= r.start));
        if (bad) { CEO.toast("Each end time must be after its start time"); return; }
        e.target.disabled = true; e.target.textContent = "Saving…";
        try {
          const r = await CEO.hub("setAvailability", { days: state.filter((d) => !d.past).map((d) => ({ date: d.date, ranges: d.on ? d.ranges : [] })) });
          if (r.status !== "ok") throw new Error(r.message);
          await refresh();
          CEO.closeLayer(); CEO.refresh();
          const slots = state.reduce((n, d) => n + (d.on ? d.ranges.reduce((m, rg) => m + Math.floor((toMin(rg.end) - toMin(rg.start)) / 25), 0) : 0), 0);
          CEO.toast("Saved: " + slots + " bookable slot" + (slots === 1 ? "" : "s") + " this week");
        } catch (err) { e.target.disabled = false; e.target.textContent = "Save availability"; CEO.toast(err.message); }
      };
    });
  }
  const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };

  // ---------------------------------------------------------------- the Bookings screen
  function open() {
    CEO.screen("bookings", "Bookings", "Discovery calls", `<div class="content cols">
        <section class="card"><div class="card-head">${CEO.icon("video", "accent")}<h2>Coming calls</h2></div><div data-list></div></section>
        <section class="card"><div class="card-head">${CEO.icon("calendar", "accent")}<h2>Availability</h2></div><p class="note" data-avail></p>
          <div class="card-foot"><button class="btn" data-set>Set times</button></div></section>
        <section class="card"><div class="card-head">${CEO.icon("link", "accent")}<h2>Booking link</h2></div>
          <p class="note">Your secretary sends this to clients. It shows only the free times you set for the coming week.</p>
          <div class="card-foot"><button class="btn" data-copy>Copy link</button></div></section>
      </div>`, (el) => {
      const draw = () => {
        const s = k();
        const list = el.querySelector("[data-list]");
        const upcoming = (s.bookings || []).filter((c) => new Date(c.call) > new Date(Date.now() - 20 * 60000));
        CEO.pagedRows(list, upcoming, callRow, "No calls booked yet.");
        const days = [...new Set((s.availability || []).map((a) => a.date))];
        el.querySelector("[data-avail]").textContent = days.length ? "Open on " + days.map((d) => CEO.fmtDate(d)).join(", ") + "." : "No times set for the coming week, so clients cannot book yet.";
      };
      const list = el.querySelector("[data-list]");
      list.addEventListener("click", (e) => { const r = e.target.closest("[data-booking]"); if (r) openBooking(r.dataset.booking); });
      el.querySelector("[data-set]").onclick = openAvailability;
      el.querySelector("[data-copy]").onclick = async () => {
        const url = k().bookingUrl || "https://lclworld.github.io/lcl-tools/ceo/book/";
        try { await navigator.clipboard.writeText(url); CEO.toast("Link copied"); } catch (e) { prompt("Copy this link", url); }
      };
      const onRefresh = () => { if (el.isConnected) draw(); else window.removeEventListener("ceo:refresh", onRefresh); };
      window.addEventListener("ceo:refresh", onRefresh);
      draw();
      refresh().then(() => { if (el.isConnected) draw(); }).catch(() => {});
    });
  }

  CEO.sections.bookings = { open, openBooking, openAvailability };
})();
