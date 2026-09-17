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

  it('decides from the starting half, not the current position', () => {
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

  it('honours the window the swipe-seek setting asks for', () => {
    expect(swipeSeekSeconds(400, 400, 45)).toBe(45);
    expect(swipeSeekSeconds(400, 400, 900)).toBe(900);
    expect(swipeSeekSeconds(200, 400, 900)).toBe(450);
  });
});

describe('verticalDragFraction', () => {
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
