/**
 * Bug 3: Lore book detection may be broken
 *
 * Tests covering: detection when lore books are present,
 * correct handling when none are present, and edge cases.
 */

const {
  getDetectionPatterns,
  parseWiUIDFromFirstArg,
  getStrategy,
  isHiddenWorld,
} = require('./test-helpers');

describe('Bug 3: Lore book detection', () => {
  const patterns = getDetectionPatterns();

  describe('UID extraction from console args', () => {
    test('extracts UID from standard WI entry log', () => {
      const uid = parseWiUIDFromFirstArg('[WI] Entry 42 from \'TestWorld\' processing');
      expect(uid).toBe(42);
    });

    test('extracts UID from entry with large number', () => {
      const uid = parseWiUIDFromFirstArg('[WI] Entry 99999 something');
      expect(uid).toBe(99999);
    });

    test('returns null for non-WI messages', () => {
      expect(parseWiUIDFromFirstArg('Some random log')).toBeNull();
      expect(parseWiUIDFromFirstArg('')).toBeNull();
      expect(parseWiUIDFromFirstArg(null)).toBeNull();
      expect(parseWiUIDFromFirstArg(undefined)).toBeNull();
      expect(parseWiUIDFromFirstArg(42)).toBeNull();
    });

    test('returns null for WI messages without Entry keyword', () => {
      expect(parseWiUIDFromFirstArg('[WI] Found 0 world lore entries')).toBeNull();
    });

    test('handles UID 0', () => {
      const uid = parseWiUIDFromFirstArg('[WI] Entry 0 processing');
      expect(uid).toBe(0);
    });
  });

  describe('World name extraction', () => {
    test('extracts world name from processing line', () => {
      const match = "Entry 11 from 'MyLorebook' processing something".match(patterns.worldNameRegex);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('MyLorebook');
    });

    test('extracts world name with spaces', () => {
      const match = "Entry 5 from 'My Cool Lorebook' processing blah".match(patterns.worldNameRegex);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('My Cool Lorebook');
    });

    test('extracts world name with special characters', () => {
      const match = "Entry 1 from 'Test-Book_v2.0' processing".match(patterns.worldNameRegex);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('Test-Book_v2.0');
    });

    test('does not match when no world name present', () => {
      const match = 'Entry 11 activated by something'.match(patterns.worldNameRegex);
      expect(match).toBeNull();
    });
  });

  describe('Primary key match detection', () => {
    test('detects primary key match in inline format', () => {
      const match = '[WI] Entry 11 activated by primary key match kidnapped'.match(
        patterns.primaryKeyInlineRegex
      );
      expect(match).not.toBeNull();
      expect(match[1]).toBe('kidnapped');
    });

    test('detects primary key match with world context', () => {
      const match =
        "[WI] Entry 21 from 'World' processing activated by primary key match custom".match(
          patterns.primaryKeyInlineRegex
        );
      expect(match).not.toBeNull();
      expect(match[1]).toBe('custom');
    });

    test('detects primary key with secondary keywords present', () => {
      const match =
        'Entry 21 Entry with primary key match custom has secondary keywords'.match(
          patterns.primaryHasSecondaryRegex
        );
      expect(match).not.toBeNull();
      expect(match[1]).toBe('custom');
    });
  });

  describe('Secondary keyword detection', () => {
    test('detects AND ANY secondary keyword', () => {
      const match = '(AND ANY) Found match secondary keyword rainbow'.match(
        patterns.secAndAnyRegex
      );
      expect(match).not.toBeNull();
      expect(match[1]).toBe('rainbow');
    });

    test('detects NOT ALL secondary keyword', () => {
      const match = '(NOT ALL) Found not matching secondary keyword circle'.match(
        patterns.secNotAllRegex
      );
      expect(match).not.toBeNull();
      expect(match[1]).toBe('circle');
    });
  });

  describe('Logic bracket detection', () => {
    test('detects AND_ANY logic', () => {
      const match = "Checking with logic logic (2) ['AND_ANY', 0]".match(
        patterns.logicBracketRegex
      );
      expect(match).not.toBeNull();
      expect(match[1]).toBe('AND_ANY');
    });

    test('detects AND_ALL logic', () => {
      const match = "Checking with logic logic (3) ['AND_ALL', 0]".match(
        patterns.logicBracketRegex
      );
      expect(match).not.toBeNull();
      expect(match[1]).toBe('AND_ALL');
    });

    test('detects NOT_ANY logic', () => {
      const match = "Checking with logic logic (1) ['NOT_ANY', 0]".match(
        patterns.logicBracketRegex
      );
      expect(match).not.toBeNull();
      expect(match[1]).toBe('NOT_ANY');
    });

    test('detects NOT_ALL logic', () => {
      const match = "Checking with logic logic (4) ['NOT_ALL', 0]".match(
        patterns.logicBracketRegex
      );
      expect(match).not.toBeNull();
      expect(match[1]).toBe('NOT_ALL');
    });
  });

  describe('Zero entries detection (no lore books activated)', () => {
    test('recognizes "Found 0 world lore entries" trigger', () => {
      const msg = '[WI] Found 0 world lore entries. Sorted by strategy';
      expect(patterns.zeroEntryTriggers.includes(msg)).toBe(true);
    });

    test('recognizes "Adding 0 entries to prompt" trigger', () => {
      const msg = '[WI] Adding 0 entries to prompt';
      expect(patterns.zeroEntryTriggers.includes(msg)).toBe(true);
    });

    test('does not false-positive on non-zero entry messages', () => {
      const msg = '[WI] Adding 5 entries to prompt';
      expect(patterns.zeroEntryTriggers.includes(msg)).toBe(false);
    });

    test('does not false-positive on partial matches', () => {
      const msg = '[WI] Found 0 world lore entries';
      expect(patterns.zeroEntryTriggers.includes(msg)).toBe(false);
    });
  });

  describe('Activation commit detection', () => {
    test('detects activation successful message', () => {
      const msg = '[WI] Entry 5 activation successful, adding to prompt';
      expect(msg.includes(patterns.activationCommitPattern)).toBe(true);
    });

    test('does not match unrelated messages', () => {
      expect('some random text'.includes(patterns.activationCommitPattern)).toBe(false);
    });
  });

  describe('Loop delimiter detection', () => {
    test('detects loop start', () => {
      const match = '[WI] --- LOOP #1 START ---'.match(patterns.loopStartRegex);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('1');
    });

    test('detects loop result', () => {
      const match = '[WI] --- LOOP #2 RESULT ---'.match(patterns.loopResultRegex);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('2');
    });

    test('handles multi-digit loop numbers', () => {
      const match = '[WI] --- LOOP #15 START ---'.match(patterns.loopStartRegex);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('15');
    });
  });

  describe('Per-loop count capture', () => {
    test('captures loop count from success message', () => {
      const match = 'Successfully activated 3 new entries to prompt'.match(
        patterns.loopCountRegex
      );
      expect(match).not.toBeNull();
      expect(match[1]).toBe('3');
    });

    test('captures zero count', () => {
      const match = 'Successfully activated 0 new entries to prompt'.match(
        patterns.loopCountRegex
      );
      expect(match).not.toBeNull();
      expect(match[1]).toBe('0');
    });
  });

  describe('Final added count capture', () => {
    test('captures final added count', () => {
      const match = '[WI] Adding 7 entries to prompt'.match(patterns.addedCountRegex);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('7');
    });

    test('handles whitespace variations', () => {
      const match = '[ WI ] Adding 12 entries to prompt'.match(patterns.addedCountRegex);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('12');
    });
  });

  describe('Entry strategy classification', () => {
    test('identifies constant entries', () => {
      expect(getStrategy({ constant: true })).toBe('constant');
    });

    test('identifies vectorized entries', () => {
      expect(getStrategy({ vectorized: true })).toBe('vectorized');
    });

    test('identifies normal entries', () => {
      expect(getStrategy({})).toBe('normal');
      expect(getStrategy({ constant: false, vectorized: false })).toBe('normal');
    });

    test('constant takes priority over vectorized', () => {
      expect(getStrategy({ constant: true, vectorized: true })).toBe('constant');
    });
  });

  describe('Hidden world filtering', () => {
    test('admin sees all worlds', () => {
      expect(isHiddenWorld('9Z Secret', 'alice', true)).toBe(false);
      expect(isHiddenWorld('Z-bob-stuff', 'alice', true)).toBe(false);
    });

    test('9Z Universal Commands is visible to everyone', () => {
      expect(isHiddenWorld('9Z Universal Commands', 'alice', false)).toBe(false);
    });

    test('other 9Z worlds are hidden for non-admins', () => {
      expect(isHiddenWorld('9Z Admin Only', 'alice', false)).toBe(true);
    });

    test('Z-user worlds are visible to matching user', () => {
      expect(isHiddenWorld('Z-alice-commands', 'alice', false)).toBe(false);
    });

    test('Z-user worlds are hidden from non-matching users', () => {
      expect(isHiddenWorld('Z-bob-commands', 'alice', false)).toBe(true);
    });

    test('Z-user without trailing dash is handled', () => {
      expect(isHiddenWorld('Z-alice', 'alice', false)).toBe(false);
      expect(isHiddenWorld('Z-bob', 'alice', false)).toBe(true);
    });

    test('regular worlds are visible to everyone', () => {
      expect(isHiddenWorld('My Lorebook', 'alice', false)).toBe(false);
      expect(isHiddenWorld('Character Lore', '', false)).toBe(false);
    });
  });

  describe('Edge cases for multiple lore books', () => {
    test('detection patterns work on consecutive WI log entries', () => {
      const logs = [
        "[WI] Entry 1 from 'Book1' processing something",
        '[WI] Entry 1 activated by primary key match hello',
        "[WI] Entry 2 from 'Book2' processing something",
        '[WI] Entry 2 activated by primary key match world',
      ];

      // Each entry should have its UID extracted correctly
      expect(parseWiUIDFromFirstArg(logs[0])).toBe(1);
      expect(parseWiUIDFromFirstArg(logs[1])).toBe(1);
      expect(parseWiUIDFromFirstArg(logs[2])).toBe(2);
      expect(parseWiUIDFromFirstArg(logs[3])).toBe(2);

      // World names should be extractable
      expect(logs[0].match(patterns.worldNameRegex)[1]).toBe('Book1');
      expect(logs[2].match(patterns.worldNameRegex)[1]).toBe('Book2');
    });

    test('handles entries from same book with different UIDs', () => {
      const log1 = "[WI] Entry 10 from 'SharedBook' processing";
      const log2 = "[WI] Entry 20 from 'SharedBook' processing";

      expect(parseWiUIDFromFirstArg(log1)).toBe(10);
      expect(parseWiUIDFromFirstArg(log2)).toBe(20);
      expect(log1.match(patterns.worldNameRegex)[1]).toBe('SharedBook');
      expect(log2.match(patterns.worldNameRegex)[1]).toBe('SharedBook');
    });
  });

  describe('Scan boundary detection', () => {
    test('detects WI scan start', () => {
      const msg = '[WI] --- START WI SCAN ---';
      expect(msg.includes(patterns.scanStartPattern)).toBe(true);
    });

    test('detects dry run scan start', () => {
      const msg = '[WI] --- START WI SCAN (DRY RUN) ---';
      expect(msg.includes(patterns.scanStartPattern)).toBe(true);
      expect(msg.includes('(DRY RUN)')).toBe(true);
    });

    test('detects building prompt marker', () => {
      const msg = '--- BUILDING PROMPT ---';
      expect(msg.includes(patterns.buildPromptPattern)).toBe(true);
    });

    test('detects done marker', () => {
      const msg = '--- DONE ---';
      expect(msg.includes(patterns.donePattern)).toBe(true);
    });
  });
});
