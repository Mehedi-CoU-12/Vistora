import { PixelRatio } from 'react-native';

const PROCESSABLE_HOSTS = [
  'hakunaymatata.com',
  'aoneroom.com',
  'inmoviebox.com',
];

const WIDTH_STEPS = [160, 240, 320, 480, 640, 960, 1280, 1920];

const MAX_WIDTH = WIDTH_STEPS[WIDTH_STEPS.length - 1];

const OSS_PROCESS = 'x-oss-process';

export function hostOf(url: string): string | null {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);

  return match === null ? null : match[1].toLowerCase().replace(/:\d+$/, '');
}

export function canResizeOnCdn(url: string): boolean {
  const host = hostOf(url);

  if (host === null) {
    return false;
  }

  return PROCESSABLE_HOSTS.some(
    domain => host === domain || host.endsWith(`.${domain}`),
  );
}

export function widthBucket(displayWidth: number, scale: number): number {
  if (!Number.isFinite(displayWidth) || displayWidth <= 0) {
    return WIDTH_STEPS[0];
  }

  const density = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const target = Math.ceil(displayWidth * density);

  return WIDTH_STEPS.find(step => step >= target) ?? MAX_WIDTH;
}

export function sizedImageUrl(
  url: string | null | undefined,
  displayWidth: number,
  scale: number = PixelRatio.get(),
): string | null {
  if (!url) {
    return null;
  }

  if (!canResizeOnCdn(url) || url.includes(OSS_PROCESS)) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  const width = widthBucket(displayWidth, scale);

  return `${url}${separator}${OSS_PROCESS}=image/resize,w_${width}`;
}
