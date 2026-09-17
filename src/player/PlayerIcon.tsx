import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { makeStyles } from '../theme';





























































export type IconName =
  
  | 'back'
  | 'play'
  | 'pause'
  | 'rewind'
  | 'forward'
  
  | 'close'
  
  | 'settings'
  
  | 'lock'
  | 'unlock'
  
  | 'aspect'
  
  | 'pip'
  
  | 'live'
  
  | 'tick'
  
  | 'plus'
  
  | 'info';

interface PlayerIconProps {
  name: IconName;
  
  size: number;
  
  color: string;
}

export function PlayerIcon({ name, size, color }: PlayerIconProps) {
  const styles = useStyles();

  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      
      
      
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Shape name={name} size={size} color={color} />
    </View>
  );
}

function Shape({ name, size, color }: PlayerIconProps) {
  const styles = useStyles();

  
  const stroke = Math.max(1, Math.round(size / 8));

  switch (name) {
    













    case 'back':
      return (
        <View
          style={[
            styles.chevron,
            {
              width: size * 0.4,
              height: size * 0.4,
              borderTopWidth: stroke,
              borderLeftWidth: stroke,
              borderColor: color,
            },
          ]}
        />
      );

    








    case 'play':
      return <Triangle direction="right" size={size} color={color} />;

    case 'pause':
      return (
        <View style={[styles.row, { gap: size * 0.16 }]}>
          <Bar size={size} color={color} />
          <Bar size={size} color={color} />
        </View>
      );

    
    case 'rewind':
    case 'forward': {
      const direction = name === 'rewind' ? 'left' : 'right';
      const half = size * 0.56;

      return (
        <View style={styles.row}>
          <Triangle direction={direction} size={half} color={color} />
          <Triangle
            direction={direction}
            size={half}
            color={color}
            style={styles.overlap}
          />
        </View>
      );
    }

    
    case 'close':
      return (
        <>
          <View
            style={[
              styles.slashDown,
              {
                width: size * 0.82,
                height: stroke,
                borderRadius: stroke / 2,
                backgroundColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.slashUp,
              {
                width: size * 0.82,
                height: stroke,
                borderRadius: stroke / 2,
                backgroundColor: color,
              },
            ]}
          />
        </>
      );

    
















    case 'settings': {
      const ring = size * 0.62;
      const toothWidth = size * 0.18;

      return (
        <>
          {GEAR_ANGLES.map(angle => (
            <View
              key={angle}
              style={[
                styles.spoke,
                { width: size, height: size, transform: [{ rotate: angle }] },
              ]}
            >
              <View
                style={{
                  width: toothWidth,
                  height: size * 0.22,
                  borderRadius: stroke / 2,
                  backgroundColor: color,
                }}
              />
            </View>
          ))}

          <View
            style={{
              width: ring,
              height: ring,
              borderRadius: ring / 2,
              borderWidth: Math.max(stroke, Math.round(size * 0.13)),
              borderColor: color,
            }}
          />
        </>
      );
    }

    







    case 'lock':
    case 'unlock': {
      const bodyWidth = size * 0.74;
      const bodyHeight = size * 0.5;
      const shackle = size * 0.44;
      const open = name === 'unlock';

      return (
        <View style={[styles.lock, { width: size, height: size }]}>
          <View
            
            
            
            style={[
              {
                width: shackle,
                height: shackle * 0.78,
                borderWidth: stroke,
                borderTopLeftRadius: shackle / 2,
                borderTopRightRadius: shackle / 2,
                borderColor: color,
                
                
                marginBottom: -stroke,
                
                
                
                ...(open ? { marginLeft: shackle * 0.55 } : null),
              },
              styles.shackle,
              open ? styles.shackleOpen : null,
            ]}
          />

          <View
            style={{
              width: bodyWidth,
              height: bodyHeight,
              borderRadius: Math.max(2, Math.round(size * 0.14)),
              backgroundColor: color,
            }}
          />
        </View>
      );
    }

    







    case 'aspect': {
      const arm = size * 0.3;
      const inset = { vertical: size * 0.08, horizontal: size * 0.05 };

      return (
        <>
          {CORNERS.map(corner => (
            <View
              key={corner.key}
              style={[
                styles.corner,
                { width: arm, height: arm, borderColor: color },
                corner.place(inset, stroke),
              ]}
            />
          ))}
        </>
      );
    }

    
    case 'pip': {
      const frameWidth = size * 0.92;
      const frameHeight = size * 0.72;

      return (
        <View
          style={{
            width: frameWidth,
            height: frameHeight,
            borderWidth: stroke,
            borderRadius: Math.max(2, Math.round(size * 0.12)),
            borderColor: color,
          }}
        >
          <View
            style={[
              styles.inset,
              {
                width: frameWidth * 0.46,
                height: frameHeight * 0.46,
                borderRadius: stroke / 2,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      );
    }

    case 'live':
      return (
        <View
          style={{
            width: size * 0.44,
            height: size * 0.44,
            borderRadius: size * 0.22,
            backgroundColor: color,
          }}
        />
      );

    












    










    case 'plus':
      return (
        <View style={styles.lock}>
          <View
            style={[
              styles.corner,
              {
                width: size * 0.74,
                height: stroke,
                borderRadius: stroke,
                backgroundColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.corner,
              {
                width: stroke,
                height: size * 0.74,
                borderRadius: stroke,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      );

    








    case 'info':
      return (
        <View
          style={[
            styles.lock,
            {
              width: size * 0.92,
              height: size * 0.92,
              borderRadius: size * 0.46,
              borderWidth: stroke,
              borderColor: color,
            },
          ]}
        >
          <View
            style={{
              width: stroke,
              height: stroke,
              borderRadius: stroke,
              backgroundColor: color,
              marginBottom: stroke * 0.75,
            }}
          />
          <View
            style={{
              width: stroke,
              height: size * 0.3,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
        </View>
      );

    case 'tick':
      return (
        <View
          style={[
            styles.chevron,
            {
              width: size * 0.72,
              height: size * 0.4,
              borderBottomWidth: stroke,
              borderLeftWidth: stroke,
              borderColor: color,
              
              
              
              
              marginBottom: size * 0.28,
            },
          ]}
        />
      );
  }
}


const GEAR_ANGLES = ['0deg', '60deg', '120deg', '180deg', '240deg', '300deg'];












const CORNERS: {
  key: string;
  place: (
    inset: { vertical: number; horizontal: number },
    stroke: number,
  ) => ViewStyle;
}[] = [
  {
    key: 'top-left',
    place: (inset, stroke) => ({
      top: inset.vertical,
      left: inset.horizontal,
      borderTopWidth: stroke,
      borderLeftWidth: stroke,
    }),
  },
  {
    key: 'top-right',
    place: (inset, stroke) => ({
      top: inset.vertical,
      right: inset.horizontal,
      borderTopWidth: stroke,
      borderRightWidth: stroke,
    }),
  },
  {
    key: 'bottom-left',
    place: (inset, stroke) => ({
      bottom: inset.vertical,
      left: inset.horizontal,
      borderBottomWidth: stroke,
      borderLeftWidth: stroke,
    }),
  },
  {
    key: 'bottom-right',
    place: (inset, stroke) => ({
      bottom: inset.vertical,
      right: inset.horizontal,
      borderBottomWidth: stroke,
      borderRightWidth: stroke,
    }),
  },
];





function Bar({ size, color }: { size: number; color: string }) {
  return (
    <View
      style={{
        width: size * 0.22,
        height: size * 0.78,
        borderRadius: Math.max(1, Math.round(size * 0.06)),
        backgroundColor: color,
      }}
    />
  );
}








function Triangle({
  direction,
  size,
  color,
  style,
}: {
  direction: 'left' | 'right';
  size: number;
  color: string;
  style?: ViewStyle;
}) {
  const styles = useStyles();
  const height = size * 0.8;
  const width = height * 0.86;

  return (
    <View
      style={[
        styles.triangle,
        {
          borderTopWidth: height / 2,
          borderBottomWidth: height / 2,
          ...(direction === 'right'
            ? { borderLeftWidth: width, borderLeftColor: color }
            : { borderRightWidth: width, borderRightColor: color }),
        },
        style,
      ]}
    />
  );
}








const useStyles = makeStyles(() => ({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    
    
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevron: {
    transform: [{ rotate: '-45deg' }],
  },
  triangle: {
    width: 0,
    height: 0,
    
    
    
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  slashDown: {
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
  slashUp: {
    position: 'absolute',
    transform: [{ rotate: '-45deg' }],
  },
  spoke: {
    position: 'absolute',
    alignItems: 'center',
  },
  lock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shackle: {
    borderBottomWidth: 0,
  },
  shackleOpen: {
    borderRightWidth: 0,
  },
  






  overlap: {
    marginLeft: -1,
  },
  corner: {
    position: 'absolute',
  },
  inset: {
    position: 'absolute',
    right: 1,
    bottom: 1,
  },
}));
