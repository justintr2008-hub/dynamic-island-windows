import { describe, expect, it } from 'vitest';
import { age, parseIsland, toneOf, type StatusRow } from '../src/activities/claude-status';

const row = (over: Partial<StatusRow> = {}): StatusRow => ({
  id: 'a',
  label: 'claude widget',
  where: 'Terminal',
  tag: 'TERMINAL',
  state: 'running',
  word: 'running',
  since: 0,
  grey: false,
  unread: false,
  hidden: false,
  progress: null,
  hwnd: 0,
  tabs: [],
  ...over,
});

describe('Claude Status', () => {
  it('reads the widget file and ignores junk', () => {
    const got = parseIsland(JSON.stringify({ version: 1, written: 100, sessions: [row(), null, { nope: 1 }] }));
    expect(got?.written).toBe(100_000);
    expect(got?.rows.map((r) => r.id)).toEqual(['a']);
    expect(parseIsland('not json')).toBeNull();
    expect(parseIsland(null)).toBeNull();
  });

  it("uses the widget's colours, and grey wins", () => {
    expect(toneOf(row())).toBe('info');
    expect(toneOf(row({ state: 'input' }))).toBe('warn');
    expect(toneOf(row({ state: 'done' }))).toBe('good');
    expect(toneOf(row({ state: 'failed' }))).toBe('bad');
    expect(toneOf(row({ state: 'done', grey: true }))).toBe('dim');
  });

  it('formats ages like the widget', () => {
    expect(age(42)).toBe('42s');
    expect(age(240)).toBe('4m');
    expect(age(3900)).toBe('1h 5m');
  });
});
