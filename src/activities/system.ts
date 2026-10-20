// System stats: CPU, memory and GPU. Quiet until something spikes, unless
// "Always show" is on.

import type { PetSignal } from '../core/pet';
import type { ActivityStatus, ChipView, RenderEnv, SheetEnv } from '../core/activity';
import { bytes } from '../core/format';
import { native, type SysSample } from '../core/native';
import type { Seg } from '../core/segments';
import type { Block, SheetView, Tile } from '../core/sheet';
import { BaseActivity } from './base';

type Stat = 'cpu' | 'mem' | 'gpu';
type Options = { always: boolean; hoverCard: boolean; order: Stat[]; expanded: Set<Stat>; cpuSpike: number; memSpike: number };
type Pick = { key: Stat; label: string; icon: 'cpu' | 'memory' | 'gpu'; pct: number };

const STATS: Record<Stat, { label: string; icon: Pick['icon'] }> = {
  cpu: { label: 'CPU', icon: 'cpu' },
  mem: { label: 'RAM', icon: 'memory' },
  gpu: { label: 'GPU', icon: 'gpu' },
};

/** "mem,cpu,gpu" from settings, with anything missing or unknown fixed up. */
function parseOrder(raw: unknown): Stat[] {
  const seen = String(raw ?? '').split(',').filter((k): k is Stat => k in STATS);
  return [...new Set([...seen, 'cpu', 'mem', 'gpu'] as Stat[])];
}

const SLOW_MS = 5000;
const FAST_MS = 2000;
const SPIKE_MS = 6000;
/** Samples in a row at or above the threshold before it counts as a spike. */
const SPIKE_SAMPLES = 3;

export class SystemActivity extends BaseActivity {
  private s: SysSample | null = null;
  private lastAt = 0;
  private busy = false;
  private streak = 0;
  private spiking = false;
  private memHigh = false;
  private event: { kind: 'cpu' | 'mem'; at: number } | null = null;

  constructor() {
    super('system');
  }

  protected init(): void {
    // One 1 s clock; the sampling interval (5 s, or 2 s when it matters) is decided per tick.
    this.every(1000, () => void this.tick(), true);
  }

  private opts(): Options {
    const o = this.ctx.options<Record<string, unknown>>();
    const set = (cpu: unknown, mem: unknown, gpu: unknown) =>
      new Set<Stat>([cpu ? 'cpu' : null, mem ? 'mem' : null, gpu ? 'gpu' : null].filter((k): k is Stat => k !== null));
    return {
      always: o.always === true,
      hoverCard: o.hoverCard !== false,
      order: parseOrder(o.order),
      expanded: set(o.expandedCpu !== false, o.expandedRam !== false, o.expandedGpu !== false),
      cpuSpike: Number(o.cpuSpike) || 90,
      memSpike: Number(o.memSpike) || 92,
    };
  }

  /** The small island has room for one stat: the top of the priority list this PC can measure. */
  private top(s: SysSample, order: Stat[]): Pick {
    return this.picks(s, new Set(order), order)[0];
  }

  /** The chosen stats in priority order; nothing chosen (or only a missing GPU) means CPU. */
  private picks(s: SysSample, chosen: Set<Stat>, order: Stat[]): Pick[] {
    const pct: Record<Stat, number | null> = { cpu: Math.round(s.cpu), mem: this.memPct(s), gpu: s.gpu === null ? null : Math.round(s.gpu) };
    const out = order.filter((k) => chosen.has(k) && pct[k] !== null).map((k) => ({ key: k, ...STATS[k], pct: pct[k]! }));
    return out.length ? out : [{ key: 'cpu', ...STATS.cpu, pct: pct.cpu! }];
  }

  private async tick(): Promise<void> {
    const o = this.opts();
    const every = o.always || this.streak > 0 || this.spiking ? FAST_MS : SLOW_MS;
    if (this.busy || Date.now() - this.lastAt < every - 50) return;
    this.busy = true;
    // The busiest process needs two readings to compare, so ask for it as soon as the CPU runs hot.
    const s = await native.sysSample(this.streak > 0 || this.spiking);
    this.busy = false;
    if (!s || !this.alive) return;
    this.lastAt = Date.now();
    this.s = s;

    const hot = s.cpu >= o.cpuSpike || (this.spiking && s.cpu >= o.cpuSpike - 10);
    this.streak = hot ? this.streak + 1 : 0;
    if (!hot) this.spiking = false;
    else if (this.streak >= SPIKE_SAMPLES && !this.spiking) {
      this.spiking = true;
      this.announce('cpu');
    }

    const mem = s.memTotal > 0 ? (s.memUsed / s.memTotal) * 100 : 0;
    if (mem >= o.memSpike && !this.memHigh) {
      this.memHigh = true;
      this.announce('mem');
    } else if (mem < o.memSpike - 3) this.memHigh = false;
    this.ctx.update();
  }

  private announce(kind: 'cpu' | 'mem'): void {
    this.event = { kind, at: Date.now() };
    this.ctx.surface({ key: kind, ms: SPIKE_MS, level: 'expanded' });
    this.saw(kind === 'cpu' ? 'cpu-spike' : 'ram-spike', `system:${kind}`);
  }

  /** The CPU running hot: the bot overheats (memory can stay high for hours, so it does not count). */
  override pet(): PetSignal {
    return { mood: this.spiking ? 'overheated' : null, moment: this.petMoment };
  }

