# Meal Planner Grocery Cart Filler — Chrome Extension

Reads the grocery list saved by the meal planner web app and helps you fill
your ALDI pickup cart, without you having to retype anything.

## Loading it in Chrome (unpacked, for personal use)

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder (the one containing `manifest.json`)
5. Pin it to your toolbar (puzzle-piece icon → pin) so it's easy to reach

No icons are included — Chrome will show a default placeholder icon, which
is purely cosmetic and doesn't affect anything working.

## How to use it

1. Open your **meal planner tab**, run it through Step 1/Step 2 (or the
   Gemini chat) until you've saved a grocery list.
2. Click the extension icon → **Load Grocery List From This Tab**.
   (This has to be the meal planner tab specifically — the button reads
   `localStorage` from whatever tab is currently active.)
3. Go to your **ALDI pickup order page** (`shop.aldi.us`, `new.aldi.us`,
   or `instacart.com/store/aldi` — whichever you use).
4. Click the extension icon → **Start Adding to Cart on This Tab**.
5. A small panel appears in the bottom-right corner of the page, showing
   one grocery item at a time. Search/add it yourself, then click
   **Added ✓ — Next Item** to move on. (Once real selectors are wired up
   per the section below, **Search This Item** will do the searching
   for you automatically.)

The extension never touches checkout or payment — adding items to your
cart is as far as it goes. You always review and check out yourself.

## Getting to full one-click automation

Right now `content-scripts/site-adapter.js` runs in "copilot" mode: it
shows you what to search, but you do the clicking. To make it fully
automatic, two CSS selectors need to be filled in near the top of that
file:

```javascript
const SITE_SELECTORS = {
  searchInputSelector: null, // <- the search box
  searchSubmitSelector: null, // optional, leave null to just press Enter
  firstResultAddToCartSelector: null, // <- "Add to cart" on the first result
};
```

**To find these on your ALDI order page:**

1. Click into the search box on the page.
2. Right-click it → **Inspect**. DevTools opens with that exact element
   highlighted.
3. Right-click the highlighted line in DevTools → **Copy** → **Copy selector**.
4. Paste that string as `searchInputSelector`.
5. Search for any one item manually, then repeat steps 2–4 on the
   **Add to cart** button on the *first* result card, into
   `firstResultAddToCartSelector`.

Send me both strings (or just paste the raw HTML of those two elements)
and I'll wire up the automation and double-check the logic against the
real markup.

## Files

- `manifest.json` — extension config (Manifest V3, `activeTab` + `scripting`
  + `storage` permissions only — no hardcoded site permissions, so it works
  regardless of which ALDI URL you use or how the meal planner is hosted)
- `popup.html` / `popup.js` — the toolbar popup UI
- `content-scripts/site-adapter.js` — injected into the ALDI order page
  when you click "Start Adding to Cart"
