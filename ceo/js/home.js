/* Home: Needs you (max 5), Today, search, and tiles for the other sections.
   Sections with nothing in them yet stay hidden. */
(function () {
  "use strict";
  const CEO = window.CEO, esc = CEO.esc;

  // Tiles for sections that open from Home. Each appears only once it is
  // built and has something to show (calm rule: empty sections hide).
  const TILES = [
    { key: "quotes", label: "Quotes", icon: "quote", accent: "clients", ready: () => true,
      open: () => CEO.loadSection("toolbox").then((t) => t.openPage("Quote Generator", "quotes.html", "clients")) },
    { key: "bookings", label: "Bookings", icon: "video", ready: (b) => !!(b && b.bookings),
      open: () => CEO.loadSection("bookings").then((k) => k.open()) },
    { key: "toolbox", label: "Toolbox", icon: "tool", ready: () => true }
    // Phase 3: Bookings. Phase 4: Clients (Quotes moves inside it), Socials. Phase 5: Money, Compliance. Phase 6: Strategy Room.
  ];

  const openDetail = (kind, id) => {
    if (kind === "order") return CEO.loadSection("orders").then((o) => o.openOrder(id));
    if (kind === "inbox") return CEO.go("inbox").then(() => CEO.loadSection("inbox")).then((i) => i.openCategory(id));
    if (kind === "booking") return CEO.loadSection("bookings").then((k) => k.openBooking(id));
    return CEO.loadSection("work").then((w) => w.open(kind, id));
  };
  CEO.openDetail = openDetail;

  function needRow(n) {
    return `<div class="row" role="button" tabindex="0" data-open="${n.kind}" data-id="${esc(n.id)}">
      <div class="txt"><span class="t">${esc(n.title)}</span>${n.meta ? `<span class="m">${esc(n.meta)}</span>` : ""}</div>
      <button class="btn" data-act="${n.kind}" data-id="${esc(n.id)}">${esc(n.action)}</button></div>`;
  }
  function todayRow(t) {
    return `<div class="row" role="button" tabindex="0" data-open="${t.kind}" data-id="${esc(t.id)}">${CEO.icon(t.icon, "accent")}
      <div class="txt"><span class="t">${esc(t.title)}</span><span class="m">${esc(t.meta)}</span></div>${CEO.icon("chevron", "sm chev")}</div>`;
  }

  // The one tap action on each Needs you item. Each can be undone.
  function quickAction(kind, id) {
    if (kind === "attention") {
      CEO.loadSection("work").then((w) => w.respond(id, "Approved", "Approved"));
    } else if (kind === "purchase") {
      CEO.loadSection("work").then((w) => w.setStatus("purchase", id, "Approved"));
    } else if (kind === "task") {
      CEO.loadSection("work").then((w) => w.setStatus("task", id, "Completed"));
    } else if (kind === "order") {
      CEO.loadSection("orders").then((o) => o.openOrder(id, true));
    } else if (kind === "lowstock") {
      CEO.loadSection("work").then((w) => w.openStock());
    } else openDetail(kind, id);
  }

  // One listener per container, so rows added by "Show more" work too.
  function bindRows(el) {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]");
      if (act) { e.stopPropagation(); quickAction(act.dataset.act, act.dataset.id); return; }
      const row = e.target.closest("[data-open]");
      if (row) row.dataset.open === "lowstock" ? quickAction("lowstock") : openDetail(row.dataset.open, row.dataset.id);
    });
    el.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-open]")) { e.preventDefault(); e.target.click(); }
    });
  }

  function seeAll() {
    CEO.screen("home", "Needs you", "", `<div class="content"><section class="card"><div data-list></div></section></div>`, (el) => {
      const list = el.querySelector("[data-list]");
      const draw = () => CEO.pagedRows(list, CEO.needsYou(CEO.data()), needRow, "Nothing needs you right now.");
      const onRefresh = () => { if (el.isConnected) draw(); else window.removeEventListener("ceo:refresh", onRefresh); };
      window.addEventListener("ceo:refresh", onRefresh);
      draw(); bindRows(list);
    });
  }

  // ---------- search everything
  function search(b, q) {
    q = q.trim().toLowerCase();
    if (q.length < 2 || !b) return [];
    const has = (...v) => v.some((x) => String(x || "").toLowerCase().includes(q));
    const out = [];
    (b.ingredients || []).filter((i) => has(i.name, i.code)).forEach((i) => out.push({ kind: "item", id: i.code, icon: "box", title: i.name, meta: i.code + " · " + Math.round(Number(i.qty) || 0) + CEO.unit(i) + " in stock" }));
    (b.production || []).filter((p) => has(p.product, p.client, p.inventoryReference, p.productionId)).forEach((p) => out.push({ kind: "production", id: p.productionId, icon: "flask", title: p.product, meta: [p.client, p.productionStatus].filter(Boolean).join(" · ") }));
    (b.attention || []).filter((a) => has(a.issue, a.category, a.relatedRecord)).forEach((a) => out.push({ kind: "attention", id: a.attentionId, icon: "alert", title: a.issue, meta: "Needs your decision · " + a.status }));
    (b.tasks || []).filter((t) => has(t.title, t.description, t.assignedTo)).forEach((t) => out.push({ kind: "task", id: t.taskId, icon: "list", title: t.title, meta: [t.assignedTo, t.status].filter(Boolean).join(" · ") }));
    (b.deliveries || []).filter((d) => has(d.clientOrSupplier, d.items, d.contact)).forEach((d) => out.push({ kind: "delivery", id: d.deliveryId, icon: "truck", title: (d.direction || "Delivery") + ": " + (d.clientOrSupplier || ""), meta: [CEO.fmtDate(d.deliveryDate), d.status].filter(Boolean).join(" · ") }));
    (b.purchases || []).filter((p) => has(p.item, p.supplier)).forEach((p) => out.push({ kind: "purchase", id: p.purchaseId, icon: "cart", title: p.item, meta: [p.supplier, p.status].filter(Boolean).join(" · ") }));
    return out;
  }

  // From Saturday to Monday, until the coming week's call times are set.
  function sundayCard(b) {
    const k = b && b.bookings;
    const wd = new Date().getUTCDay();
    if (!k || k.weekSet || [6, 0, 1].indexOf(wd) < 0) return "";
    return `<section class="card" style="--accent:${CEO.ACCENTS.bookings}">
      <div class="card-head">${CEO.icon("calendar", "accent")}<h2>Set this week's availability</h2></div>
      <p class="note">Clients can book discovery calls only in the times you set for ${CEO.fmtDate(k.week[0])} to ${CEO.fmtDate(k.week[6])}.</p>
      <div class="card-foot"><button class="btn" data-avail>Set times</button></div></section>`;
  }

  function render(app) {
    const b = CEO.data();
    const needs = CEO.needsYou(b);
    const todays = CEO.todayItems(b);
    const tiles = TILES.filter((t) => t.ready(b));
    const dateLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

    app.innerHTML = CEO.band("Home", dateLabel) + `
      <div class="content cols">
        <label class="search span">${CEO.icon("search")}<span class="sr">Search</span>
          <input type="search" placeholder="Client, product code, ingredient…" autocomplete="off" data-q></label>
        <section class="card span" data-results hidden></section>
        <section class="card" data-needs>
          <div class="card-head">${CEO.icon("alert", "accent")}<h2>Needs you</h2>${needs.length ? `<span class="chip">${needs.length}</span>` : ""}</div>
          ${!b ? `<p class="empty">Loading for the first time…</p>` : needs.length ? `<div class="rows">${needs.slice(0, 5).map(needRow).join("")}</div>` : `<p class="empty">Nothing needs you right now.</p>`}
          ${needs.length > 5 ? `<div class="card-foot"><button class="link" data-seeall>See all ${needs.length}</button></div>` : ""}
        </section>
        ${sundayCard(b)}
        <section class="card" data-today ${b && !todays.length ? "hidden" : ""}>
          <div class="card-head">${CEO.icon("clock", "accent")}<h2>Today</h2></div>
          ${todays.length ? `<div class="rows">${todays.slice(0, 5).map(todayRow).join("")}</div>` : `<p class="empty">Loading…</p>`}
          ${todays.length > 5 ? `<div class="card-foot"><button class="link" data-todayall>See all ${todays.length}</button></div>` : ""}
        </section>
        ${tiles.length ? `<section class="span"><div class="tiles">${tiles.map((t) => `<button class="tile" data-tile="${t.key}" style="--tile-accent:${CEO.ACCENTS[t.accent || t.key]}">${CEO.icon(t.icon)}<strong>${t.label}</strong></button>`).join("")}</div></section>` : ""}
        <div class="span" style="text-align:center"><button class="link" data-signout>Sign out of this device</button></div>
      </div>`;

    CEO.bindBand(app);
    bindRows(app);
    const seeBtn = app.querySelector("[data-seeall]");
    if (seeBtn) seeBtn.onclick = seeAll;
    const todayBtn = app.querySelector("[data-todayall]");
    if (todayBtn) todayBtn.onclick = () => CEO.screen("home", "Today", "", `<div class="content"><section class="card"><div data-list></div></section></div>`,
      (el) => { CEO.pagedRows(el.querySelector("[data-list]"), todays, todayRow); bindRows(el); });
    app.querySelectorAll("[data-tile]").forEach((t) => t.onclick = () => {
      const tile = TILES.find((x) => x.key === t.dataset.tile);
      return tile.open ? tile.open() : CEO.loadSection(tile.key).then((sec) => sec.open());
    });
    const av = app.querySelector("[data-avail]");
    if (av) av.onclick = () => CEO.loadSection("bookings").then((k) => k.openAvailability());
    app.querySelector("[data-signout]").onclick = () => { if (confirm("Sign out of the CEO App on this device?")) CEO.signOut(); };

    const q = app.querySelector("[data-q]"), results = app.querySelector("[data-results]");
    q.oninput = () => {
      const hits = search(CEO.data(), q.value);
      results.hidden = q.value.trim().length < 2;
      results.innerHTML = `<div class="card-head"><h2>Results</h2><span class="chip plain">${hits.length}</span></div><div data-list></div>`;
      CEO.pagedRows(results.querySelector("[data-list]"), hits, todayRow, "No matches.");
    };
  }

  CEO.sections.home = { render };
})();
