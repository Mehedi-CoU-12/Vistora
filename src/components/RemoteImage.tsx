import React, { useEffect, useMemo, useState } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

import { sizedImageUrl } from '../services/images';

interface RemoteImageProps {
  url: string | null | undefined;

  displayWidth: number;

  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'center' | 'stretch';

  accessibilityElementsHidden?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
}

export function RemoteImage({
  url,
  displayWidth,
  style,
  resizeMode = 'cover',
  accessibilityElementsHidden,
  importantForAccessibility,
}: RemoteImageProps) {
  const sized = useMemo(
    () => sizedImageUrl(url, displayWidth),
    [displayWidth, url],
  );

  const [fellBack, setFellBack] = useState(false);

  useEffect(() => {
    setFellBack(false);
  }, [sized]);

  const uri = fellBack ? url : sized;

  if (!uri) {
    return null;
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      resizeMethod="resize"
      onError={() => setFellBack(true)}
      accessibilityElementsHidden={accessibilityElementsHidden}
      importantForAccessibility={importantForAccessibility}
    />
  );
}
