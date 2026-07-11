// Same localStorage key the meal planner page writes to.
const GROCERY_KEY = "mealPlanner_groceryList";
// Key used inside this extension's own chrome.storage.local.
const STORAGE_KEY = "groceryList";

const statusEl = document.getElementById("status");
const itemListEl = document.getElementById("itemList");
const cartStatusEl = document.getElementById("cartStatus");
const btnLoad = document.getElementById("btnLoad");
const btnFill = document.getElementById("btnFill");

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

function renderItems(items) {
  itemListEl.innerHTML = "";
  if (!items || items.length === 0) {
    itemListEl.innerHTML = '<span class="empty-hint">No items loaded yet.</span>';
    return;
  }
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML =
      `<strong>${escapeHtml(item.search_term)}</strong> — ` +
      `${escapeHtml(item.quantity_needed)} ${escapeHtml(item.unit_type)} ` +
      `<span class="dept-tag">(${escapeHtml(item.store_department)})</span>`;
    itemListEl.appendChild(row);
  });
}

// Re-hydrates the popup with whatever was loaded last time, so
// reopening the popup isn't a blank slate.
async function restoreSavedList() {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  const items = data[STORAGE_KEY];
  if (items && items.length) {
    renderItems(items);
    btnFill.disabled = false;
    statusEl.style.color = "#27ae60";
    statusEl.textContent = `✓ ${items.length} item(s) ready (loaded earlier).`;
  }
}

btnLoad.addEventListener("click", async () => {
  statusEl.style.color = "#333";
  statusEl.textContent = "Reading this tab…";

  try {
    const tab = await getActiveTab();

    // Reads localStorage directly from whatever tab is active right
    // now — this only works if that tab IS the meal planner page, but
    // doesn't require knowing its URL ahead of time (works on
    // localhost, GitHub Pages, a local live-server port, etc).
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (key) => localStorage.getItem(key),
      args: [GROCERY_KEY],
    });

    if (!result) {
      statusEl.style.color = "#e74c3c";
      statusEl.textContent =
        "⚠ No grocery data found on this tab. Open your meal planner tab, save a grocery list there, then try again.";
      return;
    }

    const items = JSON.parse(result);
    await chrome.storage.local.set({ [STORAGE_KEY]: items });
    renderItems(items);
    btnFill.disabled = false;
    statusEl.style.color = "#27ae60";
    statusEl.textContent = `✓ Loaded ${items.length} item(s).`;
  } catch (err) {
    statusEl.style.color = "#e74c3c";
    statusEl.textContent = "⚠ " + err.message;
  }
});

btnFill.addEventListener("click", async () => {
  cartStatusEl.style.color = "#333";
  cartStatusEl.textContent = "Starting on this tab…";

  try {
    const tab = await getActiveTab();
    // Injects the site adapter into whatever tab is currently active —
    // this should be your ALDI pickup order page. The adapter reads
    // the saved list straight from chrome.storage.local itself, so no
    // data needs to be passed here.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-scripts/site-adapter.js"],
    });
    cartStatusEl.style.color = "#27ae60";
    cartStatusEl.textContent = "✓ Started — look for the panel in the bottom-right corner of the page.";
  } catch (err) {
    cartStatusEl.style.color = "#e74c3c";
    cartStatusEl.textContent = "⚠ " + err.message;
  }
});

renderItems(null); // show the empty-state placeholder immediately
restoreSavedList();
