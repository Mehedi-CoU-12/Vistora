import {
  clampSeekTarget,
  describeTracks,
  hasSeekLanded,
  formatRate,
  formatSeekDelta,
  nextScalingMode,
  resizeModeFor,
  SCALING_MODES,
  stepScalingMode,
  timeForTrackX,
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

describe('timeForTrackX', () => {
  const track = { pageX: 100, width: 800 };
  const timeline = { start: 0, end: 600 };

  it('maps a position along the track to a time', () => {
    expect(timeForTrackX(100, track, timeline)).toBeCloseTo(0);
    expect(timeForTrackX(500, track, timeline)).toBeCloseTo(300);
    expect(timeForTrackX(900, track, timeline)).toBeLessThan(600);
    expect(timeForTrackX(900, track, timeline)).toBeGreaterThan(599);
  });

  it('respects the track offset rather than assuming it starts at zero', () => {
    expect(timeForTrackX(500, { pageX: 0, width: 800 }, timeline)).toBeCloseTo(
      375,
    );
  });

  it('clamps a finger that has left the bar', () => {
    expect(timeForTrackX(-500, track, timeline)).toBe(0);
    expect(timeForTrackX(5000, track, timeline)).toBeLessThan(600);
  });

  // This is the bug the null return exists for. The old code answered "the
  // start of the timeline" when it had no measurement, which is exactly what a
  // deliberate jump to the beginning looks like -- so an unmeasured bar threw
  // the viewer back to 0, which is what "it jumps to the start" was.
  it('answers null rather than the start when it cannot know', () => {
    expect(timeForTrackX(500, { pageX: 100, width: 0 }, timeline)).toBeNull();
    expect(timeForTrackX(500, track, { start: 0, end: 0 })).toBeNull();
    expect(timeForTrackX(500, track, { start: 90, end: 30 })).toBeNull();
    expect(timeForTrackX(NaN, track, timeline)).toBeNull();
  });

  // A live DVR window does not start at zero.
  it('maps within a window that starts late', () => {
    expect(
      timeForTrackX(500, track, { start: 300, end: 900 }),
    ).toBeCloseTo(600);
  });
});

describe('hasSeekLanded', () => {
  // The bar is held at the target until this says yes. Both of the events that
  // report a seek can carry a position from before the jump, and acting on one
  // was what made the scrub bar flick backwards after a drag.
  it('accepts a position near the target', () => {
    expect(hasSeekLanded(60, 60)).toBe(true);
    expect(hasSeekLanded(59.4, 60)).toBe(true);
    expect(hasSeekLanded(61, 60)).toBe(true);
  });

  it('rejects the stale position an in-flight seek reports', () => {
    expect(hasSeekLanded(12, 60)).toBe(false);
    expect(hasSeekLanded(60, 12)).toBe(false);
  });

  it('honours a caller-supplied tolerance', () => {
    expect(hasSeekLanded(57, 60, 5)).toBe(true);
    expect(hasSeekLanded(57, 60, 1)).toBe(false);
  });

  // Never leave the readout pinned to a target because of a bad number: a
  // frozen bar over playing video is worse than one that moves early.
  it('gives up on values it cannot compare', () => {
    expect(hasSeekLanded(NaN, 60)).toBe(true);
    expect(hasSeekLanded(60, Infinity)).toBe(true);
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
