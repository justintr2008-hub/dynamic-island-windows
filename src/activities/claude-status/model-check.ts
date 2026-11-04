// Model check: when a Claude Code chat compacts, passes 500k tokens of context
// or ends, the model router's review (~/.claude/model-router/review.mjs) writes
// one JSON file per check into model-router/reviews: was each prompt on the
// right model, how much usage a cheaper one would have saved, how much more
// often a stronger one would have got it right. The Claude card lists the
// checks of the last two hours. Without the router there is no such folder and
// nothing shows.

import { native } from '../../core/native';
import type { Tone } from '../../core/segments';
import type { SheetRow } from '../../core/sheet';

/** A check stays in the card this long. */
export const KEEP_MS = 2 * 3600 * 1000;
/** At most this many show at once, newest first. */
export const MAX_SHOWN = 3;

export interface ModelCheck {
  /** The review's file name: unique and stable. */
  key: string;
  session: string;
  /** The chat's name. */
  title: string;
  /** One line, e.g. "↓ 7 too big: ~7% less usage (≈1.6M tokens) on Haiku". */
  line: string;
  /** The whole summary, as the terminal shows it. */
  text: string;
  /** good: the right model all along. warn: a better pick existed. */
  tone: Tone;
  /** "before compact", "context passed 500k" or "end of chat". */
  why: string;
  at: number;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** One review file, or null when it is not one. */
export function parseCheck(key: string, json: string): ModelCheck | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  const island = (j.island && typeof j.island === 'object' ? j.island : {}) as Record<string, unknown>;
  const line = str(island.line, 160);
  const at = Date.parse(String(j.at));
  if (!line || !Number.isFinite(at)) return null;
  return {
    key,
    session: str(j.session, 80),
    title: str(island.title, 80) || 'Claude session',
    line,
    text: typeof j.text === 'string' && j.text.trim() ? j.text.trim() : line,
    tone: island.tone === 'good' ? 'good' : 'warn',
    why: str(island.why, 40),
    at,
  };
}

/** "now", "12m", "1h 5m" */
export function since(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return 'now';
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Reads the reviews folder; a file is parsed again only when it changes. */
export class ModelChecks {
  private readonly cache = new Map<string, { mtime: number; check: ModelCheck }>();

  constructor(private readonly dir: string) {}

  /** The checks of the last two hours, newest first. */
  async poll(now: number): Promise<ModelCheck[]> {
    const files = await native.listFiles(this.dir, false, '.json', KEEP_MS);
    const out: ModelCheck[] = [];
    const seen = new Set<string>();
    for (const f of files) {
      if (f.dir || f.name.endsWith('.state.json')) continue;
      seen.add(f.name);
      let hit = this.cache.get(f.name);
      if (!hit || hit.mtime !== f.mtimeMs) {
        const text = await native.readText(f.path, 256 * 1024);
        const check = text === null ? null : parseCheck(f.name, text);
        // Half written (or not a check): try again next time.
        if (!check) continue;
        hit = { mtime: f.mtimeMs, check };
        this.cache.set(f.name, hit);
      }
      if (now - hit.check.at < KEEP_MS) out.push(hit.check);
    }
    for (const k of [...this.cache.keys()]) if (!seen.has(k)) this.cache.delete(k);
    return out.sort((a, b) => b.at - a.at);
  }
}

/**
 * The card's rows, newest first: the chat's name, the line, the whole summary
 * on hover. `rowFor` finds the chat's own row so a click switches to it.
 */
export function checkRows(checks: ModelCheck[], now: number, rowFor: (session: string) => string | null = () => null): SheetRow[] {
  return checks.slice(0, MAX_SHOWN).map((c) => {
    const row = c.session ? rowFor(c.session) : null;
    return {
      key: `check:${c.key}`,
      icon: c.tone === 'good' ? 'check' : 'info',
      tone: c.tone,
      title: `Model check · ${c.title}`,
      detail: c.line,
      badge: since(now - c.at),
      action: row ? 'jump' : undefined,
      arg: row ?? undefined,
      tip: c.text,
      button: { key: 'dismissCheck', icon: 'x', action: 'dismissCheck', arg: c.key, style: 'ghost', tip: 'Hide this check' },
    };
  });
}
