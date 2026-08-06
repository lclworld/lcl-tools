import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Save, Printer, ChevronDown, ChevronUp, Clock, RefreshCw, Check } from "lucide-react";

const ORANGE = "#FF914D";
const CREAM = "#FBF8EF";
const YELLOW = "#FFDE59";
const BROWN = "#5B4239";

const DEFAULT_CATEGORIES = {
  "Face & Hand Care": { enabled: true, sizes: [30, 50, 100, 150, 250] },
  "Haircare & Body Care": { enabled: false, sizes: [100, 250, 500, 1000] },
  "Lip Care": { enabled: false, sizes: [5, 10, 15] },
};

const TIERS = [
  { label: "Sample", qty: null },
  { label: "50 units", qty: 50 },
  { label: "100 units", qty: 100 },
  { label: "300 units", qty: 300 },
  { label: "500 units", qty: 500 },
  { label: "1000 units", qty: 1000 },
];

const fmt = (n) =>
  "GHS " +
  (isFinite(n) ? n : 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let uid = 0;
const nextId = () => `id_${Date.now()}_${uid++}`;

export default function App() {
  // ---------- Settings (persisted) ----------
  const [settings, setSettings] = useState({ apiKey: "", sheetId: "", sheetName: "" });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [storageReady, setStorageReady] = useState(false);

  // ---------- Reference batch ----------
  const [refBatch, setRefBatch] = useState({
    productName: "",
    batchSize: "",
    batchUnit: "g",
    ingredientCost: "",
  });

  // ---------- Add-on cost lines ----------
  const [addOns, setAddOns] = useState([
    { id: nextId(), name: "Labor", amount: "", type: "perUnit" },
    { id: nextId(), name: "Buffer", amount: "", type: "perUnit" },
    { id: nextId(), name: "Bottle / container", amount: "", type: "perUnit" },
    { id: nextId(), name: "Carton", amount: "", type: "perUnit" },
    { id: nextId(), name: "Label", amount: "", type: "perUnit" },
    { id: nextId(), name: "Box", amount: "", type: "perUnit" },
    { id: nextId(), name: "Internal shipping fee", amount: "", type: "perBatch" },
  ]);

  // ---------- Markup / overage / sample ----------
  const [markup, setMarkup] = useState({ type: "percent", value: 0 });
  const [overagePercent, setOveragePercent] = useState(10);
  const [sampleQty, setSampleQty] = useState(1);
  const [sampleFee, setSampleFee] = useState(0);

  // ---------- Categories / sizes ----------
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [newSizeInput, setNewSizeInput] = useState({});

  // ---------- Discounts, keyed by cat|size|tier ----------
  const [discounts, setDiscounts] = useState({});

  // ---------- History ----------
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [sheetStatus, setSheetStatus] = useState("");
  const printRef = useRef(null);

  // Load settings + history on mount
  useEffect(() => {
    (async () => {
      try {
        const s = await window.storage.get("instabrand-settings", false);
        if (s && s.value) setSettings(JSON.parse(s.value));
      } catch (e) {}
      await refreshHistory();
      setStorageReady(true);
    })();
  }, []);

  const refreshHistory = async () => {
    try {
      const list = await window.storage.list("instabrand-history:", false);
      if (list && list.keys) {
        const entries = [];
        for (const k of list.keys.slice(-30).reverse()) {
          try {
            const r = await window.storage.get(k, false);
            if (r && r.value) entries.push(JSON.parse(r.value));
          } catch (e) {}
        }
        setHistory(entries);
      }
    } catch (e) {}
  };

  const saveSettings = async () => {
    try {
      await window.storage.set("instabrand-settings", JSON.stringify(settings), false);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (e) {
      setSettingsSaved(false);
    }
  };

  // ---------- Calculation helpers ----------
  const gramsOf = (value, unit) => {
    const v = Number(value) || 0;
    return unit === "kg" ? v * 1000 : v;
  };

  const refGrams = gramsOf(refBatch.batchSize, refBatch.batchUnit);
  const costPerGram = refGrams > 0 ? (Number(refBatch.ingredientCost) || 0) / refGrams : 0;

  const calcTier = (sizeMl, tier, catName) => {
    const qty = tier.label === "Sample" ? Number(sampleQty) || 1 : tier.qty;
    const batchGrams = sizeMl * qty;
    const scaledIngredientCost = costPerGram * batchGrams;
    const overageCost = scaledIngredientCost * ((Number(overagePercent) || 0) / 100);
    const ingredientTotal = scaledIngredientCost + overageCost;
    const perUnitIngredient = qty > 0 ? ingredientTotal / qty : 0;

    const addOnPerUnit = addOns.reduce((sum, a) => {
      const amt = Number(a.amount) || 0;
      return sum + (a.type === "perUnit" ? amt : amt / (qty || 1));
    }, 0);

    const subtotal = perUnitIngredient + addOnPerUnit;
    const markupAmt = markup.type === "percent" ? subtotal * ((Number(markup.value) || 0) / 100) : Number(markup.value) || 0;
    let unitPrice = subtotal + markupAmt;

    const key = `${catName}|${sizeMl}|${tier.label}`;
    const disc = discounts[key];
    let discountAmt = 0;
    if (disc && Number(disc.value) > 0) {
      discountAmt = disc.type === "percent" ? unitPrice * (Number(disc.value) / 100) : Number(disc.value);
      unitPrice -= discountAmt;
    }

    let batchTotal = unitPrice * qty;
    if (tier.label === "Sample") {
      batchTotal += Number(sampleFee) || 0;
      unitPrice = batchTotal / qty;
    }

    return { qty, batchGrams, scaledIngredientCost, overageCost, ingredientTotal, addOnPerUnit, markupAmt, discountAmt, unitPrice, batchTotal, key };
  };

  // ---------- Add-on row handlers ----------
  const updateAddOn = (id, field, value) => setAddOns((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeAddOn = (id) => setAddOns((rows) => rows.filter((r) => r.id !== id));
  const addAddOn = () => setAddOns((rows) => [...rows, { id: nextId(), name: "", amount: "", type: "perUnit" }]);

  // ---------- Category / size handlers ----------
  const toggleCategory = (name) => setCategories((c) => ({ ...c, [name]: { ...c[name], enabled: !c[name].enabled } }));
  const removeSize = (cat, size) =>
    setCategories((c) => ({ ...c, [cat]: { ...c[cat], sizes: c[cat].sizes.filter((s) => s !== size) } }));
  const addSize = (cat) => {
    const val = Number(newSizeInput[cat]);
    if (!val || val <= 0) return;
    setCategories((c) => ({ ...c, [cat]: { ...c[cat], sizes: [...c[cat].sizes, val].sort((a, b) => a - b) } }));
    setNewSizeInput((n) => ({ ...n, [cat]: "" }));
  };

  const setDiscount = (key, field, value) =>
    setDiscounts((d) => ({ ...d, [key]: { ...(d[key] || { type: "flat", value: 0 }), [field]: value } }));

  // ---------- Save to history ----------
  const handleSaveHistory = async () => {
    const snapshot = {
      id: nextId(),
      savedAt: new Date().toISOString(),
      productName: refBatch.productName || "Untitled product",
      refBatch,
      addOns,
      markup,
      overagePercent,
      sampleQty,
      sampleFee,
      categories,
      discounts,
    };
    try {
      await window.storage.set(`instabrand-history:${snapshot.id}`, JSON.stringify(snapshot), false);
      setSaveStatus("Saved to history");
      await refreshHistory();
      setTimeout(() => setSaveStatus(""), 2500);
    } catch (e) {
      setSaveStatus("Could not save — try again");
      setTimeout(() => setSaveStatus(""), 3000);
    }
  };

  const loadSnapshot = (snap) => {
    setRefBatch(snap.refBatch);
    setAddOns(snap.addOns);
    setMarkup(snap.markup);
    setOveragePercent(snap.overagePercent);
    setSampleQty(snap.sampleQty);
    setSampleFee(snap.sampleFee);
    setCategories(snap.categories);
    setDiscounts(snap.discounts);
    setHistoryOpen(false);
  };

  // ---------- Push to Google Sheet ----------
  const pushToSheet = async () => {
    if (!settings.apiKey || !settings.sheetId) {
      setSheetStatus("Add your Sheet connection details above first");
      setTimeout(() => setSheetStatus(""), 3000);
      return;
    }
    setSheetStatus("Sending...");
    const rows = [];
    Object.entries(categories).forEach(([catName, cfg]) => {
      if (!cfg.enabled) return;
      cfg.sizes.forEach((size) => {
        TIERS.forEach((tier) => {
          const r = calcTier(size, tier, catName);
          rows.push({
            product: refBatch.productName,
            category: catName,
            fillSize: size,
            tier: tier.label,
            qty: r.qty,
            unitPrice: Number(r.unitPrice.toFixed(2)),
            batchTotal: Number(r.batchTotal.toFixed(2)),
          });
        });
      });
    });
    try {
      // Expects a Google Apps Script Web App deployment that accepts a POST with
      // { key, sheetId, sheetName, rows } and appends rows to the target sheet/tab.
      const res = await fetch(settings.sheetId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settings.apiKey, sheetName: settings.sheetName, rows }),
      });
      if (res.ok) {
        setSheetStatus("Sent to Google Sheet");
      } else {
        setSheetStatus("Sheet responded with an error — check the connection details");
      }
    } catch (e) {
      setSheetStatus("Could not reach the Sheet endpoint");
    }
    setTimeout(() => setSheetStatus(""), 4000);
  };

  const handlePrint = () => window.print();

  const inputCls =
    "w-full px-3 py-2 rounded-md border border-stone-300 bg-white text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
  const labelCls = "text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1 block";
  const panelCls = "bg-white rounded-xl border border-stone-200 shadow-sm p-5";

  return (
    <div className="min-h-screen" style={{ background: CREAM }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <header className="mb-6 no-print">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold" style={{ background: ORANGE }}>
              L
            </div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: BROWN }}>
              InstaBrand Batch Pricing Calculator
            </h1>
          </div>
          <p className="text-sm text-stone-500 ml-12">Lueur Cosmetics Lab — scale a known batch cost into a full price matrix</p>
        </header>

        {/* SETTINGS */}
        <section className={`${panelCls} mb-5 no-print`}>
          <button className="w-full flex items-center justify-between" onClick={() => setSettingsOpen((o) => !o)}>
            <h2 className="font-semibold text-stone-800">Google Sheet connection</h2>
            {settingsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {settingsOpen && (
            <div className="mt-4">
              <p className="text-xs text-stone-500 mb-3">
                Saved to this device — you won't need to re-enter it. If your setup uses an Apps Script Web App URL
                as the write endpoint, paste that URL into "Sheet ID / endpoint" below.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>API key</label>
                  <input className={inputCls} value={settings.apiKey} onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value }))} placeholder="Access key" />
                </div>
                <div>
                  <label className={labelCls}>Sheet ID / endpoint</label>
                  <input className={inputCls} value={settings.sheetId} onChange={(e) => setSettings((s) => ({ ...s, sheetId: e.target.value }))} placeholder="Sheet ID or web app URL" />
                </div>
                <div>
                  <label className={labelCls}>Sheet name</label>
                  <input className={inputCls} value={settings.sheetName} onChange={(e) => setSettings((s) => ({ ...s, sheetName: e.target.value }))} placeholder="e.g. InstaBrand Pricing" />
                </div>
              </div>
              <button onClick={saveSettings} className="mt-3 px-4 py-2 rounded-md text-white text-sm font-medium flex items-center gap-2" style={{ background: BROWN }}>
                {settingsSaved ? <Check size={14} /> : <Save size={14} />}
                {settingsSaved ? "Saved" : "Save connection"}
              </button>
            </div>
          )}
        </section>

        {/* REFERENCE BATCH */}
        <section className={`${panelCls} mb-5`}>
          <h2 className="font-semibold text-stone-800 mb-4">Reference batch</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className={labelCls}>Product name</label>
              <input className={inputCls} value={refBatch.productName} onChange={(e) => setRefBatch((r) => ({ ...r, productName: e.target.value }))} placeholder="e.g. Whipped Shea Body Butter" />
            </div>
            <div>
              <label className={labelCls}>Reference batch size</label>
              <div className="flex gap-2">
                <input type="number" className={inputCls} value={refBatch.batchSize} onChange={(e) => setRefBatch((r) => ({ ...r, batchSize: e.target.value }))} placeholder="5000" />
                <select className={inputCls + " w-24"} value={refBatch.batchUnit} onChange={(e) => setRefBatch((r) => ({ ...r, batchUnit: e.target.value }))}>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Total ingredient cost</label>
              <input type="number" className={inputCls} value={refBatch.ingredientCost} onChange={(e) => setRefBatch((r) => ({ ...r, ingredientCost: e.target.value }))} placeholder="694.75" />
            </div>
          </div>
          <p className="text-xs text-stone-400 mt-3">
            Every batch size below is scaled from this cost, assuming 1 ml ≈ 1 g for liquid fills. Overage below is calculated on the scaled ingredient cost.
          </p>
        </section>

        {/* ADD-ON COSTS */}
        <section className={`${panelCls} mb-5 no-print`}>
          <h2 className="font-semibold text-stone-800 mb-1">Add-on costs</h2>
          <p className="text-xs text-stone-400 mb-4">Choose per unit or per batch for each line.</p>
          <div className="space-y-2">
            {addOns.map((a) => (
              <div key={a.id} className="grid grid-cols-12 gap-2 items-center">
                <input className={inputCls + " col-span-5"} value={a.name} onChange={(e) => updateAddOn(a.id, "name", e.target.value)} placeholder="Cost name" />
                <input type="number" className={inputCls + " col-span-3"} value={a.amount} onChange={(e) => updateAddOn(a.id, "amount", e.target.value)} placeholder="Amount" />
                <select className={inputCls + " col-span-3"} value={a.type} onChange={(e) => updateAddOn(a.id, "type", e.target.value)}>
                  <option value="perUnit">Per unit</option>
                  <option value="perBatch">Per batch</option>
                </select>
                <button onClick={() => removeAddOn(a.id)} className="col-span-1 text-stone-400 hover:text-red-500 flex justify-center">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addAddOn} className="mt-3 text-sm font-medium flex items-center gap-1" style={{ color: ORANGE }}>
            <Plus size={16} /> Add cost line
          </button>
        </section>

        {/* MARKUP / OVERAGE / SAMPLE */}
        <section className={`${panelCls} mb-5 no-print`}>
          <h2 className="font-semibold text-stone-800 mb-4">Markup, overage & sample</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Markup</label>
              <div className="flex gap-2">
                <input type="number" className={inputCls} value={markup.value} onChange={(e) => setMarkup((m) => ({ ...m, value: e.target.value }))} />
                <select className={inputCls + " w-24"} value={markup.type} onChange={(e) => setMarkup((m) => ({ ...m, type: e.target.value }))}>
                  <option value="percent">%</option>
                  <option value="flat">flat</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Overage %</label>
              <input type="number" className={inputCls} value={overagePercent} onChange={(e) => setOveragePercent(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Sample quantity</label>
              <input type="number" className={inputCls} value={sampleQty} onChange={(e) => setSampleQty(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Sample creation fee</label>
              <input type="number" className={inputCls} value={sampleFee} onChange={(e) => setSampleFee(e.target.value)} />
            </div>
          </div>
        </section>

        {/* CATEGORIES */}
        <section className={`${panelCls} mb-5 no-print`}>
          <h2 className="font-semibold text-stone-800 mb-4">Product categories & fill sizes</h2>
          <div className="space-y-4">
            {Object.entries(categories).map(([name, cfg]) => (
              <div key={name} className="border border-stone-200 rounded-lg p-3">
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={cfg.enabled} onChange={() => toggleCategory(name)} />
                  <span className="font-medium text-stone-700 text-sm">{name}</span>
                </label>
                <div className="flex flex-wrap gap-2 items-center">
                  {cfg.sizes.map((s) => (
                    <span key={s} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs" style={{ background: YELLOW + "55" }}>
                      {s} ml
                      <button onClick={() => removeSize(name, s)} className="text-stone-500 hover:text-red-500">
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="number"
                    className="w-20 px-2 py-1 text-xs rounded-md border border-stone-300"
                    placeholder="+ size"
                    value={newSizeInput[name] || ""}
                    onChange={(e) => setNewSizeInput((n) => ({ ...n, [name]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && addSize(name)}
                  />
                  <button onClick={() => addSize(name)} className="text-xs font-medium" style={{ color: ORANGE }}>
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ACTIONS */}
        <div className="flex flex-wrap gap-3 mb-6 no-print">
          <button onClick={handleSaveHistory} className="px-4 py-2 rounded-md text-white text-sm font-medium flex items-center gap-2" style={{ background: BROWN }}>
            <Save size={15} /> Save to history
          </button>
          <button onClick={handlePrint} className="px-4 py-2 rounded-md text-white text-sm font-medium flex items-center gap-2" style={{ background: ORANGE }}>
            <Printer size={15} /> Print / Save as PDF
          </button>
          <button onClick={pushToSheet} className="px-4 py-2 rounded-md text-sm font-medium border border-stone-300 flex items-center gap-2 text-stone-700 bg-white">
            <RefreshCw size={15} /> Push to Google Sheet
          </button>
          <button onClick={() => setHistoryOpen((o) => !o)} className="px-4 py-2 rounded-md text-sm font-medium border border-stone-300 flex items-center gap-2 text-stone-700 bg-white">
            <Clock size={15} /> History ({history.length})
          </button>
          {(saveStatus || sheetStatus) && <span className="text-sm self-center text-stone-500">{saveStatus || sheetStatus}</span>}
        </div>

        {historyOpen && (
          <section className={`${panelCls} mb-6 no-print`}>
            <h2 className="font-semibold text-stone-800 mb-3">Saved calculations</h2>
            {history.length === 0 && <p className="text-sm text-stone-400">Nothing saved yet.</p>}
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <div>
                    <div className="text-sm font-medium text-stone-700">{h.productName}</div>
                    <div className="text-xs text-stone-400">{new Date(h.savedAt).toLocaleString()}</div>
                  </div>
                  <button onClick={() => loadSnapshot(h)} className="text-xs font-medium" style={{ color: ORANGE }}>
                    Load
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* RESULTS */}
        <div ref={printRef}>
          <div className="print-only mb-4">
            <h1 className="text-xl font-bold" style={{ color: BROWN }}>
              {refBatch.productName || "InstaBrand Pricing"}
            </h1>
            <p className="text-xs text-stone-500">Generated {new Date().toLocaleDateString()} — Lueur Cosmetics Lab</p>
          </div>

          {Object.entries(categories)
            .filter(([, cfg]) => cfg.enabled)
            .map(([catName, cfg]) => (
              <section key={catName} className="mb-8">
                <h2 className="text-lg font-bold mb-3" style={{ color: BROWN }}>
                  {catName}
                </h2>
                {cfg.sizes.map((size) => (
                  <div key={size} className="mb-5">
                    <h3 className="text-sm font-semibold mb-2 text-stone-600">{size} ml</h3>
                    <div className="overflow-x-auto rounded-lg border border-stone-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: CREAM }} className="text-left text-stone-500 text-xs uppercase">
                            <th className="p-2">Tier</th>
                            <th className="p-2">Qty</th>
                            <th className="p-2">Batch size (g)</th>
                            <th className="p-2">Ingr. cost</th>
                            <th className="p-2">Overage</th>
                            <th className="p-2">Discount</th>
                            <th className="p-2">Unit price</th>
                            <th className="p-2">Batch total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {TIERS.map((tier) => {
                            const r = calcTier(size, tier, catName);
                            const disc = discounts[r.key] || { type: "flat", value: 0 };
                            return (
                              <tr key={tier.label} className="border-t border-stone-100">
                                <td className="p-2 font-medium">{tier.label}</td>
                                <td className="p-2">{r.qty}</td>
                                <td className="p-2">{r.batchGrams.toLocaleString()}</td>
                                <td className="p-2">{fmt(r.scaledIngredientCost)}</td>
                                <td className="p-2">{fmt(r.overageCost)}</td>
                                <td className="p-2 no-print">
                                  <div className="flex gap-1">
                                    <input
                                      type="number"
                                      className="w-16 px-1 py-0.5 text-xs rounded border border-stone-300"
                                      value={disc.value}
                                      onChange={(e) => setDiscount(r.key, "value", e.target.value)}
                                    />
                                    <select
                                      className="text-xs rounded border border-stone-300"
                                      value={disc.type}
                                      onChange={(e) => setDiscount(r.key, "type", e.target.value)}
                                    >
                                      <option value="flat">GHS</option>
                                      <option value="percent">%</option>
                                    </select>
                                  </div>
                                </td>
                                <td className="p-2 font-semibold">{fmt(r.unitPrice)}</td>
                                <td className="p-2 font-semibold">{fmt(r.batchTotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}
