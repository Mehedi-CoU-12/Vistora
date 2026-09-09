/**
 * Type declarations for the virtual `@env` module created by react-native-dotenv.
 * Every key you add to `.env` must be declared here to be usable from TypeScript.
 */
declare module '@env' {
  export const SUPABASE_URL: string | undefined;
  export const SUPABASE_ANON_KEY: string | undefined;
}
