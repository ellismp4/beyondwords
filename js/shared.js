/* =========================================================
   Helpers shared by the patient page (index.html)
   and the provider page (provider.html).
   ========================================================= */
window.BW = (() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /* ---------- Screens ---------- */

  // Show one ".screen" by id and hide the others.
  function showScreen(screenId) {
    $$(".screen").forEach((screen) => {
      screen.hidden = screen.id !== screenId;
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  // Any element with data-go="screenId" switches to that screen.
  function bindScreenNav() {
    $$("[data-go]").forEach((button) => {
      button.addEventListener("click", () => showScreen(button.dataset.go));
    });
  }

  /* ---------- localStorage (may be unavailable) ---------- */

  function readStore(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.warn(`Could not read "${key}".`, error);
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Could not save "${key}".`, error);
      return false;
    }
  }

  /* ---------- Call controls ---------- */

  // Mute / camera style toggle: swaps aria-pressed, label and icon.
  function bindToggle(button, { label, activeLabel, icon, activeIcon, onChange }) {
    if (!button) return;
    const text = $("span", button);
    const iconEl = $("i", button);

    button.addEventListener("click", () => {
      const active = button.getAttribute("aria-pressed") !== "true";

      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
      if (text) text.textContent = active ? activeLabel : label;
      if (iconEl) iconEl.className = `fa-solid ${active ? activeIcon : icon}`;

      if (onChange) onChange(active);
    });
  }

  // Floating tool popup. Buttons use data-tool="x"; panels use data-panel="x".
  // The popup title comes from the tool button's own label.
  function initToolPanel(root = document) {
    const panel = $(".call-tool-panel", root);
    if (!panel) return { open() {}, close() {} };

    const heading = $(".panel-heading h2", panel);
    const toolButtons = $$(".call-tool[data-tool]", root);
    const contents = $$(".call-panel-content", panel);

    const contentFor = (tool) => $(`[data-panel="${tool}"]`, panel);
    const isOpen = (tool) => !panel.hidden && contentFor(tool)?.hidden === false;

    function close() {
      panel.hidden = true;
      contents.forEach((content) => { content.hidden = true; });
      toolButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
    }

    function open(tool) {
      const content = contentFor(tool);
      const button = $(`.call-tool[data-tool="${tool}"]`, root);
      if (!content) return;

      close();
      content.hidden = false;
      panel.hidden = false;

      if (heading) {
        heading.textContent = $("span", button)?.textContent || "Communication tool";
      }
      if (button) button.setAttribute("aria-pressed", "true");
    }

    toolButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tool = button.dataset.tool;
        if (isOpen(tool)) close();
        else open(tool);
      });
    });

    $(".panel-close", panel)?.addEventListener("click", close);

    return { open, close };
  }

  // Show (or hide, when empty) a short message in an element.
  function showMessage(element, text) {
    if (!element) return;
    element.textContent = text || "";
    element.hidden = !text;
  }

  return {
    $, $$,
    showScreen, bindScreenNav,
    readStore, writeStore,
    bindToggle, initToolPanel, showMessage
  };
})();

