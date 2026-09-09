import React from 'react';

import {RootNavigator} from './src/navigation/RootNavigator';

/**
 * Vistora -- an Android TV media app.
 *
 * The whole architecture in one paragraph: screens ask `contentService` for
 * data, which asks Supabase over HTTPS and returns app models. When the user
 * selects something, the resulting `stream_url` is handed to `VideoPlayer`,
 * which gives it to Media3/ExoPlayer, which opens its own connection to the
 * CDN. Supabase serves metadata; it never carries video.
 */
export default function App() {
  return <RootNavigator />;
}
