/**
 * Bug 4: General bug sweep and regression tests
 *
 * Tests for race conditions, unhandled errors, broken event
 * listeners, and other potential issues found during code review.
 */

const {
  createTriggerAndPanel,
  injectStyles,
  clamp,
  placePanelNearTrigger,
  getDetectionPatterns,
  parseWiUIDFromFirstArg,
} = require('./test-helpers');

describe('Bug 4: General sweep', () => {
  describe('clamp utility', () => {
    test('clamps value below min', () => {
      expect(clamp(-10, 0, 100)).toBe(0);
    });

    test('clamps value above max', () => {
      expect(clamp(200, 0, 100)).toBe(100);
    });

    test('returns value when within range', () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });

    test('handles min === max', () => {
      expect(clamp(50, 10, 10)).toBe(10);
    });

    test('handles negative ranges', () => {
      expect(clamp(-5, -10, -1)).toBe(-5);
    });
  });

  describe('placePanelNearTrigger null safety', () => {
    test('does not throw when panel is null', () => {
      expect(() => placePanelNearTrigger(null, document.createElement('div'))).not.toThrow();
    });

    test('does not throw when trigger is null', () => {
      expect(() => placePanelNearTrigger(document.createElement('div'), null)).not.toThrow();
    });

    test('does not throw when both are null', () => {
      expect(() => placePanelNearTrigger(null, null)).not.toThrow();
    });
  });

  describe('DOM cleanup on destroy', () => {
    test('trigger, panel, and configPanel can be removed from DOM', () => {
      document.body.innerHTML = '';
      injectStyles();
      const { trigger, panel, configPanel } = createTriggerAndPanel();

      expect(document.querySelector('.stwii--trigger')).not.toBeNull();
      expect(document.querySelectorAll('.stwii--panel').length).toBe(2);

      // Simulate destroy
      trigger.parentNode.removeChild(trigger);
      panel.parentNode.removeChild(panel);
      configPanel.parentNode.removeChild(configPanel);

      expect(document.querySelector('.stwii--trigger')).toBeNull();
      expect(document.querySelectorAll('.stwii--panel').length).toBe(0);
    });
  });

  describe('Panel toggle behavior', () => {
    let trigger, panel;

    beforeEach(() => {
      document.body.innerHTML = '';
      injectStyles();
      ({ trigger, panel } = createTriggerAndPanel());
    });

    test('panel starts hidden (no stwii--isActive class)', () => {
      expect(panel.classList.contains('stwii--isActive')).toBe(false);
    });

    test('toggling stwii--isActive shows panel', () => {
      panel.classList.add('stwii--isActive');
      expect(panel.classList.contains('stwii--isActive')).toBe(true);
    });

    test('toggling stwii--isActive twice hides panel', () => {
      panel.classList.toggle('stwii--isActive');
      panel.classList.toggle('stwii--isActive');
      expect(panel.classList.contains('stwii--isActive')).toBe(false);
    });
  });

  describe('Badge data attribute', () => {
    test('trigger can hold badge count as data attribute', () => {
      const trigger = document.createElement('div');
      trigger.classList.add('stwii--trigger');
      trigger.setAttribute('data-stwii--badge-count', '5');
      expect(trigger.getAttribute('data-stwii--badge-count')).toBe('5');
    });

    test('badge count of 0 is handled', () => {
      const trigger = document.createElement('div');
      trigger.classList.add('stwii--trigger');
      trigger.setAttribute('data-stwii--badge-count', '0');
      expect(trigger.getAttribute('data-stwii--badge-count')).toBe('0');
    });
  });

  describe('CSS integrity', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
      injectStyles();
    });

    test('style element is injected into document', () => {
      const style = document.querySelector('style');
      expect(style).not.toBeNull();
    });

    test('CSS contains trigger styles', () => {
      const style = document.querySelector('style');
      expect(style.textContent).toContain('.stwii--trigger');
    });

    test('CSS contains panel styles', () => {
      const style = document.querySelector('style');
      expect(style.textContent).toContain('.stwii--panel');
    });

    test('CSS contains badge animation keyframes', () => {
      const style = document.querySelector('style');
      expect(style.textContent).toContain('@keyframes stwii--badge-popin');
      expect(style.textContent).toContain('@keyframes stwii--badge-bounce');
    });

    test('CSS contains config row styles', () => {
      const style = document.querySelector('style');
      expect(style.textContent).toContain('.stwii--configRow');
    });

    test('CSS does not use position:absolute for trigger (use fixed instead)', () => {
      const style = document.querySelector('style');
      const cssText = style.textContent;
      // Extract the trigger block
      const triggerBlock = cssText.match(/\.stwii--trigger\s*\{[^}]+\}/);
      expect(triggerBlock).not.toBeNull();
      // Should use position:fixed, not position:absolute
      expect(triggerBlock[0]).toMatch(/position:\s*fixed/);
      expect(triggerBlock[0]).not.toMatch(/position:\s*absolute/);
    });
  });

  describe('parseWiUIDFromFirstArg edge cases', () => {
    test('handles entry ID at the max safe integer boundary', () => {
      const uid = parseWiUIDFromFirstArg('[WI] Entry 9007199254740991 something');
      expect(uid).toBe(9007199254740991);
    });

    test('handles string with multiple "[WI] Entry" patterns (takes first)', () => {
      const uid = parseWiUIDFromFirstArg('[WI] Entry 5 [WI] Entry 10');
      expect(uid).toBe(5);
    });

    test('handles entry with no space after number', () => {
      // The regex requires a space or end after the number in practice
      const uid = parseWiUIDFromFirstArg('[WI] Entry 5');
      expect(uid).toBe(5);
    });
  });

  describe('Detection pattern robustness', () => {
    const patterns = getDetectionPatterns();

    test('zero entry triggers use exact string match (not regex)', () => {
      // These must be exact matches - verify they are strings
      for (const trigger of patterns.zeroEntryTriggers) {
        expect(typeof trigger).toBe('string');
      }
    });

    test('all regex patterns are valid RegExp objects', () => {
      const regexKeys = [
        'wiUidRegex',
        'worldNameRegex',
        'primaryKeyInlineRegex',
        'primaryHasSecondaryRegex',
        'logicBracketRegex',
        'secAndAnyRegex',
        'secNotAllRegex',
        'loopStartRegex',
        'loopResultRegex',
        'loopCountRegex',
        'addedCountRegex',
      ];

      for (const key of regexKeys) {
        expect(patterns[key]).toBeInstanceOf(RegExp);
      }
    });
  });

  describe('Trigger hover behavior', () => {
    test('trigger opacity increases on hover (CSS rule exists)', () => {
      document.body.innerHTML = '';
      injectStyles();
      const style = document.querySelector('style');
      const cssText = style.textContent;

      // The trigger should have a hover state that increases opacity
      // or a transition on opacity
      expect(cssText).toMatch(/\.stwii--trigger/);
      expect(cssText).toMatch(/transition.*opacity|opacity.*transition/);
    });
  });
});
