import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/core/native', async () => await import('./fake-native'));

import { checkRows, KEEP_MS, MAX_SHOWN, ModelChecks, parseCheck, since } from '../src/activities/claude-status/model-check';

/** A review file as ~/.claude/model-router/review.mjs writes it. */
const review = (over: Record<string, unknown> = {}, island: Record<string, unknown> = {}) =>
  JSON.stringify({
    session: '0cf8e1fe-ffad-428d-b938-30a5aff6d67f',
    trigger: 'compact',
    title: 'Dynamic island parallel session workflow',
    at: new Date(Date.now() - 5 * 60000).toISOString(),
    island: { title: 'Dynamic island parallel session workflow', line: '↓ 7 too big: ~7% less usage (≈1.6M tokens) on Haiku', tone: 'warn', why: 'before compact', ...island },
    text: 'Model check (before compact) · 28 prompts\n✓ Right model for 21 of 28.',
    ...over,
  });

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'model-check-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('Model check: reading a review', () => {
  it('reads the line, tone, name and full text', () => {
    const c = parseCheck('a.json', review());
    expect(c).toMatchObject({
      key: 'a.json',
      session: '0cf8e1fe-ffad-428d-b938-30a5aff6d67f',
      title: 'Dynamic island parallel session workflow',
      line: '↓ 7 too big: ~7% less usage (≈1.6M tokens) on Haiku',
      tone: 'warn',
      why: 'before compact',
    });
    expect(c?.text).toContain('28 prompts');
  });

  it('a right-model check is green; anything else is a warning', () => {
    expect(parseCheck('a.json', review({}, { tone: 'good' }))?.tone).toBe('good');
    expect(parseCheck('a.json', review({}, { tone: 'bad' }))?.tone).toBe('warn');
  });

  it('a chat without a name is "Claude session"', () => {
    expect(parseCheck('a.json', review({}, { title: '' }))?.title).toBe('Claude session');
  });

  it('ignores what is not a check: broken JSON, no line, no time', () => {
    expect(parseCheck('a.json', '{"island":')).toBeNull();
    expect(parseCheck('a.json', 'null')).toBeNull();
    expect(parseCheck('a.json', review({}, { line: '' }))).toBeNull();
    expect(parseCheck('a.json', review({ at: 'never' }))).toBeNull();
    expect(parseCheck('a.json', JSON.stringify({ offset: 120, over: false }))).toBeNull();
  });

  it('says how long ago without ticking seconds', () => {
    expect(since(30_000)).toBe('now');
    expect(since(12 * 60000)).toBe('12m');
    expect(since(65 * 60000)).toBe('1h 5m');
  });
});

describe('Model check: the reviews folder', () => {
  it('lists the checks of the last two hours, newest first, and skips state files', async () => {
    const dir = tmp();
    const now = Date.now();
    fs.writeFileSync(path.join(dir, 'old.json'), review({ at: new Date(now - KEEP_MS - 60000).toISOString() }));
    fs.writeFileSync(path.join(dir, 'a.json'), review({ at: new Date(now - 20 * 60000).toISOString() }));
    fs.writeFileSync(path.join(dir, 'b.json'), review({ at: new Date(now - 60000).toISOString() }, { tone: 'good' }));
    fs.writeFileSync(path.join(dir, 'x.state.json'), JSON.stringify({ offset: 10, over: false }));
    fs.writeFileSync(path.join(dir, 'review.log'), 'not json');
    const checks = await new ModelChecks(dir).poll(now);
    expect(checks.map((c) => c.key)).toEqual(['b.json', 'a.json']);
  });

  it('a half-written file shows once it is complete', async () => {
    const dir = tmp();
    const file = path.join(dir, 'a.json');
    const mc = new ModelChecks(dir);
    fs.writeFileSync(file, review().slice(0, 40));
    expect(await mc.poll(Date.now())).toEqual([]);
    fs.writeFileSync(file, review());
    expect((await mc.poll(Date.now())).map((c) => c.key)).toEqual(['a.json']);
  });

  it('a missing folder is no checks, not an error', async () => {
    expect(await new ModelChecks(path.join(tmp(), 'nope')).poll(Date.now())).toEqual([]);
  });
});

describe('Model check: the card rows', () => {
  const now = Date.now();
  const checks = Array.from({ length: 5 }, (_, i) => parseCheck(`${i}.json`, review({ at: new Date(now - i * 60000).toISOString() }))!);

  it('shows the newest few with the chat name, the line, and the whole summary on hover', () => {
    const rows = checkRows(checks, now);
    expect(rows).toHaveLength(MAX_SHOWN);
    expect(rows[0]).toMatchObject({
      key: 'check:0.json',
      title: 'Model check · Dynamic island parallel session workflow',
      detail: '↓ 7 too big: ~7% less usage (≈1.6M tokens) on Haiku',
      tone: 'warn',
      badge: 'now',
      button: { action: 'dismissCheck', arg: '0.json' },
    });
    expect(rows[0].tip).toContain('28 prompts');
  });

  it('a click switches to the chat while it still has a row', () => {
    const [live] = checkRows(checks, now, (s) => (s.startsWith('0cf8e1fe') ? 'row-1' : null));
    expect(live).toMatchObject({ action: 'jump', arg: 'row-1' });
    const [gone] = checkRows(checks, now);
    expect(gone.action).toBeUndefined();
  });
});
