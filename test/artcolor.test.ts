import { describe, expect, it } from 'vitest';
import { pickColor } from '../src/core/artcolor';

const fill = (n: number, rgba: number[]) => Array.from({ length: n }, () => rgba).flat();

describe('pickColor', () => {
  it('gives a soft grey for a black-and-white cover', () => {
    expect(pickColor([...fill(500, [20, 20, 20, 255]), ...fill(500, [200, 200, 200, 255])])).toBe('rgb(176, 176, 176)');
  });

  it('picks the vivid hue over a dull background, lifted for a black pill', () => {
    const c = pickColor([...fill(800, [60, 55, 50, 255]), ...fill(200, [200, 150, 40, 255])]);
    const [r, g, b] = c.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b); // warm gold
    expect((r + g + b) / 3).toBeGreaterThan(120);
  });
});
