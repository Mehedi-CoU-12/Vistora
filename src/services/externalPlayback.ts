import { Alert, Linking } from 'react-native';

import type { Stream } from '../types/content';

const EXTERNAL_PROTOCOLS: ReadonlySet<Stream['protocol']> = new Set([
  'youtube',
]);

/** True when this stream is opened by another app rather than by VideoPlayer. */
export function isExternalStream(stream: Stream): boolean {
  return EXTERNAL_PROTOCOLS.has(stream.protocol);
}

export async function openExternally(
  stream: Stream,
  title: string,
): Promise<void> {
  try {
    await Linking.openURL(stream.url);
  } catch {
    Alert.alert(
      'Cannot open this episode',
      `“${title}” plays on YouTube, and nothing on this device could open the link.\n\n` +
        'Install the YouTube app to watch it here.',
    );
  }
}
