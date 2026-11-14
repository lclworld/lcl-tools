/* Toolbox: the four tools, opened inside the app. */
(function () {
  "use strict";
  const CEO = window.CEO, esc = CEO.esc;
  const TOOLS = [
    { name: "Label Compliance Checker", icon: "label", url: "https://labos.lueurcosmeticslab.com/labelcompliance.html", note: "Check a label against the rules" },
    { name: "Import Cost Calculator", icon: "calc", url: "../importcostcalculator.html", note: "Landed cost of an import" },
    { name: "Shipping Station", icon: "ship", url: "../shipstation.html", note: "Shipping quotes and labels" },
    { name: "Packaging Catalog Generator", icon: "book", url: "../cataloggenerator.html", note: "A packaging catalog for a client" }
  ];
  CEO.TOOLS = TOOLS;

  // Opens one tool full screen, with a back button and a way out to a new tab.
  function launch(i) {
    const t = TOOLS[i];
    const el = document.createElement("div");
    el.className = "tool-frame";
    CEO.setAccent("toolbox", el);
    el.innerHTML = `<header class="band"><button class="icon-btn" data-back aria-label="Back">${CEO.icon("back")}</button><h1>${esc(t.name)}</h1>
      <a class="icon-btn" href="${esc(t.url)}" target="_blank" rel="noopener" aria-label="Open in a new tab">${CEO.icon("external")}</a></header>
      <iframe src="${esc(t.url)}" title="${esc(t.name)}"></iframe>`;
    el.querySelector("[data-back]").onclick = CEO.closeLayer;
    CEO.pushLayer(el);
  }

  function open() {
    CEO.screen("toolbox", "Toolbox", "", `<div class="content"><section class="card"><div class="rows">${TOOLS.map((t, i) =>
      `<div class="row" role="button" tabindex="0" data-tool="${i}">${CEO.icon(t.icon, "accent")}<div class="txt"><span class="t">${esc(t.name)}</span><span class="m">${esc(t.note)}</span></div>${CEO.icon("chevron", "sm chev")}</div>`).join("")}</div></section></div>`, (el) => {
      el.querySelectorAll("[data-tool]").forEach((r) => {
        r.onclick = () => launch(Number(r.dataset.tool));
        r.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); launch(Number(r.dataset.tool)); } };
      });
    });
  }

  CEO.sections.toolbox = { open, launch };
})();
