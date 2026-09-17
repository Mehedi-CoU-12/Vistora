import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../theme';



















































export function SearchIcon({
  size = 16,
  color,
}: {
  size?: number;
  
  color: string;
}) {
  const styles = useStyles();

  
  
  const stroke = Math.max(1, Math.round(size / 8));
  const lens = Math.round(size * 0.7);
  const handle = Math.round(size * 0.45);

  
















  const radius = lens / 2;
  const diagonal = Math.SQRT1_2; 
  const handleMidpoint =
    radius + (radius - stroke / 2) * diagonal + (handle / 2) * diagonal;

  return (
    <View
      style={[styles.root, { width: size, height: size }]}
      
      
      
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.lens,
          {
            width: lens,
            height: lens,
            borderRadius: lens / 2,
            borderWidth: stroke,
            borderColor: color,
          },
        ]}
      />

      <View
        style={[
          styles.handle,
          {
            
            
            
            left: handleMidpoint - stroke / 2,
            top: handleMidpoint - handle / 2,
            width: stroke,
            height: handle,
            borderRadius: stroke / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}








const useStyles = makeStyles(() => ({
  
  
  root: {
    flexShrink: 0,
  },
  lens: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  handle: {
    position: 'absolute',
    transform: [{ rotate: '-45deg' }],
  },
}));
