import {
  clampSeekTarget,
  describeTracks,
  describeVideoTracks,
  formatBitrate,
  formatCountdown,
  formatRate,
  formatSeekDelta,
  formatSkipStep,
  hasSeekLanded,
  nextScalingMode,
  resizeModeFor,
  SCALING_MODES,
  SEEK_GESTURE_SPEEDS,
  SEEK_GESTURE_WINDOW_SECONDS,
  sleepTimerLabel,
  stepScalingMode,
  timeForTrackX,
} from '../player/playbackOptions';

describe('clampSeekTarget', () => {
  it('keeps a target inside the timeline', () => {
    expect(clampSeekTarget(50, 0, 100)).toBe(50);
    expect(clampSeekTarget(-30, 0, 100)).toBe(0);
  });

  it('stops just short of the end', () => {
    expect(clampSeekTarget(100, 0, 100)).toBeLessThan(100);
    expect(clampSeekTarget(1e6, 0, 100)).toBeLessThan(100);
  });

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

  it('answers null rather than the start when it cannot know', () => {
    expect(timeForTrackX(500, { pageX: 100, width: 0 }, timeline)).toBeNull();
    expect(timeForTrackX(500, track, { start: 0, end: 0 })).toBeNull();
    expect(timeForTrackX(500, track, { start: 90, end: 30 })).toBeNull();
    expect(timeForTrackX(NaN, track, timeline)).toBeNull();
  });

  it('maps within a window that starts late', () => {
    expect(timeForTrackX(500, track, { start: 300, end: 900 })).toBeCloseTo(
      600,
    );
  });
});

describe('hasSeekLanded', () => {
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
    expect(resizeModeFor('native')).toBe('none');
  });

  it('cycles forwards and wraps', () => {
    expect(nextScalingMode('fit')).toBe('fill');
    expect(nextScalingMode('stretch')).toBe('native');
    expect(nextScalingMode('native')).toBe('fit');
  });

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
    expect(
      describeTracks([{ index: 0, title: 'Commentary', language: 'en' }]),
    ).toEqual([{ index: 0, label: 'Commentary' }]);
  });

  it('falls back to the language code, then to a 1-based ordinal', () => {
    expect(
      describeTracks([{ index: 0, language: 'en' }, { index: 1 }]),
    ).toEqual([
      { index: 0, label: 'EN' },
      { index: 1, label: 'Track 2' },
    ]);
  });

  it('labels by position but selects by index', () => {
    expect(describeTracks([{ index: 3 }, { index: 7 }])).toEqual([
      { index: 3, label: 'Track 1' },
      { index: 7, label: 'Track 2' },
    ]);
  });

  it('ignores whitespace-only metadata', () => {
    expect(
      describeTracks([{ index: 0, title: '   ', language: '  ' }]),
    ).toEqual([{ index: 0, label: 'Track 1' }]);
  });
});


describe('swipe seek speeds', () => {
  it('gets longer with every step up', () => {
    const windows = SEEK_GESTURE_SPEEDS.map(
      speed => SEEK_GESTURE_WINDOW_SECONDS[speed],
    );

    expect(windows).toEqual([...windows].sort((a, b) => a - b));
    expect(new Set(windows).size).toBe(windows.length);
  });
});

describe('formatSkipStep', () => {
  it('stays in seconds below a minute', () => {
    expect(formatSkipStep(5)).toBe('5s');
    expect(formatSkipStep(30)).toBe('30s');
  });

  it('switches to minutes on the minute', () => {
    expect(formatSkipStep(60)).toBe('1m');
    expect(formatSkipStep(90)).toBe('90s');
  });
});

describe('sleepTimerLabel', () => {
  it('names the off position rather than showing a zero', () => {
    expect(sleepTimerLabel(0)).toBe('Off');
    expect(sleepTimerLabel(-5)).toBe('Off');
  });

  it('reads whole hours as hours', () => {
    expect(sleepTimerLabel(45)).toBe('45m');
    expect(sleepTimerLabel(60)).toBe('1h');
  });
});

describe('formatCountdown', () => {
  it('rounds up, so the last second is shown rather than skipped', () => {
    expect(formatCountdown(9400)).toBe('10');
    expect(formatCountdown(1)).toBe('1');
    expect(formatCountdown(0)).toBe('0');
  });

  it('never goes negative once the deadline has passed', () => {
    expect(formatCountdown(-500)).toBe('0');
  });
});

describe('formatBitrate', () => {
  it('switches unit at a megabit', () => {
    expect(formatBitrate(850_000)).toBe('850 kbps');
    expect(formatBitrate(2_400_000)).toBe('2.4 Mbps');
  });

  it('says nothing when the stream reported nothing usable', () => {
    expect(formatBitrate(0)).toBeUndefined();
    expect(formatBitrate(undefined)).toBeUndefined();
    expect(formatBitrate(NaN)).toBeUndefined();
  });
});

describe('describeVideoTracks', () => {
  it('lists the sharpest first, whatever order the stream gave', () => {
    expect(
      describeVideoTracks([
        { index: 0, height: 480 },
        { index: 1, height: 1080 },
        { index: 2, height: 720 },
      ]).map(track => track.label),
    ).toEqual(['1080p', '720p', '480p']);
  });

  it('keeps the stream index for selection, not the display order', () => {
    expect(describeVideoTracks([{ index: 4, height: 360 }])).toEqual([
      { index: 4, label: '360p', detail: undefined },
    ]);
  });

  it('carries the bitrate as a detail line', () => {
    expect(
      describeVideoTracks([{ index: 0, height: 1080, bitrate: 5_000_000 }]),
    ).toEqual([{ index: 0, label: '1080p', detail: '5 Mbps' }]);
  });

  it('falls back to the bitrate when there is no height to name', () => {
    expect(describeVideoTracks([{ index: 0, bitrate: 128_000 }])).toEqual([
      { index: 0, label: '128 kbps', detail: '128 kbps' },
    ]);
  });

  it('drops tracks that describe neither size nor bitrate', () => {
    expect(describeVideoTracks([{ index: 0 }, { index: 1, height: 0 }])).toEqual(
      [],
    );
  });

  it('separates two tracks that share a height', () => {
    expect(
      describeVideoTracks([
        { index: 0, height: 1080, bitrate: 3_000_000 },
        { index: 1, height: 1080, bitrate: 8_000_000 },
      ]),
    ).toEqual([
      { index: 1, label: '1080p', detail: '8 Mbps' },
      { index: 0, label: '1080p', detail: '3 Mbps' },
    ]);
  });
});
