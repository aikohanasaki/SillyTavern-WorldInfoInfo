/**
 * Bug 1: Lore book popup is clipped/not fully visible
 *
 * Tests that the popup panel stays within viewport bounds when
 * rendered near screen edges.
 */

const {
  createTriggerAndPanel,
  injectStyles,
  clamp,
  placePanelNearTrigger,
} = require('./test-helpers');

// jsdom doesn't support layout, so we mock getBoundingClientRect
function mockRect(el, rect) {
  el.getBoundingClientRect = () => ({
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    width: (rect.right ?? 0) - (rect.left ?? 0),
    height: (rect.bottom ?? 0) - (rect.top ?? 0),
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    right: rect.right ?? 0,
    bottom: rect.bottom ?? 0,
    toJSON() {},
  });
}

function mockPanelDimensions(panel, width, height) {
  Object.defineProperty(panel, 'offsetWidth', { value: width, configurable: true });
  Object.defineProperty(panel, 'offsetHeight', { value: height, configurable: true });
}

describe('Bug 1: Popup clipping', () => {
  let trigger, panel, configPanel;

  beforeEach(() => {
    document.body.innerHTML = '';
    injectStyles();
    ({ trigger, panel, configPanel } = createTriggerAndPanel());

    // Default viewport 1024x768
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  test('panel stays within viewport when trigger is at bottom-left corner', () => {
    // Trigger at bottom-left
    mockRect(trigger, { left: 4, top: 730, right: 36, bottom: 762 });
    mockPanelDimensions(panel, 300, 400);
    panel.classList.add('stwii--isActive');
    panel.style.display = 'flex';

    placePanelNearTrigger(panel, trigger);

    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    const right = left + 300;
    const bottom = top + 400;

    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(1024);
    expect(bottom).toBeLessThanOrEqual(768);
  });

  test('panel stays within viewport when trigger is at top-right corner', () => {
    mockRect(trigger, { left: 990, top: 4, right: 1022, bottom: 36 });
    mockPanelDimensions(panel, 300, 400);
    panel.classList.add('stwii--isActive');
    panel.style.display = 'flex';

    placePanelNearTrigger(panel, trigger);

    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    const right = left + 300;
    const bottom = top + 400;

    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(1024);
    expect(bottom).toBeLessThanOrEqual(768);
  });

  test('panel stays within viewport when trigger is at top-left', () => {
    mockRect(trigger, { left: 4, top: 4, right: 36, bottom: 36 });
    mockPanelDimensions(panel, 300, 400);
    panel.classList.add('stwii--isActive');
    panel.style.display = 'flex';

    placePanelNearTrigger(panel, trigger);

    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    const right = left + 300;
    const bottom = top + 400;

    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(1024);
    expect(bottom).toBeLessThanOrEqual(768);
  });

  test('panel stays within viewport when trigger is at bottom-right', () => {
    mockRect(trigger, { left: 990, top: 730, right: 1022, bottom: 762 });
    mockPanelDimensions(panel, 300, 400);
    panel.classList.add('stwii--isActive');
    panel.style.display = 'flex';

    placePanelNearTrigger(panel, trigger);

    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    const right = left + 300;
    const bottom = top + 400;

    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(1024);
    expect(bottom).toBeLessThanOrEqual(768);
  });

  test('panel stays within viewport on very small screen (mobile)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 667, configurable: true });

    mockRect(trigger, { left: 4, top: 630, right: 36, bottom: 662 });
    mockPanelDimensions(panel, 350, 500);
    panel.classList.add('stwii--isActive');
    panel.style.display = 'flex';

    placePanelNearTrigger(panel, trigger);

    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    const right = left + 350;
    const bottom = top + 500;

    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    // On a 375px-wide screen with a 350px panel, it should fit but be tight
    expect(right).toBeLessThanOrEqual(375);
    expect(bottom).toBeLessThanOrEqual(667);
  });

  test('panel flips to left side when right side would overflow', () => {
    // Trigger on the right edge
    mockRect(trigger, { left: 900, top: 300, right: 932, bottom: 332 });
    mockPanelDimensions(panel, 300, 200);
    panel.classList.add('stwii--isActive');
    panel.style.display = 'flex';

    placePanelNearTrigger(panel, trigger);

    const left = parseFloat(panel.style.left);
    // Panel should be to the left of the trigger since right side overflows
    expect(left).toBeLessThan(900);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  test('CSS max-width and max-height constrain panel size', () => {
    // The CSS should include max-width and max-height using viewport units
    const style = document.querySelector('style');
    const cssText = style.textContent;

    // Verify max-width constraint exists
    expect(cssText).toMatch(/max-width/);
    // Verify max-height constraint exists
    expect(cssText).toMatch(/max-height/);
  });

  test('panel has overflow:auto to handle content that exceeds max dimensions', () => {
    const style = document.querySelector('style');
    const cssText = style.textContent;

    expect(cssText).toMatch(/overflow:\s*auto/);
  });
});
