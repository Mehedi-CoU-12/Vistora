import {formatTime} from '../player/formatTime';

describe('formatTime', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(599)).toBe('9:59');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3723)).toBe('1:02:03');
  });

  // The player calls this with `duration` straight from onLoad, which is NaN
  // for a live stream and -1 on some Media3 error paths. It must not render
  // "NaN:NaN" over the video.
  it('survives the values a live stream actually produces', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
});
