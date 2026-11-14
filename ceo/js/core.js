/* LCL CEO App core: sign in, daily PIN, Hub calls, offline cache, write
   queue, navigation, and the small UI helpers every section uses. */
(function () {
  "use strict";
  const CEO = (window.CEO = { sections: {} });
  const HUB = (window.CEO_CONFIG && window.CEO_CONFIG.HUB_URL) || "";
  const VERSION = "ceo-1.2.0";

  // Option 1: Soft. Used only on header bands, icons, the active tab and chips.
  const ACCENTS = {
    home: "#FF914D", inbox: "#6FA8DC", orders: "#7FB48E", work: "#B08968",
    money: "#F2C94C", clients: "#F4A988", socials: "#E79AAE", bookings: "#B9A3D9",
    compliance: "#8CCFC4", strategy: "#9AA5B1", toolbox: "#B08968"
  };
  CEO.ACCENTS = ACCENTS;

  // ---------------------------------------------------------- storage (never throws)
  const store = {
    get(k, fallback) {
      for (const s of [localStorage, sessionStorage]) {
        try { const v = s.getItem(k); if (v != null) return JSON.parse(v); } catch (e) {}
      }
      return fallback;
    },
    set(k, v, session) {
      try { (session ? sessionStorage : localStorage).setItem(k, JSON.stringify(v)); } catch (e) {}
    },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  CEO.store = store;

  // Accra is on UTC all year, so the UTC date is the Accra date.
  CEO.today = () => new Date().toISOString().slice(0, 10);
  CEO.addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  // ---------------------------------------------------------- tiny UI helpers
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  CEO.esc = esc;

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    orders: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
    work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    flask: '<path d="M9 3h6"/><path d="M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
    truck: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/>',
    list: '<path d="M9 6h12"/><path d="M9 12h12"/><path d="M9 18h12"/><path d="m3 6 1 1 2-2"/><path d="m3 12 1 1 2-2"/><path d="m3 18 1 1 2-2"/>',
    box: '<path d="M3 7h18v13H3z"/><path d="M3 7l2-4h14l2 4"/><path d="M10 11h4"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3"/><path d="M20 20v-4h-4"/>',
    label: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    ship: '<path d="M3 17l2 3h14l2-3"/><path d="M5 17V9h14v8"/><path d="M12 9V4"/><path d="M9 4h6"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    reply: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/>',
    move: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    quote: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7"/><path d="M9 17h5"/>',
    book: '<path d="M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M8 20a4 4 0 0 1 0-8h10"/>'
  };
  CEO.icon = (name, cls) => `<svg class="ic ${cls || ""}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

  function soft(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, a = 0.24;
    const mix = (c) => Math.round(255 - (255 - c) * a);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  }
  CEO.setAccent = (key, el) => {
    const t = (el || document.documentElement).style;
    t.setProperty("--accent", ACCENTS[key] || ACCENTS.home);
    t.setProperty("--accent-soft", soft(ACCENTS[key] || ACCENTS.home));
  };

  CEO.toast = (text, undo) => {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const t = document.createElement("div");
    t.className = "toast"; t.setAttribute("role", "status");
    t.innerHTML = `<span>${esc(text)}</span>${undo ? '<button class="link">Undo</button>' : ""}`;
    if (undo) t.querySelector("button").onclick = () => { t.remove(); undo(); };
    document.body.appendChild(t);
    setTimeout(() => t.remove(), undo ? 6000 : 3500);
  };

  // A list that shows 10 at a time with "Show more".
  CEO.pagedRows = (container, items, renderRow, emptyText) => {
    let shown = 10;
    const draw = () => {
      if (!items.length) { container.innerHTML = `<p class="empty">${esc(emptyText || "Nothing here right now.")}</p>`; return; }
      container.innerHTML = `<div class="rows">${items.slice(0, shown).map(renderRow).join("")}</div>` +
        (items.length > shown ? `<button class="link" data-more>Show ${Math.min(10, items.length - shown)} more</button>` : "");
      const more = container.querySelector("[data-more]");
      if (more) more.onclick = () => { shown += 10; draw(); };
    };
    draw();
  };

  // ---------------------------------------------------------- navigation
  // Sub screens and sheets push history entries so the phone's back button closes them.
  const layers = [];
  CEO.pushLayer = (el, onClose) => {
    document.body.appendChild(el);
    layers.push({ el, onClose });
    history.pushState({ layer: layers.length }, "");
  };
  CEO.closeLayer = () => { if (layers.length) history.back(); };
  let needsRefresh = false;
  window.addEventListener("popstate", () => {
    const top = layers.pop();
    if (top) { top.el.remove(); if (top.onClose) top.onClose(); }
    if (needsRefresh) redraw();
  });
  // Redraw after a change: the open screen (if any) redraws its list, and the
  // tab underneath redraws once every screen is closed.
  function redraw() {
    if (layers.length) { window.dispatchEvent(new Event("ceo:refresh")); return; }
    needsRefresh = false;
    if (!document.getElementById("tabbar").hidden) CEO.go(currentTab);
  }
  function closeAllLayers() { while (layers.length) { const l = layers.pop(); l.el.remove(); } }

  CEO.sheet = (html, bind) => {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="sheet-back"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
    wrap.querySelector(".sheet-back").onclick = CEO.closeLayer;
    CEO.pushLayer(wrap);
    if (bind) bind(wrap.querySelector(".sheet"));
    const first = wrap.querySelector(".sheet h2"); if (first) { first.tabIndex = -1; first.focus(); }
    return wrap;
  };

  CEO.screen = (accentKey, title, sub, html, bind) => {
    const el = document.createElement("div");
    el.className = "screen";
    CEO.setAccent(accentKey, el);
    el.innerHTML = `<header class="band"><button class="icon-btn" data-back aria-label="Back">${CEO.icon("back")}</button>
      <h1>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</h1></header>${html}`;
    el.querySelector("[data-back]").onclick = CEO.closeLayer;
    CEO.pushLayer(el);
    if (bind) bind(el);
    return el;
  };

  // Sections load their own file only when first opened.
  const loading = {};
  CEO.loadSection = (name) => {
    if (CEO.sections[name]) return Promise.resolve(CEO.sections[name]);
    if (!loading[name]) {
      loading[name] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = `js/${name}.js?v=${VERSION}`;
        s.onload = () => resolve(CEO.sections[name]);
        s.onerror = () => { delete loading[name]; reject(new Error("Could not load " + name)); };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  };

  const TABS = { home: "Home", inbox: "Inbox", orders: "Orders", work: "Work" };
  let currentTab = "home";
  CEO.go = async (tab) => {
    closeAllLayers();
    if (tab !== currentTab) document.querySelectorAll(".toast").forEach((t) => t.remove());
    currentTab = tab;
    store.set("ceo_tab", tab);
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
    CEO.setAccent(tab);
    const root = document.getElementById("root");
    try {
      const section = await CEO.loadSection(tab);
      root.innerHTML = "";
      const app = document.createElement("div");
      app.className = "app";
      root.appendChild(app);
      section.render(app);
    } catch (e) {
      root.innerHTML = `<div class="gate"><p>${esc(e.message)}. Check your connection and try again.</p><button class="btn" onclick="location.reload()">Reload</button></div>`;
    }
    window.scrollTo(0, 0);
  };
  CEO.refresh = () => {
    needsRefresh = true;
    // A sheet closing right now finishes on popstate, which redraws then.
    setTimeout(() => { if (needsRefresh) redraw(); }, 400);
  };

  // Header band with the sync line underneath; every tab uses it.
  CEO.band = (title, sub) => `<header class="band"><h1>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</h1>
    <button class="icon-btn" data-sync aria-label="Refresh">${CEO.icon("refresh")}</button></header>
    <div class="sync" data-syncline>${syncLine()}</div>`;
  CEO.bindBand = (el) => { const b = el.querySelector("[data-sync]"); if (b) b.onclick = () => CEO.sync(true); };

  // ---------------------------------------------------------- Hub calls
  async function hub(action, data, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 60000);
    try {
      const res = await fetch(HUB, {
        method: "POST", body: JSON.stringify(Object.assign({ action, token: getToken() }, data || {})),
        headers: { "Content-Type": "text/plain;charset=utf-8" }, cache: "no-store", signal: ctrl.signal
      });
      const text = await res.text();
      let out;
      try { out = JSON.parse(text); } catch (e) { throw Object.assign(new Error("The Hub did not answer properly"), { retry: true }); }
      if (out.status === "error" && out.code === "SIGNIN") { store.del("ceo_token"); store.del("ceo_pin_day"); showSignIn(out.message); throw Object.assign(new Error(out.message), { gate: true }); }
      if (out.status === "error" && out.code === "PIN" && action !== "unlock") { store.del("ceo_pin_day"); showPin(); throw Object.assign(new Error(out.message), { gate: true }); }
      return out;
    } catch (e) {
      if (e.name === "AbortError") throw Object.assign(new Error("The Hub took too long"), { retry: true });
      if (e instanceof TypeError) throw Object.assign(new Error("No connection"), { retry: true });
      throw e;
    } finally { clearTimeout(timer); }
  }
  CEO.hub = hub;

  function getToken() { return store.get("ceo_token", ""); }

  // ---------------------------------------------------------- cache + sync
  CEO.data = () => store.get("ceo_bundle", null);
  let syncing = false, lastError = "";

  function syncLine() {
    const b = CEO.data(), q = queue().length;
    const ago = b && b.syncedAt ? timeAgo(b.syncedAt) : "never";
    if (lastError) return `${CEO.icon("alert", "sm")} ${esc(lastError)}${q ? ` · ${q} change${q > 1 ? "s" : ""} waiting` : ""}`;
    if (!navigator.onLine) return `Offline · showing what was saved ${ago}${q ? ` · ${q} waiting` : ""}`;
    if (syncing) return "Updating…";
    if (q) return `Sending ${q} change${q > 1 ? "s" : ""}…`;
    const partial = b && b.errors && b.errors.length ? " · some data could not load" : "";
    return `Updated ${ago}${partial}`;
  }
  function paintSync() {
    document.querySelectorAll("[data-syncline]").forEach((el) => {
      el.innerHTML = syncLine();
      el.classList.toggle("warn", !!lastError || !navigator.onLine);
    });
  }
  function timeAgo(iso) {
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " days ago";
  }

  CEO.sync = async (manual) => {
    if (syncing || !navigator.onLine) { paintSync(); return; }
    syncing = true; paintSync();
    try {
      await flush();
      if (!queue().length) {
        const b = await hub("bundle", null, 90000);
        if (b.status === "ok") {
          b.syncedAt = new Date().toISOString();
          store.set("ceo_bundle", b);
          lastError = "";
          CEO.refresh();
        } else lastError = b.message || "Could not update";
      }
    } catch (e) {
      if (!e.gate) lastError = e.message;
    }
    syncing = false; paintSync();
    if (manual && !lastError) CEO.toast("Up to date");
  };

  // ---------------------------------------------------------- write queue
  // Changes show straight away (the section updates the cached data) and go
  // to the Hub in order, retrying until the owning app confirms.
  function queue() { return store.get("ceo_queue", []); }
  function saveQueue(q) { store.set("ceo_queue", q); }

  CEO.change = (app, writeAction, payload, applyLocal) => {
    const b = CEO.data();
    if (b && applyLocal) { applyLocal(b); store.set("ceo_bundle", b); }
    const q = queue();
    q.push({ id: "ceo-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8), app, writeAction, payload, at: Date.now() });
    saveQueue(q);
    paintSync();
    flush().then(paintSync);
  };

  let flushing = false;
  async function flush() {
    if (flushing || !navigator.onLine) return;
    flushing = true;
    try {
      let q = queue();
      while (q.length) {
        const item = q[0];
        let res;
        try {
          res = await hub("write", { app: item.app, writeAction: item.writeAction, payload: item.payload, actionId: item.id });
        } catch (e) {
          lastError = e.gate ? "" : e.message;
          break; // keep it; try again later
        }
        if (res.status === "ok") {
          lastError = "";
        } else if (res.retry) {
          lastError = res.message; break;
        } else {
          // The owning app refused it (for example, the record was removed). Drop it and say so.
          CEO.toast("Not saved: " + (res.message || "refused"));
        }
        q = queue(); q.shift(); saveQueue(q);
      }
    } finally { flushing = false; }
  }

  window.addEventListener("online", () => CEO.sync());
  window.addEventListener("offline", paintSync);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && isUnlocked()) CEO.sync(); });

  // ---------------------------------------------------------- sign in and PIN gates
  function isUnlocked() { return !!getToken() && store.get("ceo_pin_day", "") === CEO.today(); }

  function gate(html) {
    closeAllLayers();
    document.getElementById("tabbar").hidden = true;
    CEO.setAccent("home");
    document.getElementById("root").innerHTML = `<main class="gate">${html}</main>`;
    return document.getElementById("root");
  }

  function deviceName() {
    const ua = navigator.userAgent;
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Device";
    const br = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : /Firefox/.test(ua) ? "Firefox" : "Browser";
    return os + " · " + br;
  }

  async function showSignIn(message) {
    const root = gate(`<img class="logo" src="assets/logo.png" alt="Lueur Cosmetics Lab">
      <h1>CEO App</h1>
      <p>Sign in with the owner's Google account.</p>
      <div id="gbtn" style="min-height:44px"></div>
      <label class="check"><input type="checkbox" id="remember" checked> Remember this device</label>
      <p class="err" role="alert">${esc(message || "")}</p>`);
    const err = root.querySelector(".err");
    let clientId = "";
    try {
      const r = await fetch(HUB + "?action=config", { cache: "no-store" });
      clientId = (await r.json()).clientId;
    } catch (e) { err.textContent = "Cannot reach the Hub. Check your connection."; return; }
    if (!clientId) { err.textContent = "The Google Client ID is not set in the Hub yet."; return; }
    await loadGoogle();
    google.accounts.id.initialize({
      client_id: clientId, auto_select: false, cancel_on_tap_outside: true,
      callback: async (resp) => {
        err.textContent = "Checking…";
        const remember = root.querySelector("#remember").checked;
        try {
          const out = await hub("signIn", { idToken: resp.credential, device: deviceName(), remember });
          if (out.status !== "ok") { err.textContent = out.message; return; }
          store.del("ceo_token");
          store.set("ceo_token", out.token, !remember);
          showPin();
        } catch (e) { if (!e.gate) err.textContent = e.message; }
      }
    });
    google.accounts.id.renderButton(root.querySelector("#gbtn"), { theme: "outline", size: "large", shape: "pill", text: "signin_with" });
  }
  function loadGoogle() {
    if (window.google && google.accounts) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = res; s.onerror = () => rej(new Error("Google sign in did not load"));
      document.head.appendChild(s);
    });
  }

  function showPin() {
    const root = gate(`<img class="logo" src="assets/logo.png" alt="Lueur Cosmetics Lab" style="width:160px">
      <h1>Manager PIN</h1><p>Once a day on this device.</p>
      <div class="pin-dots" aria-hidden="true"></div>
      <p class="err" role="alert"></p>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join("")}
        <button class="blank" data-k="clear" aria-label="Clear">${CEO.icon("close")}</button><button data-k="0">0</button>
        <button class="blank" data-k="ok" aria-label="Enter">${CEO.icon("check")}</button></div>
      <button class="link" data-switch>Use a different Google account</button>`);
    let pin = "";
    const dots = root.querySelector(".pin-dots"), err = root.querySelector(".err");
    const paint = () => { dots.innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span class="${i < pin.length ? "on" : ""}"></span>`).join(""); };
    paint();
    let location = "";
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => { location = p.coords.latitude.toFixed(4) + ", " + p.coords.longitude.toFixed(4); }, () => {}, { timeout: 4000 });
    const submit = async () => {
      if (pin.length < 4) return;
      err.textContent = "Checking…";
      try {
        const out = await hub("unlock", { pin, location });
        if (out.status === "ok") { store.set("ceo_pin_day", out.day); startApp(); return; }
        err.textContent = out.message + (out.triesLeft != null ? ` (${out.triesLeft} tries left)` : "");
      } catch (e) { if (!e.gate) err.textContent = e.message; }
      pin = ""; paint();
    };
    const press = (k) => {
      if (k === "clear") pin = pin.slice(0, -1);
      else if (k === "ok") return submit();
      else if (pin.length < 8) pin += k;
      paint();
    };
    root.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => press(b.dataset.k)));
    root.querySelector("[data-switch]").onclick = () => { store.del("ceo_token"); store.del("ceo_pin_day"); showSignIn(); };
    document.onkeydown = (e) => {
      if (!document.querySelector(".keypad")) { document.onkeydown = null; return; }
      if (/^\d$/.test(e.key)) press(e.key); else if (e.key === "Backspace") press("clear"); else if (e.key === "Enter") press("ok");
    };
  }

  CEO.signOut = async () => {
    try { await hub("signOut"); } catch (e) {}
    ["ceo_token", "ceo_pin_day", "ceo_bundle", "ceo_queue"].forEach(store.del);
    showSignIn("Signed out.");
  };

  function startApp() {
    document.onkeydown = null;
    const bar = document.getElementById("tabbar");
    bar.hidden = false;
    bar.querySelectorAll(".tab").forEach((b) => {
      b.style.setProperty("--tab-accent", ACCENTS[b.dataset.tab]);
      b.innerHTML = `${CEO.icon(b.dataset.tab)}<span>${TABS[b.dataset.tab]}</span>`;
      b.onclick = () => CEO.go(b.dataset.tab);
    });
    CEO.go(store.get("ceo_tab", "home") in TABS ? store.get("ceo_tab", "home") : "home");
    CEO.sync();
    clearInterval(CEO._timer);
    CEO._timer = setInterval(() => { if (!document.hidden) CEO.sync(); }, 5 * 60 * 1000);
  }

  CEO.start = () => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
    if (!HUB) {
      gate(`<img class="logo" src="assets/logo.png" alt="Lueur Cosmetics Lab"><h1>Almost ready</h1>
        <p>The CEO Hub link has not been added yet. Deploy the Hub, then put its link in config.js.</p>`);
      return;
    }
    if (!getToken()) return showSignIn();
    if (!isUnlocked()) return showPin();
    startApp();
  };
  CEO.VERSION = VERSION;
})();
