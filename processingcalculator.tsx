import { useState, useCallback } from "react";

const BRAND = {
  orange: "#FF914D",
  cream: "#FBF8EF",
  yellow: "#FFDE59",
  brown: "#5B4239",
  black: "#1A1A1A",
};

// Ghana Public Holidays (fixed dates + rules for 2024–2027)
function getGhanaHolidays(year) {
  const holidays = new Set();
  const add = (m, d) => holidays.add(`${year}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`);

  add(1, 1);   // New Year's Day
  add(3, 6);   // Independence Day
  add(5, 1);   // Workers' Day
  add(7, 1);   // Republic Day
  add(8, 4);   // Founders' Day
  add(9, 21);  // Kwame Nkrumah Memorial Day
  add(12, 25); // Christmas Day
  add(12, 26); // Boxing Day

  // Easter (Gregorian algorithm)
  const easter = getEaster(year);
  const goodFriday = new Date(easter); goodFriday.setDate(goodFriday.getDate() - 2);
  const easterMonday = new Date(easter); easterMonday.setDate(easterMonday.getDate() + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  holidays.add(fmt(goodFriday));
  holidays.add(fmt(easterMonday));

  // Eid al-Fitr & Eid al-Adha — approximate, shifts yearly
  // Using known values for common years; for production use an Islamic calendar lib
  const eidAlFitr = { 2024: "04-10", 2025: "03-30", 2026: "03-20", 2027: "03-09" };
  const eidAlAdha = { 2024: "06-16", 2025: "06-06", 2026: "05-27", 2027: "05-17" };
  if (eidAlFitr[year]) holidays.add(`${year}-${eidAlFitr[year]}`);
  if (eidAlAdha[year]) holidays.add(`${year}-${eidAlAdha[year]}`);

  return holidays;
}

function getEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addWorkingDays(startDate, days) {
  let current = new Date(startDate);
  let added = 0;
  const holidays = {
    ...Object.fromEntries([...getGhanaHolidays(current.getFullYear())].map(h => [h, true])),
    ...Object.fromEntries([...getGhanaHolidays(current.getFullYear() + 1)].map(h => [h, true])),
  };
  while (added < days) {
    current.setDate(current.getDate() + 1);
    const dow = current.getDay();
    const dateStr = current.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays[dateStr]) {
      added++;
    }
  }
  return new Date(current);
}

