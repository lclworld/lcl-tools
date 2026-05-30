import { useState, useRef, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const LCL_BROWN = "#5c4a32";
const LCL_DARK = "#3a2e20";
const LCL_ORANGE = "#e07830";
const LCL_LIGHT = "#f5f0e8";

const PACKAGING_TYPES = [
  "Lip Gloss Tube", "Roll-On Tube", "Serum Bottle", "Dropper Bottle",
  "Pump Bottle", "Jar", "Squeeze Tube", "Airless Pump",
  "Lipstick Case", "Compact", "Other"
];

const CAP_COLOR_OPTIONS = [
  { label: "Black", hex: "#1a1a1a" },
  { label: "White", hex: "#f0f0f0" },
  { label: "Pink", hex: "#f4a7b9" },
  { label: "Hot Pink", hex: "#e91e8c" },
  { label: "Lavender", hex: "#b39ddb" },
  { label: "Blue", hex: "#90caf9" },
  { label: "Orange", hex: "#ffb74d" },
  { label: "Yellow", hex: "#fff176" },
  { label: "Green", hex: "#a5d6a7" },
  { label: "Red", hex: "#ef9a9a" },
  { label: "Gold", hex: "#fdd835" },
  { label: "Silver", hex: "#bdbdbd" },
  { label: "Clear", hex: "#e8f4f8" },
  { label: "Teal", hex: "#80cbc4" },
];

const emptyProduct = () => ({
  id: Date.now() + Math.random(),
  name: "",
  refCode: "",
  packagingType: "",
  volume: "",
  volumeUnit: "ml",
  material: "Plastic",
  moq: "",
  unitCostPlain: "",
  unitCostPrinted: "",
  printedPriceType: "fixed",
  bestFitFor: [],
  availableColors: [],
  boxOptions: "",
  additionalNotes: "",
  images: [],
});

const BEST_FIT_OPTIONS = [
  "Lip Gloss", "Lip Oil", "Perfume Oil", "Lip Balm",
  "Serum", "Face Oil", "Body Oil", "Toner",
  "Moisturizer", "Eye Cream", "Foundation",
  "Lipstick", "Mascara", "Other"
];

// ─── IMAGE UPLOAD COMPONENT ───────────────────────────────────────────────────
function ImageUploader({ images, onChange, maxImages = 4 }) {
  const inputRef = useRef();

  const handleFiles = (files) => {
    const fileArr = Array.from(files).slice(0, maxImages - images.length);
    fileArr.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        onChange(prev => [...prev, { src: e.target.result, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [images]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => images.length < maxImages && inputRef.current.click()}
        style={{
          border: `2px dashed ${LCL_BROWN}40`,
          borderRadius: 8,
          padding: "16px 12px",
          textAlign: "center",
          cursor: images.length < maxImages ? "pointer" : "not-allowed",
          background: images.length < maxImages ? "#faf7f2" : "#f0ede8",
          transition: "all 0.2s",
          fontSize: 12,
          color: images.length < maxImages ? LCL_BROWN : "#aaa",
        }}
      >
        <div style={{ fontSize: 20, marginBottom: 4 }}>📷</div>
        {images.length < maxImages
          ? `Drop images or click to upload (${images.length}/${maxImages})`
          : `Maximum ${maxImages} images reached`}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>
      {images.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img
                src={img.src}
                alt={img.name}
                style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: `1px solid ${LCL_BROWN}30` }}
              />
              <button
                onClick={() => onChange(prev => prev.filter((_, idx) => idx !== i))}
                style={{
                  position: "absolute", top: -6, right: -6,
                  background: "#e53935", color: "white", border: "none",
                  borderRadius: "50%", width: 18, height: 18, fontSize: 10,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  lineHeight: 1,
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── COLOR SELECTOR ───────────────────────────────────────────────────────────
function ColorSelector({ selected, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {CAP_COLOR_OPTIONS.map(c => {
        const isSelected = selected.includes(c.label);
        return (
          <button
            key={c.label}
            title={c.label}
            onClick={() => onChange(
              isSelected ? selected.filter(s => s !== c.label) : [...selected, c.label]
            )}
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: c.hex,
              border: isSelected ? `3px solid ${LCL_BROWN}` : `2px solid #ccc`,
              cursor: "pointer",
              transform: isSelected ? "scale(1.15)" : "scale(1)",
              transition: "all 0.15s",
              boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 4px ${LCL_BROWN}` : "none",
            }}
          />
        );
      })}
      <span style={{ fontSize: 11, color: "#888", alignSelf: "center", marginLeft: 4 }}>
        {selected.length > 0 ? selected.join(", ") : "None selected"}
      </span>
    </div>
  );
}

// ─── PRODUCT FORM ─────────────────────────────────────────────────────────────
function ProductForm({ product, index, onChange, onRemove, productCount }) {
  const update = (field, value) => onChange({ ...product, [field]: value });
  const [open, setOpen] = useState(true);

  return (
    <div style={{
      background: "white",
      border: `1px solid ${LCL_BROWN}25`,
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: "0 2px 8px rgba(92,74,50,0.06)",
    }}>
      {/* Header */}
      <div
        style={{
          background: LCL_BROWN,
          color: "white",
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.05em" }}>
          PRODUCT #{index + 1} {product.name ? `— ${product.name.toUpperCase()}` : ""}
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {productCount > 1 && (
            <button
              onClick={e => { e.stopPropagation(); onRemove(); }}
              style={{
                background: "rgba(255,255,255,0.15)", color: "white",
                border: "1px solid rgba(255,255,255,0.3)", borderRadius: 4,
                padding: "2px 8px", fontSize: 12, cursor: "pointer",
              }}
            >Remove</button>
          )}
          <span style={{ fontSize: 16 }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Images - full width */}
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Product Images (up to 4)</Label>
            <ImageUploader
              images={product.images}
              onChange={imgs => update("images", typeof imgs === "function" ? imgs(product.images) : imgs)}
            />
          </div>

          <Field label="Packaging Name *">
            <Input value={product.name} onChange={v => update("name", v)} placeholder="e.g. RB Roll Tube" />
          </Field>

          <Field label="Reference Code *">
            <Input value={product.refCode} onChange={v => update("refCode", v)} placeholder="e.g. RT1001" />
          </Field>

          <Field label="Packaging Type">
            <select
              value={product.packagingType}
              onChange={e => update("packagingType", e.target.value)}
              style={inputStyle}
            >
              <option value="">Select type...</option>
              {PACKAGING_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="Material">
            <Input value={product.material} onChange={v => update("material", v)} placeholder="e.g. Plastic, Glass, PU Leather" />
          </Field>

          <Field label="Volume / Size">
            <div style={{ display: "flex", gap: 6 }}>
              <Input value={product.volume} onChange={v => update("volume", v)} placeholder="e.g. 7" style={{ flex: 1 }} />
              <select
                value={product.volumeUnit}
                onChange={e => update("volumeUnit", e.target.value)}
                style={{ ...inputStyle, width: 80 }}
              >
                <option>ml</option>
                <option>oz</option>
                <option>g</option>
                <option>cm</option>
                <option>mm</option>
                <option>L</option>
              </select>
            </div>
          </Field>

          <Field label="MOQ (Minimum Order Quantity) *">
            <Input value={product.moq} onChange={v => update("moq", v)} placeholder="e.g. 500" type="number" />
          </Field>

          <Field label="Unit Cost — Without Design Print (USD)">
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: LCL_BROWN, fontWeight: 600 }}>$</span>
              <Input value={product.unitCostPlain} onChange={v => update("unitCostPlain", v)} placeholder="1.01" type="number" style={{ paddingLeft: 22 }} />
            </div>
          </Field>

          <Field label="Unit Cost — With Design Print (USD)">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {product.printedPriceType === "fixed" ? (
                <div style={{ position: "relative", flex: 1 }}>
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: LCL_BROWN, fontWeight: 600 }}>$</span>
                  <Input value={product.unitCostPrinted} onChange={v => update("unitCostPrinted", v)} placeholder="1.41" type="number" style={{ paddingLeft: 22 }} />
                </div>
              ) : (
                <Input
                  value={product.unitCostPrinted}
                  onChange={v => update("unitCostPrinted", v)}
                  placeholder={product.printedPriceType === "logo" ? "Depends on logo colors" : "Does not support"}
                  style={{ flex: 1 }}
                  disabled={product.printedPriceType !== "custom"}
                />
              )}
              <select
                value={product.printedPriceType}
                onChange={e => {
                  update("printedPriceType", e.target.value);
                  if (e.target.value !== "fixed" && e.target.value !== "custom") {
                    update("unitCostPrinted", "");
                  }
                }}
                style={{ ...inputStyle, width: 170 }}
              >
                <option value="fixed">Fixed price</option>
                <option value="logo">Depends on logo colors</option>
                <option value="none">Does not support</option>
                <option value="custom">Custom text</option>
              </select>
            </div>
          </Field>

          {/* Best Fit For */}
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Best Fit For</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {BEST_FIT_OPTIONS.map(opt => {
                const sel = product.bestFitFor.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => update("bestFitFor", sel
                      ? product.bestFitFor.filter(x => x !== opt)
                      : [...product.bestFitFor, opt]
                    )}
                    style={{
                      padding: "4px 10px", borderRadius: 20, fontSize: 12,
                      border: `1px solid ${sel ? LCL_BROWN : "#ddd"}`,
                      background: sel ? LCL_BROWN : "white",
                      color: sel ? "white" : LCL_BROWN,
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >{opt}</button>
                );
              })}
            </div>
          </div>

          {/* Colors */}
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Available Cap / Body Colors</Label>
            <ColorSelector
              selected={product.availableColors}
              onChange={v => update("availableColors", v)}
            />
          </div>

          {/* Box Options */}
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Box / Packaging Options (optional)">
              <textarea
                value={product.boxOptions}
                onChange={e => update("boxOptions", e.target.value)}
                placeholder="e.g. White box available, custom printed box at +$0.30/unit"
                style={{ ...inputStyle, height: 60, resize: "vertical" }}
              />
            </Field>
          </div>

          {/* Notes */}
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Additional Notes / Specifications">
              <textarea
                value={product.additionalNotes}
                onChange={e => update("additionalNotes", e.target.value)}
                placeholder="e.g. Available with keychain, leak-proof wiper included..."
                style={{ ...inputStyle, height: 60, resize: "vertical" }}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SMALL HELPERS ────────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: `1px solid ${LCL_BROWN}30`, fontSize: 13,
  fontFamily: "inherit", background: "#fdfcfa", color: "#333",
  boxSizing: "border-box", outline: "none",
};

function Input({ value, onChange, placeholder, type = "text", style = {}, disabled = false }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{ ...inputStyle, ...style, opacity: disabled ? 0.5 : 1 }}
    />
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: LCL_BROWN, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{children}</div>;
}

function Field({ label, children }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ─── PDF PREVIEW / GENERATION ─────────────────────────────────────────────────
function generateCatalogHTML({ clientName, year, products }) {
  const logoSVG = `<svg width="48" height="38" viewBox="0 0 120 96" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="38" cy="28" rx="22" ry="18" fill="${LCL_ORANGE}" transform="rotate(-20,38,28)"/>
    <circle cx="18" cy="44" r="10" fill="${LCL_ORANGE}"/>
    <circle cx="62" cy="18" r="9" fill="${LCL_ORANGE}"/>
    <ellipse cx="72" cy="56" rx="22" ry="16" fill="${LCL_DARK}" transform="rotate(15,72,56)"/>
    <circle cx="96" cy="52" r="9" fill="${LCL_DARK}"/>
    <circle cx="62" cy="72" r="8" fill="${LCL_DARK}"/>
  </svg>`;

  const colorMap = Object.fromEntries(CAP_COLOR_OPTIONS.map(c => [c.label, c.hex]));

  const productPages = products.map((p, idx) => {
    const hasImages = p.images && p.images.length > 0;
    const printedCostDisplay = p.printedPriceType === "fixed" && p.unitCostPrinted
      ? `$${parseFloat(p.unitCostPrinted).toFixed(2)}`
      : p.printedPriceType === "logo"
      ? "Depends on logo colors"
      : p.printedPriceType === "none"
      ? "Does not support"
      : p.unitCostPrinted || "—";

    const colorSwatches = p.availableColors.map(c =>
      `<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${colorMap[c] || "#ccc"};border:1px solid rgba(0,0,0,0.15);margin-right:4px;vertical-align:middle;" title="${c}"></span>`
    ).join("");

    // Build image grid
    const imgCount = hasImages ? p.images.length : 0;
    const imgHTML = hasImages
      ? p.images.map((img, i) => `
          <div style="width:100%;aspect-ratio:4/3;overflow:hidden;border-radius:6px;background:#f0ede8;border:1px solid rgba(92,74,50,0.12);">
            <img src="${img.src}" style="width:100%;height:100%;object-fit:cover;" />
          </div>`).join("")
      : `<div style="width:100%;aspect-ratio:4/3;background:#f5f0e8;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:12px;border:1px dashed #ccc;">No image</div>`;

    const specRows = [
      p.bestFitFor.length ? ["Best Fit For", p.bestFitFor.join(", ")] : null,
      p.material ? ["Material", p.material] : null,
      (p.volume && p.volumeUnit) ? ["Volume / Size", `${p.volume}${p.volumeUnit}`] : null,
      p.refCode ? ["Ref Code", p.refCode] : null,
      p.moq ? ["Minimum Order Quantity", p.moq.toLocaleString()] : null,
    ].filter(Boolean);

    const priceRows = [
      p.unitCostPlain ? ["Unit Cost (without design print)", `$${parseFloat(p.unitCostPlain).toFixed(2)}`] : null,
      ["Unit Cost (with design print)", printedCostDisplay],
    ].filter(Boolean);

    return `
    <!-- PRODUCT INTRO PAGE -->
    <div class="page" style="display:flex;flex-direction:column;justify-content:center;align-items:center;background:#1a1510;">
      <div style="text-align:center;color:white;">
        <div style="font-size:11px;letter-spacing:0.25em;color:rgba(255,255,255,0.5);text-transform:uppercase;margin-bottom:12px;">FOR ${(clientName || "CLIENT").toUpperCase()}</div>
        <div style="font-size:48px;font-weight:100;letter-spacing:0.1em;line-height:1;color:rgba(255,255,255,0.15);text-transform:uppercase;">${p.packagingType || "PACKAGING"}</div>
        <div style="font-size:64px;font-weight:900;letter-spacing:-0.02em;line-height:1;color:white;text-transform:uppercase;margin-top:-8px;">${p.name ? p.name.toUpperCase() : "PRODUCT"}</div>
      </div>
      <div style="position:absolute;bottom:20px;right:24px;font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:0.1em;">PAGE ${idx * 2 + 3} &nbsp;•&nbsp; @LUEURCOSMETICSLAB</div>
    </div>

    <!-- PRODUCT DETAIL PAGE -->
    <div class="page" style="display:flex;flex-direction:column;">
      <!-- Header bar -->
      <div style="background:${LCL_BROWN};padding:14px 24px;display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:18px;font-weight:300;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.15em;">${p.packagingType || ""}</span>
          <span style="font-size:22px;font-weight:900;color:white;text-transform:uppercase;letter-spacing:0.02em;">${p.name || "PRODUCT"}</span>
        </div>
        <div style="background:${LCL_DARK};border-radius:6px;padding:6px 8px;">${logoSVG}</div>
      </div>

      <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px 24px;">
        <!-- Images column -->
        <div style="display:grid;grid-template-columns:${imgCount > 1 ? "1fr 1fr" : "1fr"};gap:8px;align-content:start;">
          ${imgHTML}
        </div>

        <!-- Info column -->
        <div style="display:flex;flex-direction:column;gap:12px;">
          <!-- Color swatch -->
          <div style="width:120px;height:10px;background:${LCL_BROWN};border-radius:2px;margin-bottom:4px;"></div>

          <!-- Specs -->
          <div style="font-size:12.5px;color:#2a2218;line-height:1.9;">
            ${specRows.map(([k, v]) => `<div><strong style="color:${LCL_DARK};">${k}:</strong> ${v}</div>`).join("")}
          </div>

          <!-- Prices -->
          <div style="border-top:1px solid rgba(92,74,50,0.15);padding-top:10px;">
            ${priceRows.map(([k, v]) => `
              <div style="font-size:12.5px;color:#2a2218;line-height:2.0;">
                ${k}: <strong>${v}</strong>
              </div>`).join("")}
          </div>

          <!-- Available colors -->
          ${p.availableColors.length ? `
          <div style="border-top:1px solid rgba(92,74,50,0.15);padding-top:10px;">
            <div style="font-size:11px;font-weight:700;color:${LCL_BROWN};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Available Colors</div>
            <div>${colorSwatches}</div>
          </div>` : ""}

          <!-- Box options -->
          ${p.boxOptions ? `
          <div style="border-top:1px solid rgba(92,74,50,0.15);padding-top:10px;">
            <div style="font-size:11px;font-weight:700;color:${LCL_BROWN};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Box Options</div>
            <div style="font-size:12px;color:#555;">${p.boxOptions}</div>
          </div>` : ""}

          <!-- Notes -->
          ${p.additionalNotes ? `
          <div style="border-top:1px solid rgba(92,74,50,0.15);padding-top:10px;">
            <div style="font-size:11px;font-weight:700;color:${LCL_BROWN};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Notes</div>
            <div style="font-size:12px;color:#555;">${p.additionalNotes}</div>
          </div>` : ""}

          <!-- Product number badge -->
          <div style="margin-top:auto;font-size:10px;color:#aaa;letter-spacing:0.1em;text-transform:uppercase;">Product #${String(idx + 1).padStart(2, "0")}</div>
        </div>
      </div>

      <div style="padding:8px 24px;border-top:1px solid rgba(92,74,50,0.1);display:flex;justify-content:space-between;font-size:10px;color:#aaa;letter-spacing:0.08em;">
        <span>FOR ${(clientName || "CLIENT").toUpperCase()}</span>
        <span>PAGE ${idx * 2 + 4} &nbsp;&nbsp; @LUEURCOSMETICSLAB</span>
      </div>
    </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>LCL Packaging Catalog — ${clientName || "Client"} ${year}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;700;900&family=Barlow+Condensed:wght@300;700;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Barlow', sans-serif; background: #e0ddd8; }
  .page {
    width: 210mm; min-height: 297mm; margin: 0 auto;
    background: white; position: relative; overflow: hidden;
    page-break-after: always;
  }
  @media print {
    body { background: white; }
    .page { margin: 0; box-shadow: none; }
  }
</style>
</head>
<body>

<!-- COVER PAGE -->
<div class="page" style="display:flex;flex-direction:column;justify-content:space-between;background:white;">
  <div style="padding:40px 40px 0;">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:40px;">
      ${logoSVG}
      <div>
        <div style="font-size:22px;font-weight:900;color:${LCL_DARK};letter-spacing:-0.02em;line-height:1;">PRODUCT</div>
        <div style="font-size:40px;font-weight:900;color:${LCL_DARK};letter-spacing:-0.03em;line-height:1;margin-top:-4px;">CATALOG</div>
        <div style="font-size:14px;font-weight:300;color:#888;letter-spacing:0.25em;margin-top:4px;">Y E A R &nbsp; ${year}</div>
      </div>
    </div>
    <div style="height:2px;background:linear-gradient(90deg,${LCL_BROWN},${LCL_ORANGE},transparent);margin-bottom:40px;"></div>
  </div>

  <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:0 40px;">
    <div style="text-align:center;">
      <div style="font-size:11px;letter-spacing:0.3em;color:#aaa;text-transform:uppercase;margin-bottom:16px;">A curated packaging selection</div>
      <div style="font-size:14px;letter-spacing:0.15em;color:#888;text-transform:uppercase;margin-bottom:8px;">prepared for</div>
      <div style="font-size:36px;font-weight:900;color:${LCL_DARK};letter-spacing:0.02em;text-transform:uppercase;border-bottom:3px solid ${LCL_BROWN};padding-bottom:8px;display:inline-block;">${clientName || "CLIENT"}</div>
      <div style="margin-top:20px;font-size:13px;color:#aaa;">${products.length} packaging option${products.length !== 1 ? "s" : ""} inside</div>
    </div>
  </div>

  <div style="padding:24px 40px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
    <div style="display:flex;gap:8px;">
      <div style="background:${LCL_BROWN};border-radius:6px;padding:6px 8px;">${logoSVG}</div>
      <div style="font-size:10px;color:#888;line-height:1.6;">
        <div style="font-weight:700;color:${LCL_DARK};font-size:12px;">LUEUR COSMETICS LAB</div>
        <div>lueurcosmetics.company.site</div>
        <div>lueurcosmeticslab@gmail.com</div>
      </div>
    </div>
    <div style="text-align:right;font-size:10px;color:#aaa;">@LUEURCOSMETICSLAB</div>
  </div>
</div>

<!-- TERMS PAGE -->
<div class="page" style="background:${LCL_BROWN};display:flex;flex-direction:column;justify-content:space-between;padding:40px;">
  <div>
    <div style="font-size:36px;font-weight:300;color:rgba(255,255,255,0.6);text-transform:uppercase;line-height:1;">TERMS &</div>
    <div style="font-size:48px;font-weight:900;color:white;text-transform:uppercase;line-height:1;margin-top:-6px;">AGREEMENT</div>
    <div style="height:2px;background:rgba(255,255,255,0.2);margin:24px 0;"></div>
    <div style="font-size:13px;color:rgba(255,255,255,0.85);line-height:1.7;margin-bottom:20px;">
      The packaging options in this catalog are provided through our network of suppliers.<br/>
      Please review the following terms carefully:
    </div>
    ${[
      ["Supplier-Based Information", "All packaging styles and information come directly from our suppliers, as we do not stock these items ourselves."],
      ["Pricing", "Prices listed are inclusive of shipping to our warehouse in Ghana. Actual prices are in USD and may vary based on the current bank exchange rate with the Ghanaian cedi (GHS)."],
      ["Final Selection", "Once packaging is selected and payment is made, we cannot accept changes or cancellations. Please approve all design choices before confirming your order, as exchanges cannot be facilitated after receipt."],
      ["Lead Time", "A minimum of 2–3 weeks is required to ship packaging into the country. However, availability is subject to supplier stock and may change without notice."],
      ["Minimum Order Requirements", "Each packaging design requires a specific minimum order quantity, as stipulated by our suppliers."],
    ].map(([title, body], i) => `
      <div style="margin-bottom:16px;font-size:13px;color:rgba(255,255,255,0.85);line-height:1.65;">
        <strong style="color:white;">${i + 1}. ${title}:</strong> ${body}
      </div>`).join("")}
    <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:8px;line-height:1.65;">
      By proceeding with your order, you agree to these terms.<br/>
      For questions or further assistance, please contact us directly.
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,0.4);letter-spacing:0.1em;margin-top:24px;">
    <span>PAGE 2</span><span>@LUEURCOSMETICSLAB</span>
  </div>
</div>

${productPages}

<!-- BACK COVER -->
<div class="page" style="background:${LCL_DARK};display:flex;flex-direction:column;align-items:center;justify-content:center;">
  <div style="text-align:center;">
    <div style="margin-bottom:20px;">${logoSVG.replace('width="48"','width="80"').replace('height="38"','height="64"')}</div>
    <div style="font-size:28px;font-weight:900;color:white;letter-spacing:0.05em;margin-bottom:4px;">LUEUR COSMETICS LAB</div>
    <div style="height:2px;width:80px;background:${LCL_ORANGE};margin:12px auto;"></div>
    <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:2.0;">
      <div>lueurcosmetics.company.site</div>
      <div>lueurcosmeticslab@gmail.com</div>
      <div>@lueurcosmeticslab</div>
    </div>
    <div style="margin-top:32px;font-size:11px;color:rgba(255,255,255,0.3);letter-spacing:0.2em;">CATALOG ${year}</div>
  </div>
</div>

</body>
</html>`;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function CatalogGenerator() {
  const [clientName, setClientName] = useState("");
  const [year, setYear] = useState("2026");
  const [products, setProducts] = useState([emptyProduct()]);
  const [step, setStep] = useState("build"); // build | preview

  const addProduct = () => setProducts(p => [...p, emptyProduct()]);
  const removeProduct = (id) => setProducts(p => p.filter(x => x.id !== id));
  const updateProduct = (id, data) => setProducts(p => p.map(x => x.id === id ? data : x));

  const handlePreview = () => setStep("preview");
  const handleBack = () => setStep("build");

  const handleDownload = () => {
    const html = generateCatalogHTML({ clientName, year, products });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LCL_Packaging_Catalog_${clientName.replace(/\s+/g, "_") || "Client"}_${year}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const html = generateCatalogHTML({ clientName, year, products });
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  };

  const isValid = clientName.trim() && products.some(p => p.name.trim());

  // ── PREVIEW ──
  if (step === "preview") {
    const html = generateCatalogHTML({ clientName, year, products });
    return (
      <div style={{ fontFamily: "'Barlow', sans-serif", background: "#f0ede8", minHeight: "100vh" }}>
        {/* Toolbar */}
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          background: LCL_DARK, padding: "10px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
        }}>
          <button onClick={handleBack} style={{
            background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontSize: 13,
          }}>← Back to Editor</button>
          <div style={{ color: "white", fontWeight: 700, fontSize: 14, letterSpacing: "0.1em" }}>
            CATALOG PREVIEW — {clientName.toUpperCase()}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleDownload} style={{
              background: LCL_ORANGE, color: "white", border: "none",
              borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700,
            }}>⬇ Download HTML</button>
            <button onClick={handlePrint} style={{
              background: LCL_BROWN, color: "white", border: "none",
              borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700,
            }}>🖨 Print / Save PDF</button>
          </div>
        </div>
        <div style={{ padding: "24px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
          <iframe
            srcDoc={html}
            style={{
              width: "800px", minHeight: "1200px", border: "none",
              boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
            }}
            title="Catalog Preview"
          />
        </div>
      </div>
    );
  }

  // ── BUILDER ──
  return (
    <div style={{ fontFamily: "'Barlow', sans-serif", background: "#f0ede8", minHeight: "100vh" }}>
      {/* Top bar */}
      <div style={{
        background: LCL_DARK, padding: "14px 24px",
        display: "flex", alignItems: "center", gap: 14,
        boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
      }}>
        <svg width="36" height="28" viewBox="0 0 120 96" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="38" cy="28" rx="22" ry="18" fill={LCL_ORANGE} transform="rotate(-20,38,28)"/>
          <circle cx="18" cy="44" r="10" fill={LCL_ORANGE}/>
          <circle cx="62" cy="18" r="9" fill={LCL_ORANGE}/>
          <ellipse cx="72" cy="56" rx="22" ry="16" fill="white" transform="rotate(15,72,56)"/>
          <circle cx="96" cy="52" r="9" fill="white"/>
          <circle cx="62" cy="72" r="8" fill="white"/>
        </svg>
        <div>
          <div style={{ color: "white", fontWeight: 900, fontSize: 16, letterSpacing: "0.05em" }}>LCL PACKAGING CATALOG GENERATOR</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, letterSpacing: "0.1em" }}>LUEUR COSMETICS LAB</div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Catalog Info */}
        <div style={{ background: "white", borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(92,74,50,0.06)", border: `1px solid ${LCL_BROWN}20` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: LCL_BROWN, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${LCL_BROWN}15` }}>
            📋 Catalog Details
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Client / Brand Name *">
              <Input value={clientName} onChange={setClientName} placeholder="e.g. Timeless by JD, Jonessa Beauty" />
            </Field>
            <Field label="Catalog Year">
              <Input value={year} onChange={setYear} placeholder="2026" />
            </Field>
          </div>
        </div>

        {/* Products */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: LCL_BROWN, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            📦 Packaging Options ({products.length})
          </div>
          <button
            onClick={addProduct}
            style={{
              background: LCL_BROWN, color: "white", border: "none",
              borderRadius: 6, padding: "7px 16px", cursor: "pointer",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
            }}
          >+ Add Product</button>
        </div>

        {products.map((p, i) => (
          <ProductForm
            key={p.id}
            product={p}
            index={i}
            onChange={data => updateProduct(p.id, data)}
            onRemove={() => removeProduct(p.id)}
            productCount={products.length}
          />
        ))}

        {/* Generate button */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 8, paddingBottom: 32 }}>
          <button
            onClick={handlePreview}
            disabled={!isValid}
            style={{
              background: isValid ? LCL_BROWN : "#ccc",
              color: "white", border: "none", borderRadius: 8,
              padding: "12px 32px", fontSize: 14, fontWeight: 700,
              cursor: isValid ? "pointer" : "not-allowed",
              letterSpacing: "0.05em", transition: "all 0.2s",
              boxShadow: isValid ? `0 4px 16px ${LCL_BROWN}40` : "none",
            }}
          >
            👁 Preview Catalog
          </button>
          <button
            onClick={() => { handlePreview(); setTimeout(handleDownload, 500); }}
            disabled={!isValid}
            style={{
              background: isValid ? LCL_ORANGE : "#ccc",
              color: "white", border: "none", borderRadius: 8,
              padding: "12px 32px", fontSize: 14, fontWeight: 700,
              cursor: isValid ? "pointer" : "not-allowed",
              letterSpacing: "0.05em", transition: "all 0.2s",
              boxShadow: isValid ? `0 4px 16px ${LCL_ORANGE}40` : "none",
            }}
          >
            ⬇ Generate & Download
          </button>
        </div>
      </div>
    </div>
  );
}
