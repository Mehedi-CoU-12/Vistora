module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    /**
     * Reads `.env` at BUILD time and inlines the values, so `import {SUPABASE_URL}
     * from '@env'` becomes a plain string in the bundle. This is a Babel plugin with
     * no native module, which is why we prefer it here: anything with native code has
     * to be re-verified against the react-native-tvos fork, and this has nothing to
     * re-verify.
     *
     * `allowUndefined: true` lets the bundle build with a missing variable so that
     * src/config/env.ts can fail with a readable message at startup instead of Babel
     * failing with a cryptic one.
     *
     * IMPORTANT: values here are inlined into the shipped JS bundle. Only ever put
     * PUBLIC values in `.env` -- the Supabase anon key is designed to be public and
     * is safe. A service-role key is NOT, and must never appear here.
     */
    [
      'module:react-native-dotenv',
      {
        envName: 'APP_ENV',
        moduleName: '@env',
        path: '.env',
        safe: false,
        allowUndefined: true,
        verbose: false,
      },
    ],
  ],
};
