/* Storage bridge for the Quote Generator (ceo/quotes.html).
   The Quote Generator was built as a Claude artifact and asks for
   claude.use('db') and claude.use('downloads'). This file supplies both, so
   its own code runs unchanged: quotes, the price book and settings are saved
   in the CEO Hub's Sheet, and PDFs download straight to the device.
   It uses the CEO App's sign in, so it only saves when opened from the app
   on a device that has entered today's PIN. */
(function () {
  "use strict";
  const HUB = (window.CEO_CONFIG && window.CEO_CONFIG.HUB_URL) || "";

  function read(k) {
    for (const s of [localStorage, sessionStorage]) {
      try { const v = s.getItem(k); if (v != null) return JSON.parse(v); } catch (e) {}
    }
    return null;
  }
  const token = read("ceo_token");
  const unlocked = !!HUB && !!token && read("ceo_pin_day") === new Date().toISOString().slice(0, 10);

  async function hub(action, data) {
    const res = await fetch(HUB, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, cache: "no-store",
      body: JSON.stringify(Object.assign({ action, token }, data || {}))
    });
    let out;
    try { out = JSON.parse(await res.text()); } catch (e) { throw new Error("The Hub did not answer properly"); }
    if (out.status !== "ok") throw new Error(out.code === "PIN" || out.code === "SIGNIN" ? "Open the CEO App and enter your PIN, then try again" : out.message || "Hub error");
    return out;
  }

  // ---------- an in-memory copy of every document, kept in step with the Hub
  const docs = new Map();          // path -> data
  const docWatchers = new Map();   // path -> [callback]
  const queryWatchers = [];        // {collection, field, dir, n, cb}
  let loaded = null;

  function load() {
    if (!loaded) loaded = hub("docsGet").then((r) => { docs.clear(); r.docs.forEach((d) => docs.set(d.path, d.data)); notifyAll(); });
    return loaded;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const docSnap = (path) => ({ exists: docs.has(path), id: path.split("/").pop(), data: () => clone(docs.get(path)) });
  function querySnap(q) {
    const prefix = q.collection + "/";
    let rows = [...docs.entries()].filter(([p]) => p.startsWith(prefix) && p.indexOf("/", prefix.length) < 0)
      .map(([p, d]) => ({ id: p.slice(prefix.length), d }));
    if (q.field) rows.sort((a, z) => ((a.d[q.field] > z.d[q.field]) - (a.d[q.field] < z.d[q.field])) * (q.dir === "desc" ? -1 : 1));
    if (q.n) rows = rows.slice(0, q.n);
    return { empty: !rows.length, size: rows.length, docs: rows.map((r) => ({ id: r.id, exists: true, data: () => clone(r.d) })) };
  }
  function notify(path) {
    (docWatchers.get(path) || []).forEach((cb) => { try { cb(docSnap(path)); } catch (e) {} });
    queryWatchers.forEach((q) => { if (path.startsWith(q.collection + "/")) try { q.cb(querySnap(q)); } catch (e) {} });
  }
  function notifyAll() {
    docWatchers.forEach((_, p) => notify(p));
    queryWatchers.forEach((q) => { try { q.cb(querySnap(q)); } catch (e) {} });
  }

  function query(collection, field, dir, n) {
    const q = { collection, field, dir, n };
    return {
      orderBy: (f, d) => query(collection, f, d || "asc", n),
      limit: (k) => query(collection, field, dir, k),
      get: async () => { loaded = null; await load(); return querySnap(q); },
      onSnapshot: (cb, err) => {
        const w = Object.assign({ cb }, q);
        queryWatchers.push(w);
        load().then(() => cb(querySnap(q)), (e) => err && err(e));
        return () => queryWatchers.splice(queryWatchers.indexOf(w), 1);
      }
    };
  }

  const db = {
    doc: (path) => ({
      async get() { await load(); return docSnap(path); },
      async set(data) {
        await hub("docSet", { path, data });
        docs.set(path, clone(data)); notify(path);
      },
      async update(patch) {
        await hub("docUpdate", { path, patch });
        docs.set(path, Object.assign(clone(docs.get(path) || {}), clone(patch))); notify(path);
      },
      onSnapshot(cb, err) {
        if (!docWatchers.has(path)) docWatchers.set(path, []);
        docWatchers.get(path).push(cb);
        load().then(() => cb(docSnap(path)), (e) => err && err(e));
        return () => { const a = docWatchers.get(path); a.splice(a.indexOf(cb), 1); };
      },
      // Quote numbers are taken one save at a time; the Hub serialises the writes.
      async acquire() { return { acquired: true, release: async () => {} }; }
    }),
    collection: (name) => query(name)
  };

  const downloads = {
    async save({ filename, data }) {
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  };

  // Pick up changes made on another device when the page comes back into view.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && unlocked) { loaded = null; load().catch(() => {}); } });

  window.claude = Object.assign(window.claude || {}, {
    use: async (name) => {
      if (name === "downloads") return downloads;
      if (name === "db") { if (!unlocked) throw new Error("not signed in"); await load(); return db; }
      throw new Error("Not available: " + name);
    }
  });
})();
