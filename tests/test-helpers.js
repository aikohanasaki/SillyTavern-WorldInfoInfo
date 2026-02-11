/**
 * Test helpers: creates a mock SillyTavern environment and loads
 * the extension's DOM-manipulation / positioning / detection logic
 * in an isolated, testable way.
 *
 * The real index.js relies on SillyTavern imports that don't exist
 * outside of the host app, so we extract and re-implement the
 * core functions here for unit testing.
 */

/** Provide a minimal mock for extension_settings and friends */
function createMockEnvironment() {
  const extension_settings = { worldInfoInfo: {} };
  const chat_metadata = {};
  const chat = [];
  const world_info_position = {
    before: 0,
    after: 1,
    ANTop: 2,
    ANBottom: 3,
    atDepth: 4,
    EMTop: 5,
    EMBottom: 6,
  };

  return { extension_settings, chat_metadata, chat, world_info_position };
}

/**
 * Re-implementation of the trigger/panel creation logic from index.js
 * so we can test DOM structure and positioning in isolation.
 */
function createTriggerAndPanel() {
  const trigger = document.createElement('div');
  trigger.classList.add('stwii--trigger');
  trigger.classList.add('fa-solid', 'fa-fw', 'fa-book-atlas');
  trigger.title = 'Active WI\n---\nright click for options';
  document.body.append(trigger);

  const panel = document.createElement('div');
  panel.classList.add('stwii--panel');
  panel.innerHTML = '?';
  document.body.append(panel);

  const configPanel = document.createElement('div');
  configPanel.classList.add('stwii--panel');
  document.body.append(configPanel);

  return { trigger, panel, configPanel };
}

/**
 * Inject the extension's CSS into the jsdom document.
 */
function injectStyles() {
  const fs = require('fs');
  const path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
}

/**
 * Clamp utility (mirrors the one inside init())
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * placePanelNearTrigger - mirrors the function from index.js
 */
function placePanelNearTrigger(panelEl, triggerEl, gap = 0) {
  if (!panelEl || !triggerEl) return;

  const wasHidden = getComputedStyle(panelEl).display === 'none';
  if (wasHidden) {
    panelEl.style.visibility = 'hidden';
    panelEl.style.display = 'flex';
  }

  panelEl.style.position = 'fixed';

  const tr = triggerEl.getBoundingClientRect();
  const pw = panelEl.offsetWidth || 300;
  const ph = panelEl.offsetHeight || 200;

  let left = tr.right + gap;
  if (left + pw > window.innerWidth - 4) {
    left = tr.left - pw - gap;
  }
  left = clamp(left, 4, Math.max(4, window.innerWidth - pw - 4));

  let top = clamp(tr.top, 4, Math.max(4, window.innerHeight - ph - 4));

  panelEl.style.left = left + 'px';
  panelEl.style.top = top + 'px';
  panelEl.style.right = 'auto';
  panelEl.style.bottom = 'auto';

  if (wasHidden) {
    panelEl.style.visibility = '';
    panelEl.style.display = '';
  }
}

/**
 * ensurePanelsVisible - mirrors the function from index.js
 */
function ensurePanelsVisible(trigger, panels) {
  const isActive = (el) => !!el && el.classList.contains('stwii--isActive');
  const isOffscreen = (r) =>
    r.left < 0 || r.right > window.innerWidth || r.top < 0 || r.bottom > window.innerHeight;

  const tr = trigger.getBoundingClientRect();

  const ensure = (el) => {
    if (!isActive(el)) return;
    const r = el.getBoundingClientRect();
    if (isOffscreen(r)) {
      placePanelNearTrigger(el, trigger);
    }
  };

  for (const p of panels) {
    ensure(p);
  }
}

/**
 * Extract the lore book detection logic patterns used by index.js.
 * These are the regex patterns and console message triggers the
 * extension uses to detect WI entries.
 */
function getDetectionPatterns() {
  return {
    // UID extraction from console args
    wiUidRegex: /\[WI\]\s+Entry\s+(\d+)/,

    // World name extraction
    worldNameRegex: /\bfrom\s+'([^']+)'\s+processing/i,

    // Primary key match (single-line)
    primaryKeyInlineRegex: /\[WI\]\s+Entry\s+\d+.*?activated by primary key match\s+(.+)/i,

    // Primary key with secondary keywords
    primaryHasSecondaryRegex: /\bEntry with primary key match\s+(.+?)\s+has secondary keywords/i,

    // Logic bracket capture
    logicBracketRegex: /Checking with logic\s+logic\s*\(\d+\)\s*\[['"]?(AND_ANY|AND_ALL|NOT_ANY|NOT_ALL)['"]?/i,

    // Secondary keyword captures
    secAndAnyRegex: /\(AND ANY\)\s*Found match secondary keyword\s+(.+)/i,
    secNotAllRegex: /\(NOT ALL\)\s*Found not matching secondary keyword\s+(.+)/i,

    // Zero-entries triggers (exact string matches)
    zeroEntryTriggers: [
      '[WI] Found 0 world lore entries. Sorted by strategy',
      '[WI] Adding 0 entries to prompt',
    ],

    // Activation commit detection
    activationCommitPattern: 'activation successful, adding to prompt',

    // Loop delimiters
    loopStartRegex: /\[WI\]\s+---\s+LOOP\s+#(\d+)\s+START\s+---/i,
    loopResultRegex: /\[WI\]\s+---\s+LOOP\s+#(\d+)\s+RESULT\s+---/i,

    // Scan boundaries
    scanStartPattern: '[WI] --- START WI SCAN',
    buildPromptPattern: '--- BUILDING PROMPT ---',
    donePattern: '--- DONE ---',

    // Per-loop count capture
    loopCountRegex: /Successfully\s+activated\s+(\d+)\s+new\s+entries\s+to\s+prompt/i,

    // Final added count
    addedCountRegex: /\[\s*WI\s*\]\s+Adding\s+(\d+)\s+entries\s+to\s+prompt\b/i,
  };
}

/**
 * parseWiUIDFromFirstArg - mirrors the function from index.js
 */
function parseWiUIDFromFirstArg(a0) {
  if (typeof a0 !== 'string') return null;
  const m = a0.match(/\[WI\]\s+Entry\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * getStrategy - mirrors the function from index.js
 */
function getStrategy(entry) {
  if (entry.constant === true) {
    return 'constant';
  } else if (entry.vectorized === true) {
    return 'vectorized';
  } else {
    return 'normal';
  }
}

/**
 * isHiddenWorld - mirrors the visibility filtering from index.js
 */
function isHiddenWorld(w, currentHandle, isAdmin) {
  const norm = (s) => (typeof s === 'string' ? s : '').trim();
  const extractZHandle = (world) => {
    const m = norm(world).match(/^Z-([^-\s]+)(?:-|$)/);
    return m ? m[1] : null;
  };

  if (isAdmin) return false;

  const s = norm(w);
  if (s === '9Z Universal Commands') return false;

  const h = extractZHandle(s);
  if (h) {
    return h !== currentHandle;
  }

  return s.startsWith('9Z');
}

module.exports = {
  createMockEnvironment,
  createTriggerAndPanel,
  injectStyles,
  clamp,
  placePanelNearTrigger,
  ensurePanelsVisible,
  getDetectionPatterns,
  parseWiUIDFromFirstArg,
  getStrategy,
  isHiddenWorld,
};