function formatDate(date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatShort(date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProcessingCalculator() {
  const [paymentDate, setPaymentDate] = useState("");
  const [minDays, setMinDays] = useState("");
  const [maxDays, setMaxDays] = useState("");
  const [copied, setCopied] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const result = useCallback(() => {
    if (!paymentDate || !minDays || !maxDays) return null;
    const start = new Date(paymentDate);
    const min = parseInt(minDays);
    const max = parseInt(maxDays);
    if (isNaN(min) || isNaN(max) || min < 1 || max < min) return null;

    const endMin = addWorkingDays(start, min);
    const endMax = addWorkingDays(start, max);

    return { endMin, endMax, min, max };
  }, [paymentDate, minDays, maxDays]);

  const calc = result();

  const copyText = calc
    ? `Processing Time: ${calc.min}–${calc.max} working days\nEstimated Completion: ${formatShort(calc.endMin)} – ${formatShort(calc.endMax)}`
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: BRAND.cream,
      fontFamily: "'Georgia', serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
    }}>
      <div style={{ width: "100%", maxWidth: 480 }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            display: "inline-block",
            background: BRAND.orange,
            color: "#fff",
            fontSize: 11,
            fontFamily: "monospace",
            letterSpacing: 3,
            padding: "4px 12px",
            marginBottom: 10,
            textTransform: "uppercase",
          }}>
            Lueur Cosmetics Lab
          </div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 700,
            color: BRAND.brown,
            margin: 0,
            lineHeight: 1.2,
          }}>
            Processing<br />Time Calculator
          </h1>
          <p style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: "#8a7060",
            fontStyle: "italic",
          }}>
            Excludes weekends & Ghana public holidays
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "#fff",
          border: `2px solid ${BRAND.brown}`,
          borderRadius: 4,
          padding: "28px 24px",
          boxShadow: `6px 6px 0px ${BRAND.brown}`,
        }}>

          {/* Payment Date */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Date of Payment</label>
            <input
              type="date"
              value={paymentDate}
              min={today}
              onChange={e => setPaymentDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Duration Range */}
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Processing Duration (working days)</label>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, fontSize: 11, color: "#8a7060" }}>Minimum</label>
              <input
                type="number"
                placeholder="e.g. 5"
                min="1"
                value={minDays}
                onChange={e => setMinDays(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{
              display: "flex",
              alignItems: "flex-end",
              paddingBottom: 10,
              color: BRAND.brown,
              fontWeight: 700,
              fontSize: 18,
            }}>—</div>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, fontSize: 11, color: "#8a7060" }}>Maximum</label>
              <input
                type="number"
                placeholder="e.g. 10"
                min={minDays || "1"}
                value={maxDays}
                onChange={e => setMaxDays(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Validation hint */}
          {minDays && maxDays && parseInt(maxDays) < parseInt(minDays) && (
            <p style={{ color: "#c0392b", fontSize: 12, margin: "-12px 0 16px", fontStyle: "italic" }}>
              Maximum must be ≥ minimum
            </p>
          )}

          {/* Result */}
          {calc && (
            <div style={{
              background: BRAND.cream,
              border: `1.5px solid ${BRAND.orange}`,
              borderRadius: 4,
              padding: "18px 20px",
              marginBottom: 16,
            }}>
              <div style={{
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: BRAND.orange,
                fontFamily: "monospace",
                marginBottom: 10,
              }}>
                Estimated Completion Window
              </div>

              <div style={{
                fontSize: 22,
                fontWeight: 700,
                color: BRAND.brown,
                lineHeight: 1.3,
                marginBottom: 6,
              }}>
                {formatDate(calc.endMin)}
                <span style={{ display: "block", fontSize: 13, fontWeight: 400, color: "#8a7060", margin: "2px 0" }}>to</span>
                {formatDate(calc.endMax)}
              </div>

              <div style={{
                fontSize: 12,
                color: "#8a7060",
                fontStyle: "italic",
                marginTop: 8,
                borderTop: `1px solid #e8dfd6`,
                paddingTop: 8,
              }}>
                Payment received: {formatDate(new Date(paymentDate))} · {calc.min}–{calc.max} working days
              </div>
            </div>
          )}

          {/* Copy Button */}
          {calc && (
            <button
              onClick={handleCopy}
              style={{
                width: "100%",
                padding: "13px",
                background: copied ? BRAND.brown : BRAND.yellow,
                color: copied ? "#fff" : BRAND.brown,
                border: `2px solid ${BRAND.brown}`,
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 0.2s",
                fontFamily: "monospace",
                boxShadow: copied ? "none" : `3px 3px 0 ${BRAND.brown}`,
                transform: copied ? "translate(3px, 3px)" : "none",
              }}
            >
              {copied ? "✓ Copied to Clipboard!" : "Copy for Invoice"}
            </button>
          )}

          {!calc && (
            <div style={{
              textAlign: "center",
              padding: "20px 0 4px",
              color: "#c4b5a8",
              fontSize: 13,
              fontStyle: "italic",
            }}>
              Fill in the fields above to calculate
            </div>
          )}
        </div>

        {/* Footer note */}
        <p style={{
          textAlign: "center",
          fontSize: 11,
          color: "#b0a090",
          marginTop: 16,
          fontFamily: "monospace",
          letterSpacing: 1,
        }}>
          Ghana public holidays included · 2024–2027
        </p>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#5B4239",
  marginBottom: 6,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  fontFamily: "monospace",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1.5px solid #d4c4b8",
  borderRadius: 4,
  fontSize: 14,
  color: "#1A1A1A",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};
