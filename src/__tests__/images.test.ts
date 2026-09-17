import {
  canResizeOnCdn,
  hostOf,
  sizedImageUrl,
  widthBucket,
} from '../services/images';

describe('hostOf', () => {
  it('reads the host and drops any port', () => {
    expect(hostOf('https://valiw.hakunaymatata.com/a/b.jpg')).toBe(
      'valiw.hakunaymatata.com',
    );
    expect(hostOf('http://Example.COM:8080/x')).toBe('example.com');
  });

  it('answers null for something that is not an http url', () => {
    expect(hostOf('file:///tmp/a.jpg')).toBeNull();
    expect(hostOf('not a url')).toBeNull();
  });
});

describe('canResizeOnCdn', () => {
  it('accepts the MovieBox image hosts and their subdomains', () => {
    expect(canResizeOnCdn('https://valiw.hakunaymatata.com/a.jpg')).toBe(true);
    expect(canResizeOnCdn('https://macdn.aoneroom.com/a.jpg')).toBe(true);
    expect(canResizeOnCdn('https://aoneroom.com/a.jpg')).toBe(true);
  });

  it('refuses hosts that merely look like them', () => {
    expect(canResizeOnCdn('https://evil-aoneroom.com/a.jpg')).toBe(false);
    expect(canResizeOnCdn('https://aoneroom.com.attacker.net/a.jpg')).toBe(
      false,
    );
    expect(canResizeOnCdn('https://cdn.supabase.co/logo.png')).toBe(false);
  });
});

describe('widthBucket', () => {
  it('snaps up to the next step, so the CDN caches a few sizes not hundreds', () => {
    expect(widthBucket(124, 1)).toBe(160);
    expect(widthBucket(161, 1)).toBe(240);
    expect(widthBucket(240, 1)).toBe(240);
  });

  it('accounts for screen density, which is the whole point on a phone', () => {
    expect(widthBucket(124, 3)).toBe(480);
    expect(widthBucket(124, 1)).toBe(160);
  });

  it('clamps rather than asking for something absurd', () => {
    expect(widthBucket(4000, 3)).toBe(1920);
  });

  it('survives a width that has not been measured yet', () => {
    expect(widthBucket(0, 3)).toBe(160);
    expect(widthBucket(NaN, 3)).toBe(160);
    expect(widthBucket(124, 0)).toBe(160);
  });
});

describe('sizedImageUrl', () => {
  it('asks the CDN for a poster the size it will actually be drawn', () => {
    expect(
      sizedImageUrl('https://valiw.hakunaymatata.com/cover.jpg', 124, 2),
    ).toBe(
      'https://valiw.hakunaymatata.com/cover.jpg?x-oss-process=image/resize,w_320',
    );
  });

  it('leaves every other host exactly as it was', () => {
    const url = 'https://cdn.supabase.co/logo.png';
    expect(sizedImageUrl(url, 124, 2)).toBe(url);
  });

  it('joins onto an existing query string instead of breaking it', () => {
    expect(
      sizedImageUrl('https://valiw.hakunaymatata.com/c.jpg?v=2', 124, 2),
    ).toBe(
      'https://valiw.hakunaymatata.com/c.jpg?v=2&x-oss-process=image/resize,w_320',
    );
  });

  it('does not stack a second directive onto a url that already has one', () => {
    const url =
      'https://valiw.hakunaymatata.com/c.jpg?x-oss-process=image/resize,w_640';
    expect(sizedImageUrl(url, 124, 2)).toBe(url);
  });

  it('passes a missing image through as nothing to render', () => {
    expect(sizedImageUrl(null, 124, 2)).toBeNull();
    expect(sizedImageUrl(undefined, 124, 2)).toBeNull();
    expect(sizedImageUrl('', 124, 2)).toBeNull();
  });

  it('asks for a wide file for a full-bleed hero and a small one for a card', () => {
    const cover = 'https://valiw.hakunaymatata.com/cover.jpg';

    expect(sizedImageUrl(cover, 412, 3)).toContain('w_1280');
    expect(sizedImageUrl(cover, 124, 3)).toContain('w_480');
  });
});
