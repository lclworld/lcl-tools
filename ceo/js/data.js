/* What the CEO App shows, worked out from the Hub's bundle. Rules match the
   owning apps: low stock uses Inventory's own thresholds, statuses use
   Operations Centre's own lists. */
(function () {
  "use strict";
  const CEO = window.CEO;

  // Operations Centre's own option lists.
  CEO.LISTS = {
    task: ["Not Started", "In Progress", "Waiting", "Blocked", "Completed", "Cancelled"],
    attention: ["Open", "Approved", "Rejected", "Needs More Info", "Resolved"],
    production: ["READY", "BLOCKED", "WAITING FOR DIRECTOR", "WAITING FOR PURCHASE", "IN PRODUCTION", "QC", "COMPLETED"],
    delivery: ["Scheduled", "Packed", "Dispatched", "Delivered", "Cancelled"],
    purchase: ["Need Identified", "Pending Approval", "Approved", "Ordered", "Paid", "Awaiting Supplier", "Received", "Completed", "Rejected"],
    pid: ["Not Started", "In Progress", "Completed"],
    priority: ["Low", "Medium", "High", "Urgent"],
    staff: ["Gloria", "Efua", "Rosemary", "Dorcas"]
  };
  const DONE = { task: ["Completed", "Cancelled"], production: ["COMPLETED"], delivery: ["Delivered", "Cancelled"], purchase: ["Completed", "Rejected", "Received"] };
  CEO.isDone = (kind, status) => (DONE[kind] || []).indexOf(status) >= 0;
  const ME = "Efua";

  // Inventory's own Low Stock rule (thresholdFor in inventory/index.html).
  function itemType(i) {
    const code = String(i.code || "");
    if (/^LB\d/.test(code)) return "Labels";
    if (/^BX\d/.test(code)) return "Packaging";
    return i.type || "Ingredient";
  }
  CEO.threshold = (i) => {
    const t = itemType(i);
    if (t === "Labels") return -Infinity;
    if (t === "Packaging") return 5;
    if (i.category === "A" || i.category === "C" || i.func === "Active") return 10;
    if (i.category === "B" || i.category === "W" || i.func === "Surfactant") return 100;
    return 50;
  };
  CEO.unit = (i) => (itemType(i) === "Ingredient" ? "g" : "");
  CEO.lowStock = (b) => (b.ingredients || [])
    .filter((i) => !i.lowStockExcluded && !i.discontinued && Number(i.qty) < CEO.threshold(i))
    .sort((a, z) => Number(a.qty) / Math.max(1, CEO.threshold(a)) - Number(z.qty) / Math.max(1, CEO.threshold(z)));

  const PRI = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  const fmtDate = (d) => {
    if (!d) return "";
    const x = new Date(String(d).length === 10 ? d + "T00:00:00Z" : d);
    if (isNaN(x)) return String(d);
    return x.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  };
  CEO.fmtDate = fmtDate;
  const day = (d) => String(d || "").slice(0, 10);

  // Everything waiting on the manager, most urgent first.
  CEO.needsYou = (b) => {
    if (!b) return [];
    const today = b.today || CEO.today();
    const items = [];
    (b.attention || []).filter((a) => a.status === "Open").forEach((a) => items.push({
      kind: "attention", id: a.attentionId, title: a.issue || a.category || "Needs your decision",
      meta: [a.category, a.flaggedBy && "from " + a.flaggedBy, a.deadline && "by " + fmtDate(a.deadline)].filter(Boolean).join(" · "),
      action: "Approve", rank: (PRI[a.priority] != null ? PRI[a.priority] : 2) + (day(a.deadline) && day(a.deadline) <= today ? -1 : 0)
    }));
    (b.purchases || []).filter((p) => p.status === "Pending Approval").forEach((p) => items.push({
      kind: "purchase", id: p.purchaseId, title: "Approve purchase: " + (p.item || ""),
      meta: [p.supplier, p.amount && "GHS " + p.amount, p.responsiblePerson].filter(Boolean).join(" · "), action: "Approve", rank: 2
    }));
    const openAttention = new Set((b.attention || []).filter((a) => a.status === "Open").map((a) => a.relatedRecord));
    (b.production || []).filter((p) => p.productionStatus === "WAITING FOR DIRECTOR" && !openAttention.has(p.productionId)).forEach((p) => items.push({
      kind: "production", id: p.productionId, title: "Production waiting for you: " + (p.product || ""),
      meta: [p.client, p.plannedDate && fmtDate(p.plannedDate)].filter(Boolean).join(" · "), action: "Open", rank: 1
    }));
    (b.tasks || []).filter((t) => t.assignedTo === ME && !CEO.isDone("task", t.status) && day(t.dueDate) && day(t.dueDate) <= today).forEach((t) => items.push({
      kind: "task", id: t.taskId, title: t.title, meta: (day(t.dueDate) < today ? "Overdue since " : "Due ") + fmtDate(t.dueDate),
      action: "Done", rank: day(t.dueDate) < today ? 1 : 3
    }));
    const low = CEO.lowStock(b);
    if (low.length) items.push({ kind: "lowstock", id: "lowstock", title: low.length + " item" + (low.length > 1 ? "s" : "") + " low on stock",
      meta: low.slice(0, 3).map((i) => i.name).join(", ") + (low.length > 3 ? "…" : ""), action: "Open", rank: 4 });
    return items.sort((a, z) => a.rank - z.rank);
  };

  // What is happening today.
  CEO.todayItems = (b) => {
    if (!b) return [];
    const today = b.today || CEO.today();
    const out = [];
    (b.production || []).filter((p) => day(p.plannedDate) === today && !CEO.isDone("production", p.productionStatus)).forEach((p) =>
      out.push({ kind: "production", id: p.productionId, icon: "flask", title: p.product, meta: "Production" + (p.client ? " · " + p.client : "") + " · " + (p.productionStatus || "") }));
    (b.deliveries || []).filter((d) => day(d.deliveryDate) === today && !CEO.isDone("delivery", d.status)).forEach((d) =>
      out.push({ kind: "delivery", id: d.deliveryId, icon: "truck", title: (d.direction || "Delivery") + ": " + (d.clientOrSupplier || ""), meta: [d.expectedTime, d.status].filter(Boolean).join(" · ") }));
    (b.calendar || []).filter((e) => day(e.date) === today && e.status !== "Cancelled").forEach((e) =>
      out.push({ kind: "event", id: e.eventId, icon: "calendar", title: e.title, meta: [e.startTime && e.startTime + (e.endTime ? "–" + e.endTime : ""), e.eventType, e.owner].filter(Boolean).join(" · ") }));
    (b.tasks || []).filter((t) => t.assignedTo === ME && day(t.dueDate) === today && !CEO.isDone("task", t.status)).forEach((t) =>
      out.push({ kind: "task", id: t.taskId, icon: "list", title: t.title, meta: "Your task · " + (t.status || "") }));
    return out;
  };

  CEO.find = (b, kind, id) => {
    const map = { attention: ["attention", "attentionId"], task: ["tasks", "taskId"], production: ["production", "productionId"],
      delivery: ["deliveries", "deliveryId"], purchase: ["purchases", "purchaseId"], event: ["calendar", "eventId"], item: ["ingredients", "code"] };
    const [k, idKey] = map[kind];
    return ((b && b[k]) || []).find((r) => r[idKey] === id);
  };
})();
