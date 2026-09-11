const preset = require('@react-native/jest-preset');

module.exports = {
  ...preset,
  transform: {
    ...preset.transform,
    // Not covered by the preset's `^.+\.(js|ts|tsx)$`, so without this the
    // module is loaded untransformed and its `export` is a syntax error.
    '^.+\\.mjs$': 'babel-jest',
  },
  // Jest's default list has no 'mjs' either, so the import resolves to nothing
  // and fails as "cannot find module" on a file that is plainly there.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'json', 'node'],
};
