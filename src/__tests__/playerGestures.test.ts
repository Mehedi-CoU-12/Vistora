import {
  dragAxisFor,
  swipeSeekSeconds,
  SWIPE_SEEK_WINDOW_SECONDS,
  tapZoneFor,
  verticalDragFraction,
} from '../player/usePlayerGestures';

describe('tapZoneFor', () => {
  it('splits the screen into skip-back, play/pause and skip-forward', () => {
    expect(tapZoneFor(20, 400)).toBe('left');
    expect(tapZoneFor(200, 400)).toBe('centre');
    expect(tapZoneFor(380, 400)).toBe('right');
  });

  // The gesture layer reports its width through onLayout, so the first touch can
  // arrive before any width is known. Guessing "left" would skip backwards on a
  // tap that was meant to show the controls.
  it('is centre when the width is not known yet', () => {
    expect(tapZoneFor(0, 0)).toBe('centre');
  });
});

describe('dragAxisFor', () => {
  it('gives the dominant axis the gesture', () => {
    expect(dragAxisFor(40, 5, 200, 400)).toBe('seek');
    expect(dragAxisFor(5, 40, 300, 400)).toBe('volume');
  });

  it('splits volume and brightness down the middle', () => {
    expect(dragAxisFor(0, -40, 50, 400)).toBe('brightness');
    expect(dragAxisFor(0, -40, 350, 400)).toBe('volume');
  });

  // Which half the finger STARTED in decides, not where it is now: a vertical
  // swipe that drifts across the middle must not switch from brightness to
  // volume halfway through.
  it('decides from the starting half, not the current position', () => {
    // Started at x=50, has drifted 150dp right and is now past the middle of a
    // 400dp screen -- still brightness, because that is where it began.
    expect(dragAxisFor(150, -260, 50, 400)).toBe('brightness');
    expect(dragAxisFor(-150, -260, 350, 400)).toBe('volume');
  });
});

describe('swipeSeekSeconds', () => {
  it('maps a full-width swipe to the fixed window', () => {
    expect(swipeSeekSeconds(400, 400)).toBe(SWIPE_SEEK_WINDOW_SECONDS);
    expect(swipeSeekSeconds(-200, 400)).toBe(-SWIPE_SEEK_WINDOW_SECONDS / 2);
  });

  it('is a no-op before the layer has been measured', () => {
    expect(swipeSeekSeconds(120, 0)).toBe(0);
  });
});

describe('verticalDragFraction', () => {
  // Screen coordinates grow downwards; volume does not.
  it('treats upward travel as an increase', () => {
    expect(verticalDragFraction(-60, 200)).toBeGreaterThan(0);
    expect(verticalDragFraction(60, 200)).toBeLessThan(0);
  });

  it('reaches full range in less than the full height', () => {
    expect(verticalDragFraction(-200, 200)).toBeGreaterThan(1);
  });

  it('is a no-op before the layer has been measured', () => {
    expect(verticalDragFraction(-60, 0)).toBe(0);
  });
});
