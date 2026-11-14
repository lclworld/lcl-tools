/* Inbox arrives in Phase 2 (see ceo/docs/BLUEPRINT.md). */
(function () {
  "use strict";
  const CEO = window.CEO;
  function render(app) {
    app.innerHTML = CEO.band("Inbox") + `<div class="content"><section class="card">
      <div class="card-head">${CEO.icon("inbox", "accent")}<h2>Coming in the next phase</h2></div>
      <p class="note">Your Gmail, sorted into categories with a one line summary of each email, and label submissions with a button to check them.</p></section></div>`;
    CEO.bindBand(app);
  }
  CEO.sections.inbox = { render };
})();
