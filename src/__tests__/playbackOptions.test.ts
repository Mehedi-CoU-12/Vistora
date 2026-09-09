import {
  clampSeekTarget,
  describeTracks,
  formatRate,
  formatSeekDelta,
  nextScalingMode,
  resizeModeFor,
  SCALING_MODES,
  stepScalingMode,
} from '../player/playbackOptions';

describe('clampSeekTarget', () => {
  it('keeps a target inside the timeline', () => {
    expect(clampSeekTarget(50, 0, 100)).toBe(50);
    expect(clampSeekTarget(-30, 0, 100)).toBe(0);
  });

  // Seeking to exactly the duration ends playback, so a viewer holding FORWARD
  // would leave the film instead of arriving near the end of it.
  it('stops just short of the end', () => {
    expect(clampSeekTarget(100, 0, 100)).toBeLessThan(100);
    expect(clampSeekTarget(1e6, 0, 100)).toBeLessThan(100);
  });

  // A live stream's window does not start at zero, and `duration` is 0 or
  // Infinity until the first progress event arrives.
  it('respects a window that does not start at zero', () => {
    expect(clampSeekTarget(10, 60, 180)).toBe(60);
    expect(clampSeekTarget(120, 60, 180)).toBe(120);
  });

  it('survives the values a live stream actually produces', () => {
    expect(clampSeekTarget(10, 0, 0)).toBe(0);
    expect(clampSeekTarget(10, 0, NaN)).toBe(0);
    expect(clampSeekTarget(NaN, 0, 100)).toBe(0);
    expect(clampSeekTarget(10, 0, Infinity)).toBe(0);
  });
});

describe('scaling modes', () => {
  it('maps to the resizeMode react-native-video understands', () => {
    expect(resizeModeFor('fit')).toBe('contain');
    expect(resizeModeFor('fill')).toBe('cover');
    expect(resizeModeFor('stretch')).toBe('stretch');
  });

  it('cycles forwards and wraps', () => {
    expect(nextScalingMode('fit')).toBe('fill');
    expect(nextScalingMode('stretch')).toBe('fit');
  });

  // A pinch has to be reversible, or it is a two-finger button rather than a
  // control: spreading then pinching back must land where it started.
  it('is reversible in both directions', () => {
    for (const mode of SCALING_MODES) {
      expect(stepScalingMode(stepScalingMode(mode, 1), -1)).toBe(mode);
      expect(stepScalingMode(stepScalingMode(mode, -1), 1)).toBe(mode);
    }
  });
});

describe('formatRate', () => {
  it('drops trailing zeros', () => {
    expect(formatRate(1)).toBe('1x');
    expect(formatRate(1.5)).toBe('1.5x');
    expect(formatRate(0.25)).toBe('0.25x');
  });
});

describe('formatSeekDelta', () => {
  it('always carries a sign, because the number alone is ambiguous', () => {
    expect(formatSeekDelta(10)).toBe('+10s');
    expect(formatSeekDelta(-10)).toBe('-10s');
    expect(formatSeekDelta(0)).toBe('+0s');
  });

  it('switches to minutes once a chain of skips gets long', () => {
    expect(formatSeekDelta(90)).toBe('+1:30');
    expect(formatSeekDelta(-605)).toBe('-10:05');
  });
});

describe('describeTracks', () => {
  it('prefers the title the stream gives', () => {
    expect(describeTracks([{index: 0, title: 'Commentary', language: 'en'}])).toEqual([
      {index: 0, label: 'Commentary'},
    ]);
  });

  it('falls back to the language code, then to a 1-based ordinal', () => {
    expect(
      describeTracks([
        {index: 0, language: 'en'},
        {index: 1},
      ]),
    ).toEqual([
      {index: 0, label: 'EN'},
      {index: 1, label: 'Track 2'},
    ]);
  });

  // Media3 numbers tracks from zero and does not promise they are contiguous,
  // so the label counts positions while the value keeps the real index.
  it('labels by position but selects by index', () => {
    expect(describeTracks([{index: 3}, {index: 7}])).toEqual([
      {index: 3, label: 'Track 1'},
      {index: 7, label: 'Track 2'},
    ]);
  });

  it('ignores whitespace-only metadata', () => {
    expect(describeTracks([{index: 0, title: '   ', language: '  '}])).toEqual([
      {index: 0, label: 'Track 1'},
    ]);
  });
});
