/* Orders: every paid order from Zoho Invoice and InstaBrand. Changing a
   status shows the client email first; it is only sent when you tap Send.
   Pickup and delivery ask for the date. Each order keeps its status history. */
(function () {
  "use strict";
  const CEO = window.CEO, esc = CEO.esc;
  let data = CEO.store.get("ceo_orders", null);
  let loading = null;
  const STATUSES = ["Order confirmed", "Label received", "In production", "Quality check", "Scheduled for pickup", "Scheduled for delivery", "Delivered"];

  function fetchList(refresh) {
    if (!loading) loading = CEO.hub("ordersList", { refresh: !!refresh }, 120000).then((r) => {
      if (r.status !== "ok") throw new Error(r.message || "Could not load orders");
      data = r; data.at = new Date().toISOString(); CEO.store.set("ceo_orders", data);
      if (r.errors && r.errors.length) CEO.toast(r.errors[0]);
      return data;
    }).finally(() => { loading = null; });
    return loading;
  }

  const orders = () => (data && data.orders) || [];
  const quiet = (o) => (CEO.data() && (CEO.data().orders || []).find((x) => x.key === o.key) || {}).quietDays || 0;
  const needsUpdate = (o) => o.status !== "Delivered" && (!o.status || quiet(o) >= 5);
  const money = (o) => (o.currency || "GHS") + " " + Number(o.amount || 0).toLocaleString("en-GB", { maximumFractionDigits: 2 });
  const nextStatus = (s) => STATUSES[Math.min(STATUSES.indexOf(s) + 1, STATUSES.length - 1)] || STATUSES[0];

  function row(o) {
    return `<div class="row" role="button" tabindex="0" data-order="${esc(o.key)}">${CEO.icon("orders", "accent")}
      <div class="txt"><span class="t">${esc(o.client || "Client")}</span><span class="m">#${esc(o.number)} · ${esc(o.source)} · paid ${esc(CEO.fmtDate(o.paid))}</span></div>
      <span class="chip ${!o.status || needsUpdate(o) ? "warn" : ""}">${esc(o.status || "New")}</span></div>`;
  }
  function bindOrders(list, after) {
    if (list.dataset.bound) return;
    list.dataset.bound = "1";
    list.addEventListener("click", (e) => { const r = e.target.closest("[data-order]"); if (r) openOrder(r.dataset.order, false, after); });
    list.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-order]")) { e.preventDefault(); e.target.click(); } });
  }

  function listScreen(title, filter) {
    CEO.screen("orders", title, "", `<div class="content"><section class="card"><div data-list></div></section></div>`, (el) => {
      const list = el.querySelector("[data-list]");
      const draw = () => CEO.pagedRows(list, orders().filter(filter), row, data ? "No orders here." : "Loading…");
      bindOrders(list, draw);
      draw();
      if (!data) fetchList().then(draw).catch((e) => CEO.toast(e.message));
    });
  }

  // ---------------------------------------------------------------- one order
  async function openOrder(key, startUpdate, after) {
    if (!data) { try { await fetchList(); } catch (e) { CEO.toast(e.message); return; } }
    let o = orders().find((x) => x.key === key);
    if (!o) { CEO.toast("Order not found. Pull to refresh."); return; }
    const wrap = CEO.sheet(`<h2>${esc(o.client || "Order")}</h2><div data-body></div>`);
    const s = wrap.querySelector(".sheet");
    const draw = () => {
      s.innerHTML = `<div class="grab"></div><h2 tabindex="-1">${esc(o.client || "Order")}</h2>
        <dl class="kv"><dt>Order</dt><dd>#${esc(o.number)} · ${esc(o.source)}</dd><dt>Amount</dt><dd>${esc(money(o))}</dd>
          <dt>Paid</dt><dd>${esc(CEO.fmtDate(o.paid))}</dd><dt>Status</dt><dd>${esc(o.status || "New, no update sent yet")}${o.statusDate ? " · " + esc(CEO.fmtDate(o.statusDate)) : ""}</dd>
          <dt>Client email</dt><dd>${esc(o.email || "Not on file")}</dd>${o.products ? `<dt>Products</dt><dd style="white-space:pre-wrap">${esc(o.products)}</dd>` : ""}</dl>
        <button class="btn wide" data-update>${CEO.icon("move")} ${o.status ? "Update status" : "Send Order confirmed"}</button>
        ${(o.history || []).length ? `<details class="more"><summary>Status history</summary><div class="rows">${o.history.slice().reverse().map((h) =>
          `<div class="row" style="cursor:default"><div class="txt"><span class="t">${esc(h.status)}${h.date ? " · " + esc(CEO.fmtDate(h.date)) : ""}</span>
           <span class="m">${esc(CEO.fmtWhen(h.at))} · ${h.emailed ? "client emailed" : "saved without email"}</span></div></div>`).join("")}</div></details>` : ""}`;
      s.querySelector("[data-update]").onclick = () => chooseStatus();
    };
    draw();
    if (!o.products) CEO.hub("orderDetail", { key }).then((r) => {
      if (r.status === "ok") { Object.assign(o, r.order); CEO.store.set("ceo_orders", data); if (s.isConnected && !s.querySelector("[data-preview]")) draw(); }
    }).catch(() => {});

    // Step 1: pick the status (and the date for pickup or delivery).
    function chooseStatus() {
      const suggested = o.status ? nextStatus(o.status) : "Order confirmed";
      s.innerHTML = `<div class="grab"></div><h2 tabindex="-1">Update ${esc(o.client || "order")}</h2>
        <div class="field"><label for="ost">New status</label><select id="ost">${STATUSES.map((x) => `<option ${x === suggested ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
        <div class="field" data-datefield><label for="odate">Date</label><input type="date" id="odate" value="${esc(CEO.addDays(CEO.today(), 1))}"></div>
        <button class="btn wide" data-preview>Preview the client email</button>
        <details class="more"><summary>More</summary><button class="btn quiet" data-silent>Save the status without emailing</button></details>`;
      const st = s.querySelector("#ost"), df = s.querySelector("[data-datefield]");
      const showDate = () => { df.hidden = !/^Scheduled/.test(st.value); };
      st.onchange = showDate; showDate();
      const date = () => (/^Scheduled/.test(st.value) ? s.querySelector("#odate").value : "");
      s.querySelector("[data-preview]").onclick = async (e) => {
        if (/^Scheduled/.test(st.value) && !date()) { s.querySelector("#odate").focus(); return; }
        e.target.disabled = true; e.target.textContent = "Preparing…";
        try {
          const r = await CEO.hub("orderPreview", { key, status: st.value, date: date() });
          if (r.status !== "ok") throw new Error(r.message);
          preview(st.value, date(), r.email);
        } catch (err) { e.target.disabled = false; e.target.textContent = "Preview the client email"; CEO.toast(err.message); }
      };
      s.querySelector("[data-silent]").onclick = () => save(st.value, date(), null);
    }

    // Step 2: the email as the client will get it. Edit, then Send.
    function preview(status, date, email) {
      s.innerHTML = `<div class="grab"></div><h2 tabindex="-1">Preview: ${esc(status)}</h2>
        <div class="field"><label for="eto">To</label><input id="eto" type="email" value="${esc(email.to || "")}" placeholder="client@example.com"></div>
        <div class="field"><label for="esub">Subject</label><input id="esub" value="${esc(email.subject)}"></div>
        <div class="field"><label for="ebody">Email</label><textarea id="ebody" style="min-height:260px">${esc(email.body)}</textarea></div>
        <button class="btn wide" data-send>${CEO.icon("check")} Send</button>
        <details class="more"><summary>More</summary><div class="actions"><button class="btn quiet" data-back>Back</button>
          <button class="btn quiet" data-silent>Save the status without emailing</button></div></details>`;
      s.querySelector("[data-back]").onclick = chooseStatus;
      s.querySelector("[data-silent]").onclick = () => save(status, date, null);
      s.querySelector("[data-send]").onclick = () => {
        const to = s.querySelector("#eto").value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { s.querySelector("#eto").focus(); CEO.toast("Add the client's email address"); return; }
        save(status, date, { to, subject: s.querySelector("#esub").value, body: s.querySelector("#ebody").value });
      };
    }

    async function save(status, date, email) {
      const btns = s.querySelectorAll("button"); btns.forEach((b) => b.disabled = true);
      try {
        const r = await CEO.hub("orderSetStatus", Object.assign({ key, status, date, send: !!email }, email || {}));
        if (r.status !== "ok") throw new Error(r.message);
        Object.assign(o, r.order); CEO.store.set("ceo_orders", data);
        // Keep Home's copy in step until the next sync.
        const b = CEO.data(); if (b && b.orders) { const h = b.orders.find((x) => x.key === key); if (h) { h.status = status; h.quietDays = 0; } CEO.store.set("ceo_bundle", b); }
        CEO.closeLayer(); CEO.refresh(); if (after) after();
        CEO.toast(r.sent ? "Sent to " + (email.to) : "Status saved");
      } catch (err) { btns.forEach((b) => b.disabled = false); CEO.toast(err.message); }
    }

    if (startUpdate) chooseStatus();
  }

  // ---------------------------------------------------------------- summary
  function render(app) {
    const draw = () => {
      const all = orders();
      const update = all.filter(needsUpdate);
      const active = all.filter((o) => o.status && o.status !== "Delivered");
      const monthAgo = CEO.addDays(CEO.today(), -30);
      const delivered = all.filter((o) => o.status === "Delivered" && String((o.history || []).slice(-1)[0]?.at || "").slice(0, 10) >= monthAgo);
      const notReady = data && !data.zohoReady;
      app.innerHTML = CEO.band("Orders", "Zoho Invoice and InstaBrand") + `
        <div class="content cols">
          ${notReady ? `<section class="card span"><p class="note">Zoho is not connected yet: add the four Zoho details to the Hub's Script Properties.${data.instabrandReady ? "" : " InstaBrand orders start once its subject line is set."}</p></section>` : ""}
          <section class="card">
            <div class="card-head">${CEO.icon("alert", "accent")}<h2>Needs an update</h2></div>
            <div class="big">${data ? update.length : "…"}</div>
            <p class="note">${update.length ? "New paid orders and orders with no update for 5 working days." : "Every client has heard from you recently."}</p>
            <div class="card-foot"><button class="btn" data-go="update" ${update.length ? "" : "disabled"}>Update</button></div>
          </section>
          <section class="card">
            <div class="card-head">${CEO.icon("orders", "accent")}<h2>In progress</h2></div>
            <div class="big">${data ? active.length : "…"}</div>
            <p class="note">${STATUSES.slice(0, 6).map((st) => [st, active.filter((o) => o.status === st).length]).filter((p) => p[1]).map((p) => p[1] + " " + p[0].toLowerCase()).join(", ") || "Nothing in progress."}</p>
            <div class="card-foot"><button class="btn" data-go="active" ${active.length ? "" : "disabled"}>Open</button></div>
          </section>
          <section class="card" ${data && !delivered.length ? "hidden" : ""}>
            <div class="card-head">${CEO.icon("check", "accent")}<h2>Delivered</h2></div>
            <div class="big">${delivered.length}</div>
            <p class="note">In the last 30 days.</p>
            <div class="card-foot"><button class="btn" data-go="delivered">See</button></div>
          </section>
          <div class="span" style="text-align:center"><button class="link" data-go="all">All orders</button></div>
        </div>`;
      CEO.bindBand(app);
      app.querySelector("[data-sync]").onclick = () => fetchList(true).then(draw).then(() => CEO.toast("Orders up to date")).catch((e) => CEO.toast(e.message));
      const go = { update: ["Needs an update", needsUpdate], active: ["In progress", (o) => o.status && o.status !== "Delivered"],
        delivered: ["Delivered", (o) => o.status === "Delivered"], all: ["All orders", () => true] };
      app.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => listScreen(go[b.dataset.go][0], go[b.dataset.go][1]));
    };
    draw();
    fetchList().then(() => { if (app.isConnected) draw(); }).catch((e) => { if (!data) CEO.toast(e.message); });
  }

  CEO.sections.orders = { render, openOrder };
})();
