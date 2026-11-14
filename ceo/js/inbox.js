/* Inbox: lueurcosmeticslab@gmail.com sorted into categories, one line per
   email. Reply in the app (you see the whole reply before tapping Send), open
   in Gmail, or move an email to another category (its sender is then
   remembered). Label submissions open the Label Compliance Checker. */
(function () {
  "use strict";
  const CEO = window.CEO, esc = CEO.esc;
  let data = CEO.store.get("ceo_inbox", null);   // last list, so the screen opens offline
  let loading = null;

  function fetchList() {
    if (!loading) loading = CEO.hub("inboxList", null, 120000).then((r) => {
      if (r.status === "ok") { data = r; data.at = new Date().toISOString(); CEO.store.set("ceo_inbox", data); }
      else throw new Error(r.message || "Could not load the inbox");
      return data;
    }).finally(() => { loading = null; });
    return loading;
  }

  const items = (cat) => ((data && data.items) || []).filter((x) => (x.category || "Other") === cat);
  const unreadIn = (cat) => items(cat).filter((x) => x.unread).length;

  function row(x) {
    return `<div class="row" role="button" tabindex="0" data-thread="${esc(x.id)}">
      <div class="txt"><span class="t" style="font-weight:${x.unread ? 800 : 600}">${esc(x.from || x.email)}</span>
      <span class="m">${esc(x.summary || x.subject || "")}</span></div>
      <span class="chip ${x.unread ? "" : "plain"}">${esc(CEO.ago(x.date))}</span></div>`;
  }

  function bindThreads(list, refresh) {
    if (list.dataset.bound) return;
    list.dataset.bound = "1";
    list.addEventListener("click", (e) => { const r = e.target.closest("[data-thread]"); if (r) openThread(r.dataset.thread, refresh); });
    list.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-thread]")) { e.preventDefault(); e.target.click(); } });
  }

  // ---------------------------------------------------------------- one category
  function openCategory(cat) {
    CEO.screen("inbox", cat, "", `<div class="content"><section class="card"><div data-list></div></section></div>`, (el) => {
      const list = el.querySelector("[data-list]");
      const draw = () => {
        const xs = items(cat);
        CEO.pagedRows(list, xs, row, data ? "Nothing in " + cat + " in the last 30 days." : "Loading…");
      };
      bindThreads(list, draw);
      draw();
      if (!data) fetchList().then(draw).catch((e) => CEO.toast(e.message));
    });
  }

  // ---------------------------------------------------------------- one email thread
  async function openThread(id, after) {
    const x = ((data && data.items) || []).find((i) => i.id === id) || {};
    const sheet = CEO.sheet(`<h2>${esc(x.subject || "Email")}</h2><p class="note" data-body>Opening…</p>`);
    let t;
    try {
      t = await CEO.hub("inboxThread", { id });
      if (t.status !== "ok") throw new Error(t.message);
    } catch (e) { sheet.querySelector("[data-body]").textContent = e.message || "Could not open this email."; return; }
    if (x.unread) { x.unread = false; CEO.store.set("ceo_inbox", data); if (after) after(); }
    const cat = x.category || "Other";
    const msgs = t.messages.map((m, i) => `<details class="more" ${i >= t.messages.length - 2 ? "open" : ""}>
        <summary>${esc(m.mine ? "LCL" : m.from)} · ${esc(CEO.fmtWhen(m.date))}</summary>
        <div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:0.95rem">${esc(m.body)}</div>
        ${m.attachments.length ? `<p class="note">Attached: ${esc(m.attachments.join(", "))}</p>` : ""}</details>`).join("");
    const s = sheet.querySelector(".sheet");
    s.innerHTML = `<div class="grab"></div><h2 tabindex="-1">${esc(t.subject)}</h2>
      <div class="actions"><span class="chip">${esc(cat)}</span></div>
      ${cat === "Label Submissions" ? `<button class="btn wide" data-check>${CEO.icon("label")} Check this label</button>` : ""}
      ${msgs}
      <div class="field"><label for="reply">Your reply</label><textarea id="reply" placeholder="Write your reply. Nothing is sent until you tap Send."></textarea></div>
      <button class="btn ${cat === "Label Submissions" ? "quiet" : ""} wide" data-send>${CEO.icon("reply")} Send reply</button>
      <details class="more"><summary>More</summary>
        <div class="field"><label for="mv">Move to</label><select id="mv">${(data.categories || []).map((c) => `<option ${c === cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
        <div class="actions" style="margin-top:8px"><button class="btn quiet" data-move>${CEO.icon("move", "sm")} Move</button>
        <a class="btn quiet" href="${esc(t.link)}" target="_blank" rel="noopener">${CEO.icon("external", "sm")} Open in Gmail</a></div>
      </details>`;
    const check = s.querySelector("[data-check]");
    if (check) check.onclick = () => CEO.loadSection("toolbox").then((tb) => tb.launch(0));
    s.querySelector("[data-send]").onclick = async (e) => {
      const text = s.querySelector("#reply").value.trim();
      if (!text) { s.querySelector("#reply").focus(); return; }
      const to = x.email || "the sender";
      if (!confirm("Send this reply to " + to + "?")) return;
      e.target.disabled = true;
      try {
        const r = await CEO.hub("inboxReply", { id, body: text });
        if (r.status !== "ok") throw new Error(r.message);
        CEO.closeLayer(); CEO.toast("Reply sent");
      } catch (err) { e.target.disabled = false; CEO.toast("Not sent: " + err.message); }
    };
    s.querySelector("[data-move]").onclick = async () => {
      const to = s.querySelector("#mv").value;
      if (to === cat) return;
      try {
        const r = await CEO.hub("inboxMove", { id, category: to });
        if (r.status !== "ok") throw new Error(r.message);
        x.category = to; CEO.store.set("ceo_inbox", data);
        CEO.closeLayer(); if (after) after();
        CEO.toast("Moved to " + to + ". Future mail from " + (x.email || "this sender") + " will go there too.");
      } catch (err) { CEO.toast("Not moved: " + err.message); }
    };
  }

  // ---------------------------------------------------------------- summary
  function render(app) {
    const draw = () => {
      const cats = (data && data.categories) || [];
      const unreadCats = cats.filter((c) => unreadIn(c));
      const labels = items("Label Submissions");
      const labelUnread = unreadIn("Label Submissions");
      app.innerHTML = CEO.band("Inbox", data && data.at ? "lueurcosmeticslab@gmail.com" : "") + `
        <div class="content cols">
          ${data && data.aiReady === false ? `<section class="card span"><p class="note">Sorting by rules only: add your Anthropic key to the Hub so the rest of your mail gets sorted and summarised.</p></section>` : ""}
          <section class="card">
            <div class="card-head">${CEO.icon("inbox", "accent")}<h2>Unread</h2></div>
            ${!data ? `<p class="empty">Loading your inbox…</p>` : unreadCats.length
              ? `<div class="rows">${unreadCats.slice(0, 6).map((c) => `<div class="row" role="button" tabindex="0" data-cat="${esc(c)}"><div class="txt"><span class="t">${esc(c)}</span></div><span class="chip">${unreadIn(c)}</span></div>`).join("")}</div>`
              : `<p class="empty">You are all caught up.</p>`}
          </section>
          <section class="card" ${data && !labels.length ? "hidden" : ""}>
            <div class="card-head">${CEO.icon("label", "accent")}<h2>Label submissions</h2></div>
            <div class="big">${labelUnread || labels.length}</div>
            <p class="note">${labelUnread ? "Waiting for your review." : "In the last 30 days."}</p>
            <div class="card-foot"><button class="btn" data-cat="Label Submissions">Review</button></div>
          </section>
          <section class="card">
            <div class="card-head">${CEO.icon("list", "accent")}<h2>All mail</h2></div>
            <p class="note">${data ? (data.items || []).length + " emails in the last 30 days, in " + cats.length + " categories." : ""}</p>
            <div class="card-foot"><button class="btn" data-all ${data ? "" : "disabled"}>Browse</button></div>
          </section>
        </div>`;
      CEO.bindBand(app);
      app.querySelector("[data-sync]").onclick = () => fetchList().then(draw).then(() => CEO.toast("Inbox up to date")).catch((e) => CEO.toast(e.message));
      app.querySelectorAll("[data-cat]").forEach((r) => r.onclick = () => openCategory(r.dataset.cat));
      const all = app.querySelector("[data-all]");
      if (all) all.onclick = () => CEO.screen("inbox", "All mail", "", `<div class="content"><section class="card"><div class="rows">${cats.map((c) =>
        `<div class="row" role="button" tabindex="0" data-cat="${esc(c)}"><div class="txt"><span class="t">${esc(c)}</span></div><span class="chip ${unreadIn(c) ? "" : "plain"}">${items(c).length}</span></div>`).join("")}</div></section></div>`,
        (el) => el.querySelectorAll("[data-cat]").forEach((r) => r.onclick = () => openCategory(r.dataset.cat)));
    };
    draw();
    fetchList().then(() => { if (app.isConnected) draw(); }).catch((e) => { if (!data) CEO.toast(e.message); });
  }

  CEO.sections.inbox = { render, openCategory };
})();