  private spike(now: number): 'cpu' | 'mem' | null {
    return this.event && now - this.event.at < SPIKE_MS ? this.event.kind : null;
  }

  status(): ActivityStatus {
    const s = this.s;
    if (!s) return { active: false };
    const kind = this.spike(Date.now());
    if (!kind && !this.opts().always) return { active: false };
    return {
      active: true,
      weight: kind ? 'foreground' : 'background',
      summary: kind === 'mem' ? `RAM ${this.memPct(s)}%` : `CPU ${Math.round(s.cpu)}%`,
    };
  }

  /** Beside another activity: the top priority stat, number included even on the small island. */
  chip(): ChipView | null {
    const s = this.s;
    if (!s) return null;
    const top = this.top(s, this.opts().order);
    return { icon: top.icon, label: `${top.pct}%`, tone: this.spike(Date.now()) ? 'bad' : 'muted', keepLabel: true };
  }

  private memPct(s: SysSample): number {
    return s.memTotal > 0 ? Math.round((s.memUsed / s.memTotal) * 100) : 0;
  }

  /** Pointing at it: a card grows out of the pill with a bar per stat, like now playing and Claude. */
  sheet(env: SheetEnv): SheetView | null {
    const s = this.s;
    const o = this.opts();
    if (env.reason !== 'hover' || !s || !o.hoverCard || !this.status().active) return null;
    const warn: Record<Stat, number> = { cpu: o.cpuSpike, mem: o.memSpike, gpu: 101 };
    const sub: Record<Stat, string | undefined> = {
      cpu: s.top ? `${s.top.name} ${Math.round(s.top.cpu)}%` : undefined,
      mem: `${bytes(s.memUsed)} of ${bytes(s.memTotal)}`,
      gpu: undefined,
    };
    // The card is the expanded view's stats, as bars.
    const picks = this.picks(s, o.expanded, o.order);
    const blocks: Block[] = [
      { t: 'head', key: 'head', icon: picks[0].icon, tone: 'accent', title: 'System' },
      ...picks.map((p): Block => ({
        t: 'meter', key: p.key, label: p.label, value: p.pct / 100, pace: null, text: `${p.pct}%`, sub: sub[p.key], tone: p.pct >= warn[p.key] ? 'bad' : 'accent',
      })),
    ];
    return { key: 'system', blocks, merge: true };
  }

  /** CPU as the number, memory underneath; red while the CPU is past the spike threshold. */
  tile(): Tile | null {
    const s = this.s;
    if (!s) return null;
    const cpu = Math.round(s.cpu);
    return {
      key: 'cpu',
      tone: cpu >= this.opts().cpuSpike ? 'bad' : undefined,
      body: { k: 'stat', icon: 'cpu', label: 'CPU', value: `${cpu}%`, sub: `RAM ${this.memPct(s)}%`, progress: Math.min(1, Math.max(0, cpu / 100)) },
    };
  }

  render(env: RenderEnv): Seg[] {
    const s = this.s;
    if (!s) return [];
    const compact = env.level === 'compact' || env.level === 'idle';
    const kind = this.spike(env.now);
    const cpu = Math.round(s.cpu);
    const mem = this.memPct(s);
    const o = this.opts();

    if (kind) {
      const isMem = kind === 'mem';
      const segs: Seg[] = [
        { t: 'icon', key: 'icon', icon: isMem ? 'memory' : 'cpu', tone: 'bad', anim: 'pulse', prio: 0 },
        { t: 'text', key: 'main', text: env.vertical ? `${isMem ? mem : cpu}%` : isMem ? `RAM ${mem}%` : `CPU ${cpu}%`, tone: 'bad', weight: 'semibold', prio: 0 },
      ];
      if (!compact && !env.vertical) {
        const detail = isMem ? `${bytes(s.memUsed)} of ${bytes(s.memTotal)}` : s.top ? `${s.top.name} ${Math.round(s.top.cpu)}%` : '';
        if (detail) segs.push({ t: 'text', key: 'detail', text: detail, tone: 'muted', prio: 3 });
      }
      return segs;
    }

    const picks = compact ? [this.top(s, o.order)] : this.picks(s, o.expanded, o.order);
    const icon: Seg = { t: 'icon', key: 'icon', icon: picks[0].icon, tone: 'accent', prio: 0 };

    if (env.level === 'maximum') {
      const warn: Record<Stat, number> = { cpu: o.cpuSpike, mem: o.memSpike, gpu: 101 };
      return [icon, ...picks.map((p, i): Seg => ({
        t: 'meter', key: p.key, label: p.label, value: p.pct / 100, pace: null, text: `${p.pct}%`, tone: p.pct >= warn[p.key] ? 'bad' : 'accent', w: 120, prio: i,
      }))];
    }

    // Compact and expanded: the first pick leads, the rest follow in grey. Vertical has room for one number only.
    return [icon, ...(env.vertical ? picks.slice(0, 1) : picks).map((p, i): Seg => ({
      t: 'text', key: p.key, text: env.vertical ? `${p.pct}%` : `${p.label} ${p.pct}%`, weight: i === 0 ? 'semibold' : undefined, tone: i === 0 ? undefined : 'muted', prio: i === 0 ? 0 : i + 2,
    }))];
  }
}
