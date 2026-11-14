/* Orders arrives in Phase 2 (see ceo/docs/BLUEPRINT.md). */
(function () {
  "use strict";
  const CEO = window.CEO;
  function render(app) {
    app.innerHTML = CEO.band("Orders") + `<div class="content"><section class="card">
      <div class="card-head">${CEO.icon("orders", "accent")}<h2>Coming in the next phase</h2></div>
      <p class="note">Every paid order from Zoho Invoice and InstaBrand, with a previewed email to the client each time you change its status.</p></section></div>`;
    CEO.bindBand(app);
  }
  CEO.sections.orders = { render };
})();
