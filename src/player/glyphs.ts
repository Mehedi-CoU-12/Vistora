/**
 * The player's icons, as characters.
 *
 * There is no icon font and no SVG library in this project, and the player is
 * not a good enough reason to add one: a font asset is a build-config change, a
 * vector library is a native dependency, and both would ship to a TV to draw six
 * shapes. So the controls use the geometric characters, which are in Roboto
 * itself on every Android build, and words for anything a shape would only
 * approximate ("Fit", "Audio", "Lock").
 *
 * Deliberately avoided: anything from an emoji block. Android renders those
 * through the colour emoji font, so a play button would arrive as a full-colour
 * pictogram at a size and weight nothing else on screen shares.
 */
export const glyph = {
  play: '▶', // BLACK RIGHT-POINTING TRIANGLE
  pause: '❙❙', // two MEDIUM VERTICAL BARs
  rewind: '◀◀',
  forward: '▶▶',
  /** Exit the player. */
  close: '✕', // MULTIPLICATION X
  settings: '⚙', // GEAR
  /** Selected marker in the settings panel. */
  tick: '✓', // CHECK MARK
  /** Jump to the live edge. */
  live: '●', // BLACK CIRCLE
} as const;
