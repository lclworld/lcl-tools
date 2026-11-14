/* Work: Operations Centre and Inventory in one place. Reads come from the
   Hub's bundle; every change goes through the owning app's own backend
   action (via the Hub), so that app's rules and activity log still run. */
(function () {
  "use strict";
  const CEO = window.CEO, esc = CEO.esc, L = CEO.LISTS;
  const INVENTORY_APP = "https://lclworld.github.io/lcl-tools/inventory/";
  const OPS_APP = "https://lclworld.github.io/labmanager/";
  const ATTENTION_STATUSES = ["BLOCKED", "WAITING FOR DIRECTOR", "WAITING FOR PURCHASE"];

  const ARR = { attention: ["attention", "attentionId"], task: ["tasks", "taskId"], production: ["production", "productionId"],
    delivery: ["deliveries", "deliveryId"], purchase: ["purchases", "purchaseId"], event: ["calendar", "eventId"] };
  const OPS_UPDATE = { task: "updateTask", production: "updateProduction", delivery: "updateDelivery", purchase: "updatePurchase", event: "updateCalendarEvent" };
  const STATUS_KEY = { task: "status", production: "productionStatus", delivery: "status", purchase: "status", event: "status" };
  const STATUS_LIST = { task: L.task, production: L.production, delivery: L.delivery, purchase: L.purchase, event: ["Scheduled", "Completed", "Cancelled"] };

  function patchLocal(b, kind, id, patch) {
    const [k, idKey] = ARR[kind];
    const rec = (b[k] || []).find((r) => r[idKey] === id);
    if (rec) Object.assign(rec, patch);
  }

  // ---------------------------------------------------------------- changes
  function update(kind, id, patch, message, undoPatch) {
    const payload = { patch };
    payload[ARR[kind][1]] = id;
    CEO.change("ops", OPS_UPDATE[kind], payload, (b) => patchLocal(b, kind, id, patch));
    if (kind === "production") autoResolve(id, patch);
    CEO.closeLayer();
    CEO.refresh();
    CEO.toast(message || "Saved", undoPatch ? () => update(kind, id, undoPatch, "Undone") : null);
  }

  // Same as Operations Centre: a production record leaving a waiting status
  // (or no longer needing review) closes its open "needs your decision" item.
  function autoResolve(productionId, patch) {
    const b = CEO.data(); if (!b) return;
    const resolve = (related, note) => {
      const a = (b.attention || []).find((x) => x.relatedRecord === related && x.status === "Open");
      if (a) CEO.change("ops", "respondDirectorAttention", { attentionId: a.attentionId, newStatus: "Resolved", directorResponse: note },
        (bb) => patchLocal(bb, "attention", a.attentionId, { status: "Resolved", directorResponse: note }));
    };
    if (patch.productionStatus && ATTENTION_STATUSES.indexOf(patch.productionStatus) < 0) resolve(productionId, "Auto-resolved.");
    if (patch.qcStatus && patch.qcStatus !== "Failed") resolve(productionId + "-qc", "Auto-resolved — QC status no longer Failed.");
    if (patch.directorReviewStatus && patch.directorReviewStatus !== "Not Reviewed") resolve(productionId + "-review", "Auto-resolved — Manager Review is no longer Not Reviewed.");
  }

  function setStatus(kind, id, status) {
    const rec = CEO.find(CEO.data(), kind, id); if (!rec) return;
    const key = STATUS_KEY[kind], before = rec[key];
    const patch = {}; patch[key] = status;
    const undo = {}; undo[key] = before;
    const label = kind === "purchase" && status === "Approved" ? "Purchase approved" : kind === "task" && status === "Completed" ? "Task done" : "Status: " + status;
    update(kind, id, patch, label, undo);
  }

  function respond(id, newStatus, response) {
    const a = CEO.find(CEO.data(), "attention", id); if (!a) return;
    const before = { status: a.status, response: a.directorResponse || "" };
    const send = (st, resp, msg, undo) => {
      CEO.change("ops", "respondDirectorAttention", { attentionId: id, newStatus: st, directorResponse: resp },
        (b) => patchLocal(b, "attention", id, { status: st, directorResponse: resp }));
      CEO.closeLayer(); CEO.refresh(); CEO.toast(msg, undo);
    };
    send(newStatus, response, newStatus === "Approved" ? "Approved" : "Marked " + newStatus,
      () => send(before.status, before.response, "Undone"));
  }

  function stockAction(code, action, flagPatch, message, undoAction, undoPatch) {
    CEO.change("inventory", action, { code }, (b) => {
      const i = (b.ingredients || []).find((x) => x.code === code); if (i) Object.assign(i, flagPatch);
    });
    CEO.closeLayer(); CEO.refresh();
    CEO.toast(message, undoAction ? () => stockAction(code, undoAction, undoPatch, "Undone") : null);
  }

  // ---------------------------------------------------------------- detail sheets
  const kv = (pairs) => `<dl class="kv">${pairs.filter((p) => p[1] !== "" && p[1] != null).map((p) => `<dt>${esc(p[0])}</dt><dd>${esc(p[1])}</dd>`).join("")}</dl>`;
  const select = (id, label, list, value) => `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}">${
    (list.indexOf(value) < 0 && value ? [value].concat(list) : list).map((o) => `<option ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
  const D = CEO.fmtDate;

  function open(kind, id) {
    const b = CEO.data();
    if (kind === "item") return openItem(id);
    if (kind === "batch") return openBatch(id);
    if (kind === "lowstock") return openStock();
    const r = CEO.find(b, kind, id);
    if (!r) { CEO.toast("This item is no longer there. Pull to refresh."); return; }

    if (kind === "attention") {
      return CEO.sheet(`<h2>${esc(r.issue || "Needs your decision")}</h2>
        ${kv([["Status", r.status], ["What is needed", r.whatIsNeededFromDirector], ["Missing information", r.missingInformation], ["Category", r.category],
          ["Related to", r.relatedRecord], ["Flagged by", r.flaggedBy], ["Flagged", D(r.dateFlagged)], ["Priority", r.priority], ["Deadline", D(r.deadline)], ["Your last response", r.directorResponse]])}
        <div class="field"><label for="resp">Your response (optional)</label><textarea id="resp" placeholder="Anything the team should know"></textarea></div>
        <button class="btn wide" data-approve>${CEO.icon("check")} Approve</button>
        <details class="more"><summary>Other answers</summary><div class="actions">
          <button class="btn quiet" data-st="Needs More Info">Needs more info</button>
          <button class="btn quiet" data-st="Resolved">Resolved</button>
          <button class="btn danger" data-st="Rejected">Reject</button></div></details>`, (s) => {
        const text = () => s.querySelector("#resp").value.trim();
        s.querySelector("[data-approve]").onclick = () => respond(id, "Approved", text() || "Approved");
        s.querySelectorAll("[data-st]").forEach((btn) => btn.onclick = () => respond(id, btn.dataset.st, text() || btn.dataset.st));
      });
    }

    if (kind === "production") {
      return CEO.sheet(`<h2>${esc(r.product || "Production")}</h2>
        ${kv([["Client", r.client], ["Status", r.productionStatus], ["Planned", D(r.plannedDate)], ["Batch size", r.batchSize], ["Staff", r.assignedStaff],
          ["Inventory ref", r.inventoryReference], ["Packaging", r.packagingReadiness], ["Labels", r.labelReadiness], ["Boxes", r.boxReadiness],
          ["Batch sheet", r.batchSheetStatus], ["SOP", r.sopStatus], ["QC", r.qcStatus], ["Filling", r.fillingStatus], ["PID", r.pifStatus],
          ["Your review", r.directorReviewStatus], ["Blocker", r.blocker], ["Notes", r.notes]])}
        ${select("pst", "Status", L.production, r.productionStatus)}
        <button class="btn wide" data-save>Save</button>
        <details class="more"><summary>More changes</summary>
          ${select("prev", "Your review", ["Not Reviewed", "Reviewed", "Needs Changes"], r.directorReviewStatus || "Not Reviewed")}
          ${select("ppid", "PID status", L.pid, r.pifStatus || "Not Started")}
          <div class="field"><label for="pdate">Planned date</label><input type="date" id="pdate" value="${esc(String(r.plannedDate || "").slice(0, 10))}"></div>
          <a class="btn quiet" href="${OPS_APP}" target="_blank" rel="noopener">${CEO.icon("external", "sm")} Open in Operations Centre</a>
        </details>`, (s) => {
        s.querySelector("[data-save]").onclick = () => {
          const patch = {};
          const pairs = [["productionStatus", "#pst"], ["directorReviewStatus", "#prev"], ["pifStatus", "#ppid"], ["plannedDate", "#pdate"]];
          pairs.forEach(([k, sel]) => { const v = s.querySelector(sel).value; if (v !== String(r[k] == null ? "" : r[k]).slice(0, k === "plannedDate" ? 10 : undefined) && !(k === "directorReviewStatus" && !r[k] && v === "Not Reviewed") && !(k === "pifStatus" && !r[k] && v === "Not Started")) patch[k] = v; });
          if (!Object.keys(patch).length) { CEO.closeLayer(); return; }
          const undo = {}; Object.keys(patch).forEach((k) => undo[k] = r[k] || "");
          update("production", id, patch, "Production updated", undo);
        };
      });
    }

    const titles = { task: r.title, delivery: (r.direction || "Delivery") + ": " + (r.clientOrSupplier || ""), purchase: r.item, event: r.title };
    const facts = {
      task: [["Status", r.status], ["Assigned to", r.assignedTo], ["Due", D(r.dueDate)], ["Priority", r.priority], ["Category", r.category], ["Details", r.description], ["Missing information", r.missingInformation], ["Notes", r.notes], ["Created by", r.createdBy]],
      delivery: [["Status", r.status], ["Date", D(r.deliveryDate)], ["Time", r.expectedTime], ["Items", r.items], ["Contact", r.contact], ["Packaging", r.packagingStatus], ["Labels", r.labelStatus], ["Boxes", r.boxStatus], ["Client confirmed", r.clientConfirmation], ["Payment", r.paymentStatus], ["Cost", r.cost], ["Notes", r.notes]],
      purchase: [["Status", r.status], ["Supplier", r.supplier], ["Quantity", r.quantity], ["Amount", r.amount && "GHS " + r.amount], ["Category", r.category], ["Responsible", r.responsiblePerson], ["Expected", D(r.expectedArrival)], ["Notes", r.notes]],
      event: [["Status", r.status], ["Date", D(r.date)], ["Time", [r.startTime, r.endTime].filter(Boolean).join("–")], ["Type", r.eventType], ["Owner", r.owner], ["Location", r.location], ["Notes", r.notes]]
    }[kind];
    const main = kind === "task" && !CEO.isDone("task", r.status) ? ["Completed", "Mark done"]
      : kind === "purchase" && r.status === "Pending Approval" ? ["Approved", "Approve"]
      : kind === "delivery" && !CEO.isDone("delivery", r.status) ? ["Delivered", "Mark delivered"] : null;
    CEO.sheet(`<h2>${esc(titles[kind] || "")}</h2>${kv(facts)}
      ${main ? `<button class="btn wide" data-main>${CEO.icon("check")} ${main[1]}</button>` : ""}
      <details class="more" ${main ? "" : "open"}><summary>Change status</summary>
        ${select("st", "Status", STATUS_LIST[kind], r[STATUS_KEY[kind]])}
        <button class="btn quiet" data-save>Save status</button></details>`, (s) => {
      if (main) s.querySelector("[data-main]").onclick = () => setStatus(kind, id, main[0]);
      s.querySelector("[data-save]").onclick = () => {
        const v = s.querySelector("#st").value;
        if (v === r[STATUS_KEY[kind]]) return CEO.closeLayer();
        setStatus(kind, id, v);
      };
    });
  }

  function openItem(code) {
    const i = CEO.find(CEO.data(), "item", code);
    if (!i) return CEO.toast("Item not found");
    const t = CEO.threshold(i), u = CEO.unit(i);
    CEO.sheet(`<h2>${esc(i.name)}</h2>
      ${kv([["Code", i.code], ["In stock", Math.round(Number(i.qty) || 0) + u], ["Low stock below", isFinite(t) ? t + u : "Not tracked"], ["Type", i.type], ["MOQ", i.moq],
        ["Last movement", i.lastUpdated ? D(i.lastUpdated) : ""], ["On low stock list", i.discontinued ? "No, discontinued" : i.lowStockExcluded ? "No, removed" : "Yes"]])}
      ${i.discontinued ? `<button class="btn wide" data-a="clearDiscontinued">Not discontinued after all</button>`
        : i.lowStockExcluded ? `<button class="btn wide" data-a="clearLowStockExclusion">Put back on the low stock list</button>`
        : `<button class="btn wide" data-a="excludeFromLowStock">Remove from the low stock list</button>`}
      ${!i.discontinued ? `<details class="more"><summary>More</summary><button class="btn danger" data-a="markDiscontinued">Mark discontinued</button></details>` : ""}`, (s) => {
      s.querySelectorAll("[data-a]").forEach((btn) => btn.onclick = () => {
        const a = btn.dataset.a;
        if (a === "excludeFromLowStock") stockAction(code, a, { lowStockExcluded: true }, "Removed from low stock", "clearLowStockExclusion", { lowStockExcluded: false });
        if (a === "clearLowStockExclusion") stockAction(code, a, { lowStockExcluded: false }, "Back on the low stock list", "excludeFromLowStock", { lowStockExcluded: true });
        if (a === "markDiscontinued") stockAction(code, a, { discontinued: true }, "Marked discontinued", "clearDiscontinued", { discontinued: false });
        if (a === "clearDiscontinued") stockAction(code, a, { discontinued: false }, "No longer discontinued", "markDiscontinued", { discontinued: true });
      });
    });
  }

  function openBatch(id) {
    const x = ((CEO.data() || {}).batches || []).find((b) => b.id === id);
    if (!x) return;
    CEO.sheet(`<h2>${esc(x.name)}</h2>${kv([["Status", x.status === "completed" ? "Completed" : "Waiting to be made"], ["Batch size", x.batchSize], ["Pushed", D(x.pushedAt)]])}
      <p class="note">The team confirms batches in Inventory, which is when stock moves.</p>
      <a class="btn quiet" href="${INVENTORY_APP}" target="_blank" rel="noopener">${CEO.icon("external", "sm")} Open in Inventory</a>`);
  }

  // ---------------------------------------------------------------- list screens
  const rowHtml = (kind, id, icon, title, meta, chip, warn) => `<div class="row" role="button" tabindex="0" data-open="${kind}" data-id="${esc(id)}">
    ${CEO.icon(icon, "accent")}<div class="txt"><span class="t">${esc(title)}</span>${meta ? `<span class="m">${esc(meta)}</span>` : ""}</div>
    ${chip ? `<span class="chip ${warn ? "warn" : ""}">${esc(chip)}</span>` : ""}</div>`;

  // One listener per container, so rows added by "Show more" work too.
  function bindOpen(el) {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    const go = (e) => { const row = e.target.closest("[data-open]"); if (row && el.contains(row)) open(row.dataset.open, row.dataset.id); };
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-open]")) { e.preventDefault(); go(e); } });
  }

  function segmented(accent, title, sub, segs, startKey) {
    CEO.screen(accent, title, sub, `<div style="padding-top:14px"><div class="seg" role="toolbar">${segs.map((s) => `<button data-seg="${s.key}" aria-pressed="false">${esc(s.label)}</button>`).join("")}</div></div>
      <div class="content"><section class="card"><div data-extra></div><div data-list></div></section></div>`, (el) => {
      const show = (key) => {
        const seg = segs.find((s) => s.key === key) || segs[0];
        el.querySelectorAll("[data-seg]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.seg === seg.key)));
        el.querySelector("[data-extra]").innerHTML = seg.extra ? seg.extra() : "";
        if (seg.bindExtra) seg.bindExtra(el.querySelector("[data-extra]"));
        const list = el.querySelector("[data-list]");
        CEO.pagedRows(list, seg.items(), seg.row, seg.empty);
        bindOpen(list);
        current = seg.key;
      };
      let current = startKey || segs[0].key;
      el.querySelectorAll("[data-seg]").forEach((b) => b.onclick = () => show(b.dataset.seg));
      const onRefresh = () => { if (el.isConnected) show(current); else window.removeEventListener("ceo:refresh", onRefresh); };
      window.addEventListener("ceo:refresh", onRefresh);
      show(current);
    });
  }

  const byDate = (k) => (a, z) => String(a[k] || "9999").localeCompare(String(z[k] || "9999"));

  function openDecisions() {
    const items = () => CEO.needsYou(CEO.data()).filter((n) => n.kind !== "lowstock" && n.kind !== "task");
    CEO.screen("work", "Your decisions", "", `<div class="content"><section class="card"><div data-list></div></section></div>`, (el) => {
      const list = el.querySelector("[data-list]");
      const draw = () => CEO.pagedRows(list, items(), (n) => rowHtml(n.kind, n.id, n.kind === "purchase" ? "cart" : n.kind === "production" ? "flask" : "alert", n.title, n.meta), "Nothing is waiting for your decision.");
      const onRefresh = () => { if (el.isConnected) draw(); else window.removeEventListener("ceo:refresh", onRefresh); };
      window.addEventListener("ceo:refresh", onRefresh);
      draw(); bindOpen(list);
    });
  }

  function openOperations(start) {
    const today = CEO.today();
    segmented("work", "Operations", "Production, deliveries, purchasing, tasks", [
      { key: "production", label: "Production", empty: "No active production.",
        items: () => (CEO.data().production || []).filter((p) => !CEO.isDone("production", p.productionStatus)).sort(byDate("plannedDate")),
        row: (p) => rowHtml("production", p.productionId, "flask", p.product, [p.client, D(p.plannedDate)].filter(Boolean).join(" · "), p.productionStatus, ATTENTION_STATUSES.indexOf(p.productionStatus) >= 0) },
      { key: "batches", label: "Pushed batches", empty: "No batches waiting.",
        items: () => (CEO.data().batches || []).filter((x) => x.status !== "completed").sort(byDate("pushedAt")).reverse(),
        row: (x) => rowHtml("batch", x.id, "flask", x.name, "Pushed " + D(x.pushedAt) + (x.batchSize ? " · " + x.batchSize : ""), "Waiting") },
      { key: "deliveries", label: "Deliveries", empty: "No deliveries coming up.",
        items: () => (CEO.data().deliveries || []).filter((d) => !CEO.isDone("delivery", d.status)).sort(byDate("deliveryDate")),
        row: (d) => rowHtml("delivery", d.deliveryId, "truck", (d.direction || "Delivery") + ": " + (d.clientOrSupplier || ""), [D(d.deliveryDate), d.expectedTime].filter(Boolean).join(" · "), d.status, String(d.deliveryDate || "").slice(0, 10) < today) },
      { key: "purchases", label: "Purchasing", empty: "No open purchases.",
        items: () => (CEO.data().purchases || []).filter((p) => !CEO.isDone("purchase", p.status)).sort((a, z) => (a.status === "Pending Approval" ? -1 : 0) - (z.status === "Pending Approval" ? -1 : 0)),
        row: (p) => rowHtml("purchase", p.purchaseId, "cart", p.item, [p.supplier, p.amount && "GHS " + p.amount].filter(Boolean).join(" · "), p.status, p.status === "Pending Approval") },
      { key: "tasks", label: "Tasks", empty: "No open tasks.",
        extra: () => `<div class="card-foot" style="margin-bottom:8px"><button class="btn quiet" data-newtask>+ New task</button></div>`,
        bindExtra: (x) => x.querySelector("[data-newtask]").onclick = newTask,
        items: () => (CEO.data().tasks || []).filter((t) => !CEO.isDone("task", t.status)).sort(byDate("dueDate")),
        row: (t) => rowHtml("task", t.taskId, "list", t.title, [t.assignedTo || "Unassigned", t.dueDate && "due " + D(t.dueDate)].filter(Boolean).join(" · "), t.status, t.dueDate && String(t.dueDate).slice(0, 10) < today) },
      { key: "calendar", label: "Calendar", empty: "Nothing on the calendar ahead.",
        items: () => (CEO.data().calendar || []).filter((e) => String(e.date || "").slice(0, 10) >= today && e.status !== "Cancelled").sort(byDate("date")),
        row: (e) => rowHtml("event", e.eventId, "calendar", e.title, [D(e.date), e.startTime, e.eventType].filter(Boolean).join(" · "), e.status) }
    ], start);
  }

  function newTask() {
    CEO.sheet(`<h2>New task</h2>
      <div class="field"><label for="tt">Task</label><input id="tt" autocomplete="off"></div>
      ${select("ta", "Assigned to", L.staff, "Gloria")}
      <div class="field"><label for="td">Due</label><input type="date" id="td" value="${CEO.addDays(CEO.today(), 1)}"></div>
      ${select("tp", "Priority", L.priority, "Medium")}
      <div class="field"><label for="tn">Details (optional)</label><textarea id="tn"></textarea></div>
      <button class="btn wide" data-add>Add task</button>`, (s) => {
      s.querySelector("[data-add]").onclick = () => {
        const title = s.querySelector("#tt").value.trim();
        if (!title) { s.querySelector("#tt").focus(); return; }
        const task = { title, assignedTo: s.querySelector("#ta").value, dueDate: s.querySelector("#td").value, priority: s.querySelector("#tp").value,
          description: s.querySelector("#tn").value.trim(), status: "Not Started", category: "General", createdDate: new Date().toISOString() };
        CEO.change("ops", "createTask", task, (b) => { (b.tasks = b.tasks || []).push(Object.assign({ taskId: "pending-" + Date.now() }, task)); });
        CEO.closeLayer(); CEO.refresh();
        CEO.toast("Task added for " + task.assignedTo);
      };
    });
  }

  function openStock(start) {
    segmented("work", "Stock", "From Inventory", [
      { key: "low", label: "Low stock", empty: "Nothing is low on stock.",
        items: () => CEO.lowStock(CEO.data() || {}),
        row: (i) => rowHtml("item", i.code, "box", i.name, i.code + " · below " + CEO.threshold(i) + CEO.unit(i), Math.round(Number(i.qty) || 0) + CEO.unit(i), Number(i.qty) <= 0) },
      { key: "all", label: "All items", empty: "No items yet.",
        items: () => ((CEO.data() || {}).ingredients || []).slice().sort((a, z) => String(a.name).localeCompare(String(z.name))),
        row: (i) => rowHtml("item", i.code, "box", i.name, i.code, Math.round(Number(i.qty) || 0) + CEO.unit(i)) },
      { key: "off", label: "Removed from list", empty: "Nothing has been removed from the low stock list.",
        items: () => ((CEO.data() || {}).ingredients || []).filter((i) => i.lowStockExcluded || i.discontinued),
        row: (i) => rowHtml("item", i.code, "box", i.name, i.code, i.discontinued ? "Discontinued" : "Removed") },
      { key: "studio", label: "Studio and prices", empty: "",
        extra: () => `<p class="note">Development Studio, planning, the price sheet and Count Day open in Inventory with the manager PIN. They move into the CEO App in a later pass.</p>
          <div class="actions" style="margin-top:12px"><a class="btn" href="${INVENTORY_APP}" target="_blank" rel="noopener">${CEO.icon("external", "sm")} Open Inventory</a></div>`,
        items: () => [], row: () => "" }
    ], start);
  }

  // ---------------------------------------------------------------- summary
  function render(app) {
    const b = CEO.data();
    const decisions = CEO.needsYou(b).filter((n) => n.kind !== "lowstock" && n.kind !== "task");
    const active = ((b && b.production) || []).filter((p) => !CEO.isDone("production", p.productionStatus));
    const nextUp = active.filter((p) => p.plannedDate).sort(byDate("plannedDate"))[0];
    const waitingBatches = ((b && b.batches) || []).filter((x) => x.status !== "completed").length;
    const openDeliveries = ((b && b.deliveries) || []).filter((d) => !CEO.isDone("delivery", d.status)).length;
    const low = b ? CEO.lowStock(b) : [];

    app.innerHTML = CEO.band("Work", "Operations Centre and Inventory") + `
      <div class="content cols">
        <section class="card">
          <div class="card-head">${CEO.icon("alert", "accent")}<h2>Your decisions</h2></div>
          <div class="big">${decisions.length}</div>
          <p class="note">${decisions.length ? "Approvals and questions from the team." : "Nothing is waiting for you."}</p>
          <div class="card-foot"><button class="btn" data-go="decisions" ${decisions.length ? "" : "disabled"}>Review</button></div>
        </section>
        <section class="card">
          <div class="card-head">${CEO.icon("flask", "accent")}<h2>Operations</h2></div>
          <div class="big">${active.length}</div>
          <p class="note">Active production${nextUp ? `. Next: ${esc(nextUp.product)}, ${esc(D(nextUp.plannedDate))}` : ""}. ${openDeliveries} open deliver${openDeliveries === 1 ? "y" : "ies"}${waitingBatches ? `, ${waitingBatches} pushed batch${waitingBatches === 1 ? "" : "es"} waiting` : ""}.</p>
          <div class="card-foot"><button class="btn" data-go="ops">Open</button></div>
        </section>
        <section class="card">
          <div class="card-head">${CEO.icon("box", "accent")}<h2>Stock</h2></div>
          <div class="big">${low.length}</div>
          <p class="note">${low.length ? "Items low on stock" + (low[0] ? `, lowest: ${esc(low[0].name)}` : "") + "." : "Nothing is low on stock."}</p>
          <div class="card-foot"><button class="btn" data-go="stock">Open</button></div>
        </section>
      </div>`;
    CEO.bindBand(app);
    app.querySelector('[data-go="decisions"]').onclick = openDecisions;
    app.querySelector('[data-go="ops"]').onclick = () => openOperations();
    app.querySelector('[data-go="stock"]').onclick = () => openStock();
  }

  CEO.sections.work = { render, open, respond, setStatus, openStock, openOperations };
})();
