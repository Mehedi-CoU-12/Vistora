import { linearGradient } from '../components/Gradient';

/**
 * The gradient is a CSS `linear-gradient` string handed to the platform, which
 * means its correctness is arithmetic rather than something you look at -- and
 * the failure modes are exactly the ones the eye is worst at catching on a
 * near-black ramp: a fade that never quite reaches the page colour and leaves a
 * seam under the hero, or one whose middle drifts off the line between its two
 * ends and puts a grey haze over a photograph.
 */

interface Stop {
  r: number;
  g: number;
  b: number;
  a: number;
  position: number;
}

/** Pulls `rgba(...) NN.NN%` pairs back out of the generated declaration. */
function stopsOf(declaration: string): Stop[] {
  const inner = declaration.match(/^linear-gradient\((.*)\)$/)?.[1];
  if (inner === undefined) {
    throw new Error(`not a linear-gradient: ${declaration}`);
  }

  return [
    ...inner.matchAll(
      /rgba\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\) ([\d.]+)%/g,
    ),
  ].map(match => ({
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: Number(match[4]),
    position: Number(match[5]),
  }));
}

function directionOf(declaration: string): string {
  return declaration.match(/^linear-gradient\(([^,]+),/)?.[1] ?? '';
}

const PAGE = 'rgba(11, 13, 20, 1)';
const CLEAR = 'rgba(11, 13, 20, 0)';

describe('linearGradient', () => {
  it('emits a CSS declaration the platform can parse', () => {
    expect(linearGradient([CLEAR, PAGE], 'down', 'linear')).toMatch(
      /^linear-gradient\(to bottom, rgba\(.+\) 0\.00%, rgba\(.+\) 100\.00%\)$/,
    );
  });

  it('maps every direction to its CSS keyword', () => {
    expect(directionOf(linearGradient([CLEAR, PAGE], 'down', 'linear'))).toBe(
      'to bottom',
    );
    expect(directionOf(linearGradient([CLEAR, PAGE], 'up', 'linear'))).toBe(
      'to top',
    );
    expect(directionOf(linearGradient([CLEAR, PAGE], 'right', 'linear'))).toBe(
      'to right',
    );
    expect(directionOf(linearGradient([CLEAR, PAGE], 'left', 'linear'))).toBe(
      'to left',
    );
  });

  /**
   * The hero's bottom fade has to arrive at fully opaque page colour, or there
   * is a visible seam between the artwork and the rail beneath it -- which is
   * the entire thing the fade exists to remove.
   */
  it('runs from the first colour to the last', () => {
    for (const easing of ['linear', 'ease'] as const) {
      const stops = stopsOf(linearGradient([CLEAR, PAGE], 'down', easing));

      expect(stops[0].a).toBeCloseTo(0, 3);
      expect(stops[0].position).toBe(0);
      expect(stops[stops.length - 1].a).toBeCloseTo(1, 3);
      expect(stops[stops.length - 1].position).toBe(100);
    }
  });

  it('places its stops in increasing order', () => {
    for (const easing of ['linear', 'ease'] as const) {
      const positions = stopsOf(
        linearGradient([CLEAR, PAGE], 'down', easing),
      ).map(stop => stop.position);

      for (let index = 1; index < positions.length; index += 1) {
        expect(positions[index]).toBeGreaterThan(positions[index - 1]);
      }
    }
  });

  it('increases in alpha monotonically', () => {
    for (const easing of ['linear', 'ease'] as const) {
      const alphas = stopsOf(linearGradient([CLEAR, PAGE], 'down', easing)).map(
        stop => stop.a,
      );

      for (let index = 1; index < alphas.length; index += 1) {
        expect(alphas[index]).toBeGreaterThanOrEqual(alphas[index - 1]);
      }
    }
  });

  /**
   * The reason `mix` interpolates RGB alongside alpha instead of premultiplying,
   * and the reason the palette exposes `backgroundAlpha` rather than letting
   * call sites write `'transparent'`: a ramp whose two ends are the same colour
   * at different alphas must not wander in hue, or the middle of every hero fade
   * is a band of a slightly different dark.
   */
  it('holds its hue when only the alpha changes', () => {
    for (const stop of stopsOf(linearGradient([CLEAR, PAGE], 'down', 'ease'))) {
      expect([stop.r, stop.g, stop.b]).toEqual([11, 13, 20]);
    }
  });

  /**
   * The whole reason `ease` is the default. A linear alpha ramp over a
   * photograph appears to clear too early and then linger as a haze; bending the
   * curve holds the scrim dense where the text sits and clears it faster across
   * the picture.
   */
  it('eases by staying clearer than linear at the same position', () => {
    const eased = stopsOf(linearGradient([CLEAR, PAGE], 'down', 'ease'));

    for (const stop of eased) {
      // A linear ramp's alpha at position p IS p. Squaring can only lower it,
      // and must lower it strictly somewhere in the middle.
      expect(stop.a).toBeLessThanOrEqual(stop.position / 100 + 1e-9);
    }

    const middle = eased[Math.floor(eased.length / 2)];
    expect(middle.a).toBeLessThan(middle.position / 100);
  });

  it('walks a three-stop ramp through its middle colour', () => {
    const stops = stopsOf(
      linearGradient(
        ['rgba(0, 0, 0, 0)', 'rgba(255, 255, 255, 1)', 'rgba(0, 0, 0, 1)'],
        'down',
        'linear',
      ),
    );

    expect(stops).toHaveLength(3);
    expect(stops[1].r).toBe(255);
    expect(stops[1].position).toBeCloseTo(50, 1);
  });

  it('reads the hex forms the palette is written in', () => {
    expect(
      stopsOf(linearGradient(['#0B0D14', '#38BDF8'], 'right', 'linear'))[1],
    ).toMatchObject({ r: 56, g: 189, b: 248, a: 1 });
    expect(
      stopsOf(linearGradient(['#01A', '#3BF'], 'right', 'linear'))[1],
    ).toMatchObject({ r: 51, g: 187, b: 255 });
  });

  /**
   * A mistyped colour should be a gradient that visibly does nothing, not a
   * screen that fails to render -- this runs behind every hero in the app.
   */
  it('degrades an unparseable colour to transparent instead of throwing', () => {
    expect(() =>
      linearGradient(['not-a-colour', PAGE], 'down', 'ease'),
    ).not.toThrow();
    expect(
      stopsOf(linearGradient(['not-a-colour', PAGE], 'down', 'linear'))[0].a,
    ).toBe(0);
  });
});
