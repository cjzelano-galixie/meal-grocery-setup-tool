(function () {
  // ============================================================
  // ALDI / INSTACART SITE ADAPTER
  //
  // Real flow on this site: typing in the search box shows a live
  // suggestions dropdown, you click whichever suggestion fits, and
  // THEN the results list loads. Picking the right suggestion is a
  // judgment call, so that click stays yours — everything else is
  // automated:
  //   1. "Search This Item"  -> fills the search box (automatic)
  //   2. (you click the matching suggestion on the real page)
  //   3. "Add to Cart"       -> finds & clicks Add to cart (automatic)
  //   4. "Added ✓"           -> advances to the next item
  //
  // HOW TO IMPROVE THE SELECTORS:
  //   Right-click the real "Add to cart" button on a product card in
  //   the loaded results list → Inspect → in DevTools, right-click the
  //   highlighted line → Copy → Copy selector → paste it as
  //   firstResultAddToCartSelector below. Until then, this falls back
  //   to scanning for any button whose label contains "add", which
  //   tends to survive site redesigns better than a hashed CSS class
  //   chain, but is less precise.
  // ============================================================
  const SITE_SELECTORS = {
    searchInputSelector: "#search-bar-input",
    searchSubmitSelector: null, // search is live/instant — no submit button
    pressEnterToSearch: false, // flip to true only if testing shows results don't appear without it
    resultsContainerSelector: "#store-wrapper", // wraps the loaded results list — used to scope the fallback search
    firstResultAddToCartSelector: null, // exact "Add to cart" button selector, once you have it
  };

  const STORAGE_KEY = "groceryList";

  chrome.storage.local.get([STORAGE_KEY]).then((data) => {
    const items = data[STORAGE_KEY];
    if (!items || items.length === 0) {
      alert(
        "No grocery list loaded yet. Open your Meal Planner tab, click " +
          "'Load Grocery List From This Tab' in the extension popup, then come back here.",
      );
      return;
    }
    startAdapter(items);
  });

  function startAdapter(items) {
    let index = 0;
    // Once we find the right product card for the current item, we
    // stick to THAT card for every subsequent "Add to Cart" click —
    // otherwise a re-scan of the whole results list can drift onto a
    // different product once the original button turns into a
    // quantity stepper (see findAddToCartButton below).
    let lockedCard = null;

    // Existing overlay from a previous run? Remove it so we don't stack duplicates.
    const existing = document.getElementById("meal-planner-cart-filler-overlay");
    if (existing) existing.remove();

    // Shadow DOM keeps our overlay's CSS from colliding with ALDI's
    // own page styles, and vice versa.
    const host = document.createElement("div");
    host.id = "meal-planner-cart-filler-overlay";
    host.style.cssText = "position:fixed; bottom:16px; right:16px; z-index:2147483647;";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = `
      <style>
        .panel {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
          padding: 14px;
          width: 270px;
          color: #333;
        }
        .panel h3 { margin: 0 0 8px 0; font-size: 14px; color: #2c3e50; }
        .item-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; }
        .item-meta { font-size: 12px; color: #7f8c8d; margin-bottom: 8px; }
        .progress { font-size: 11px; color: #95a5a6; margin-bottom: 10px; }
        .step-hint { font-size: 11px; color: #2980b9; min-height: 14px; margin: -2px 0 8px 0; line-height: 1.3; }
        button {
          background: #27ae60; color: white; border: none; padding: 8px 10px;
          font-size: 12px; border-radius: 4px; cursor: pointer; width: 100%;
          font-weight: bold; margin-bottom: 6px;
        }
        button:hover { background: #219653; }
        button.secondary { background: #2980b9; }
        button.secondary:hover { background: #21618c; }
        button:disabled { background: #bdc3c7; cursor: not-allowed; }
        button.close { background: transparent; color: #95a5a6; font-weight: normal; }
      </style>
      <div class="panel">
        <h3>🛒 Cart Filler</h3>
        <div class="progress" id="progress"></div>
        <div class="item-name" id="itemName"></div>
        <div class="item-meta" id="itemMeta"></div>
        <div class="step-hint" id="stepHint"></div>
        <button id="btnSearch">1. Search This Item</button>
        <button id="btnAddToCart" class="secondary" disabled>2. Add to Cart</button>
        <button id="btnCopy" class="secondary">Copy Search Term</button>
        <button id="btnDone">Added ✓ — Next Item</button>
        <button id="btnSkip">Skip Item</button>
        <button id="btnRestart" class="secondary" style="display:none">🔄 Review List Again</button>
        <button id="btnClose" class="close">Close</button>
      </div>
    `;

    const progressEl = shadow.getElementById("progress");
    const nameEl = shadow.getElementById("itemName");
    const metaEl = shadow.getElementById("itemMeta");
    const hintEl = shadow.getElementById("stepHint");
    const btnSearch = shadow.getElementById("btnSearch");
    const btnAddToCart = shadow.getElementById("btnAddToCart");
    const btnCopy = shadow.getElementById("btnCopy");
    const btnDone = shadow.getElementById("btnDone");
    const btnSkip = shadow.getElementById("btnSkip");
    const btnRestart = shadow.getElementById("btnRestart");

    function currentItem() {
      return items[index];
    }

    function render() {
      hintEl.textContent = "";

      if (index >= items.length) {
        nameEl.textContent = "All done! 🎉";
        metaEl.textContent = "Review your cart, then check out on the site.";
        progressEl.textContent = `${items.length} of ${items.length} complete`;
        [btnSearch, btnAddToCart, btnCopy, btnDone, btnSkip].forEach((b) => (b.style.display = "none"));
        btnRestart.style.display = "block";
        return;
      }

      btnRestart.style.display = "none";
      [btnSearch, btnAddToCart, btnCopy, btnDone, btnSkip].forEach((b) => (b.style.display = "block"));
      btnAddToCart.disabled = true;

      const item = currentItem();
      progressEl.textContent = `Item ${index + 1} of ${items.length}`;
      nameEl.textContent = item.search_term;
      metaEl.textContent = `${item.quantity_needed} ${item.unit_type} · ${item.store_department}`;
      hintEl.textContent = 'Click "Search This Item", then pick the matching suggestion on the page.';
    }

    // Polls for something instead of guessing a fixed delay — live
    // search/results rendering takes a variable amount of time
    // depending on network speed. `getter` should return a truthy
    // value (e.g. an element) once ready, or falsy while still waiting.
    function waitForCondition(getter, timeoutMs, intervalMs) {
      timeoutMs = timeoutMs || 6000;
      intervalMs = intervalMs || 250;
      return new Promise((resolve) => {
        const start = Date.now();
        (function check() {
          const result = getter();
          if (result) return resolve(result);
          if (Date.now() - start >= timeoutMs) return resolve(null);
          setTimeout(check, intervalMs);
        })();
      });
    }

    // Product cards on this site are <li> elements inside the results
    // list (per the selector chain you found: ul > li > ... ). Walking
    // up to the nearest <li> gives us a stable handle on "this specific
    // product" that survives the button inside it changing state.
    function closestCard(el) {
      return el.closest("li");
    }

    function findAddButtonInScope(scopeEl) {
      if (!scopeEl) return null;
      const buttons = scopeEl.querySelectorAll("button");
      for (const btn of buttons) {
        const label = (btn.getAttribute("aria-label") || btn.textContent || "").trim().toLowerCase();
        if (label.includes("add")) return btn;
      }
      return null;
    }

    // Once a card's button has turned into a quantity stepper, look
    // for an explicit increment control first; fall back to "last
    // button in the card" since steppers are conventionally laid out
    // [minus, quantity, plus] left to right.
    function findIncrementButtonInCard(cardEl) {
      if (!cardEl) return null;
      const buttons = Array.from(cardEl.querySelectorAll("button"));
      for (const btn of buttons) {
        const label = (btn.getAttribute("aria-label") || btn.textContent || "").trim().toLowerCase();
        if (label.includes("increase") || label.includes("increment") || label.includes("plus") || label === "+") {
          return btn;
        }
      }
      if (buttons.length >= 2) {
        return buttons[buttons.length - 1];
      }
      return null;
    }

    function findAddToCartButton() {
      // Already locked onto a card for this item — stay on it.
      if (lockedCard && document.body.contains(lockedCard)) {
        const addBtn = findAddButtonInScope(lockedCard);
        if (addBtn) return addBtn;
        return findIncrementButtonInCard(lockedCard);
      }

      // First attempt for this item: find the card via the configured
      // exact selector or the page-wide text scan, then lock onto it.
      if (SITE_SELECTORS.firstResultAddToCartSelector) {
        const exact = document.querySelector(SITE_SELECTORS.firstResultAddToCartSelector);
        if (exact) {
          lockedCard = closestCard(exact);
          return exact;
        }
      }
      const scope = SITE_SELECTORS.resultsContainerSelector
        ? document.querySelector(SITE_SELECTORS.resultsContainerSelector)
        : document;
      const found = findAddButtonInScope(scope);
      if (found) {
        lockedCard = closestCard(found);
      }
      return found;
    }

    function fillSearchBox(term) {
      const input = document.querySelector(SITE_SELECTORS.searchInputSelector);
      if (!input) {
        alert("Couldn't find the search box with the configured selector — copied to clipboard instead.");
        navigator.clipboard.writeText(term);
        return false;
      }
      // React-controlled inputs ignore a plain `.value =` assignment.
      // This native-setter + input-event combo is the standard
      // workaround so the site's own framework picks up the change.
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      nativeSetter.call(input, term);
      input.dispatchEvent(new Event("input", { bubbles: true }));

      if (SITE_SELECTORS.searchSubmitSelector) {
        const submitBtn = document.querySelector(SITE_SELECTORS.searchSubmitSelector);
        if (submitBtn) submitBtn.click();
      } else if (SITE_SELECTORS.pressEnterToSearch) {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }),
        );
      }
      // Otherwise: live/instant suggestions — no submit action needed.
      return true;
    }

    btnSearch.addEventListener("click", () => {
      const item = currentItem();
      if (!item) return;
      lockedCard = null; // a new search means any previous card lock no longer applies
      if (!SITE_SELECTORS.searchInputSelector) {
        navigator.clipboard.writeText(item.search_term);
        alert(
          `No search selector configured for this site yet, so I copied "${item.search_term}" ` +
            `to your clipboard — paste it into the search box.`,
        );
        return;
      }
      const ok = fillSearchBox(item.search_term);
      if (ok) {
        hintEl.textContent = "Now click the matching suggestion on the page, then click \"Add to Cart\" below.";
        btnAddToCart.disabled = false;
      }
    });

    btnAddToCart.addEventListener("click", async () => {
      btnAddToCart.disabled = true;
      btnAddToCart.textContent = "Looking…";
      const addBtn = await waitForCondition(findAddToCartButton);
      btnAddToCart.textContent = "2. Add to Cart";
      // Always re-enable — lets you click again for another unit of the
      // same item, or retry if it didn't find the button the first time.
      btnAddToCart.disabled = false;

      if (addBtn) {
        addBtn.click();
        hintEl.textContent =
          'Added! Click again for another unit, or "Added ✓ — Next Item" to move on. ' +
          "(Note: some sites swap the button for a quantity stepper after the first click — " +
          "if a second click doesn't do anything, that's the site's own +/- control taking over.)";
      } else {
        console.warn("[Cart Filler] Couldn't find the Add to cart button for:", currentItem() && currentItem().search_term);
        hintEl.textContent = "Couldn't find it automatically — add it manually, then click \"Added ✓\".";
      }
    });

    btnCopy.addEventListener("click", () => {
      const item = currentItem();
      if (item) navigator.clipboard.writeText(item.search_term);
    });

    btnDone.addEventListener("click", () => {
      lockedCard = null;
      index++;
      render();
    });

    btnSkip.addEventListener("click", () => {
      lockedCard = null;
      index++;
      render();
    });

    btnRestart.addEventListener("click", () => {
      lockedCard = null;
      index = 0;
      render();
    });

    shadow.getElementById("btnClose").addEventListener("click", () => {
      host.remove();
    });

    render();
  }
})();
