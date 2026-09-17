import {
  DEFAULT_PLAYER_PREFS,
  getPlayerPrefs,
  isDefaultPlayerPrefs,
  resetPlayerPrefs,
  setPlayerPref,
} from '../state/playerPrefs';

describe('player prefs', () => {
  beforeEach(resetPlayerPrefs);

  it('starts at the defaults', () => {
    expect(getPlayerPrefs()).toEqual(DEFAULT_PLAYER_PREFS);
    expect(isDefaultPlayerPrefs(getPlayerPrefs())).toBe(true);
  });

  it('changes one setting and leaves the rest alone', () => {
    setPlayerPref('skipStep', 30);

    expect(getPlayerPrefs()).toEqual({
      ...DEFAULT_PLAYER_PREFS,
      skipStep: 30,
    });
  });

  it('keeps the same object when the value has not moved, so nothing re-renders', () => {
    const before = getPlayerPrefs();
    setPlayerPref('skipStep', DEFAULT_PLAYER_PREFS.skipStep);

    expect(getPlayerPrefs()).toBe(before);
  });

  it('replaces the object on a real change, so subscribers see it', () => {
    const before = getPlayerPrefs();
    setPlayerPref('seekSpeed', 'turbo');

    expect(getPlayerPrefs()).not.toBe(before);
  });

  it('notices that any single change is no longer the default', () => {
    setPlayerPref('subtitleSize', 34);

    expect(isDefaultPlayerPrefs(getPlayerPrefs())).toBe(false);
  });

  it('puts everything back, not only the last thing touched', () => {
    setPlayerPref('skipStep', 60);
    setPlayerPref('seekSpeed', 'precise');
    setPlayerPref('keepDeviceVolume', true);
    setPlayerPref('scaling', 'native');

    resetPlayerPrefs();

    expect(getPlayerPrefs()).toEqual(DEFAULT_PLAYER_PREFS);
  });
});
