/**
 * Bug 2: Bottom-left icon is not visible
 *
 * Tests that the trigger icon is present in the DOM, has visible
 * dimensions, proper opacity, and correct positioning so it's
 * not hidden or clipped.
 *
 * Note: jsdom cannot parse modern CSS features like @supports,
 * so we test computed styles where possible and fall back to
 * checking the raw CSS text for properties jsdom can't resolve.
 */

const { createTriggerAndPanel, injectStyles } = require('./test-helpers');

/**
 * Extract the .stwii--trigger CSS rule block from raw CSS text.
 */
function getTriggerCssBlock() {
  const styleEl = document.querySelector('style');
  const cssText = styleEl.textContent;
  const match = cssText.match(/\.stwii--trigger\s*\{[^}]+\}/);
  return match ? match[0] : '';
}

describe('Bug 2: Icon visibility', () => {
  let trigger;

  beforeEach(() => {
    document.body.innerHTML = '';
    injectStyles();
    ({ trigger } = createTriggerAndPanel());
  });

  test('trigger element is present in the DOM', () => {
    const found = document.querySelector('.stwii--trigger');
    expect(found).not.toBeNull();
    expect(found).toBe(trigger);
  });

  test('trigger has the correct CSS classes for FontAwesome icon', () => {
    expect(trigger.classList.contains('stwii--trigger')).toBe(true);
    expect(trigger.classList.contains('fa-solid')).toBe(true);
    expect(trigger.classList.contains('fa-book-atlas')).toBe(true);
  });

  test('trigger is not display:none', () => {
    const style = getComputedStyle(trigger);
    expect(style.display).not.toBe('none');
  });

  test('trigger is not visibility:hidden', () => {
    const style = getComputedStyle(trigger);
    expect(style.visibility).not.toBe('hidden');
  });

  test('trigger CSS declares opacity greater than 0', () => {
    // jsdom can't resolve computed opacity from the stylesheet due to @supports,
    // so we check the raw CSS text for the opacity value
    const block = getTriggerCssBlock();
    const match = block.match(/opacity:\s*([\d.]+)/);
    expect(match).not.toBeNull();
    const opacity = parseFloat(match[1]);
    expect(opacity).toBeGreaterThan(0);
  });

  test('trigger CSS opacity is sufficient to be noticeable (>= 0.15)', () => {
    const block = getTriggerCssBlock();
    const match = block.match(/opacity:\s*([\d.]+)/);
    expect(match).not.toBeNull();
    const opacity = parseFloat(match[1]);
    expect(opacity).toBeGreaterThanOrEqual(0.15);
  });

  test('trigger uses fixed positioning (not absolute) so it stays visible regardless of scroll/container', () => {
    // position:absolute can cause clipping if parent has overflow:hidden.
    // position:fixed ensures the icon is always relative to viewport.
    const block = getTriggerCssBlock();
    expect(block).toMatch(/position:\s*fixed/);
    expect(block).not.toMatch(/position:\s*absolute/);
  });

  test('trigger has a z-index high enough to be above common UI layers', () => {
    const block = getTriggerCssBlock();
    const match = block.match(/z-index:\s*(\d+)/);
    expect(match).not.toBeNull();
    const zIndex = parseInt(match[1], 10);
    expect(zIndex).toBeGreaterThanOrEqual(1000);
  });

  test('trigger CSS declares bottom and left positioning', () => {
    const block = getTriggerCssBlock();
    expect(block).toMatch(/bottom\s*:/);
    expect(block).toMatch(/left\s*:/);
  });

  test('trigger CSS declares cursor:pointer for discoverability', () => {
    const block = getTriggerCssBlock();
    expect(block).toMatch(/cursor:\s*pointer/);
  });

  test('trigger has a title/tooltip for accessibility', () => {
    expect(trigger.title).toBeTruthy();
    expect(trigger.title.length).toBeGreaterThan(0);
  });

  test('trigger CSS declares display:block (not none)', () => {
    const block = getTriggerCssBlock();
    expect(block).toMatch(/display:\s*block/);
  });
});
