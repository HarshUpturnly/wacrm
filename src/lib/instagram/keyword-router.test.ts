import { describe, expect, it } from 'vitest';
import { matchesInstagramKeyword, normalizeInstagramText } from './keyword-router';

describe('instagram keyword router', () => {
  it('normalizes whitespace and case for keyword matching', () => {
    expect(normalizeInstagramText('  HELLO   WORLD  ')).toBe('hello world');
  });

  it('matches contains keywords case-insensitively', () => {
    expect(matchesInstagramKeyword('I need help now', ['help'], 'contains')).toBe(true);
  });

  it('matches exact keywords when configured', () => {
    expect(matchesInstagramKeyword('pricing', ['price'], 'exact')).toBe(false);
    expect(matchesInstagramKeyword('price', ['price'], 'exact')).toBe(true);
  });

  it('matches whole words without partial substring matches', () => {
    expect(matchesInstagramKeyword('support team', ['support'], 'word')).toBe(true);
    expect(matchesInstagramKeyword('supporting team', ['support'], 'word')).toBe(false);
  });
});
