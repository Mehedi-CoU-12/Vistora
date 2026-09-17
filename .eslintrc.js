module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['src/services/sources/moviebox/crypto.ts'],
      rules: { 'no-bitwise': 'off' },
    },
  ],
};
