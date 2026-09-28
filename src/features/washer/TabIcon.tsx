import React from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

/**
 * @expo/vector-icons is NOT a dependency of expo in SDK 57 and is not installed
 * in this project, so the tab glyphs are drawn with react-native-svg (which is)
 * rather than adding a package. Same 24x24 grid and 2px stroke as the web app's
 * icon set, so the tab bar reads the same.
 */
export type TabIconName = 'available' | 'jobs' | 'earnings' | 'profile';

interface Props {
  name: TabIconName;
  /** The tab bar hands us a ColorValue, not a plain hex string. */
  color: ColorValue;
  size?: number;
}

export function TabIcon({ name, color, size = 24 }: Props) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
      {name === 'available' ? (
        <>
          <Line x1={4} y1={6} x2={20} y2={6} {...stroke} />
          <Line x1={4} y1={12} x2={20} y2={12} {...stroke} />
          <Line x1={4} y1={18} x2={13} y2={18} {...stroke} />
        </>
      ) : null}

      {name === 'jobs' ? (
        <>
          <Path
            d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"
            {...stroke}
          />
          <Polyline points="3.3 6.9 12 12 20.7 6.9" {...stroke} />
          <Line x1={12} y1={22} x2={12} y2={12} {...stroke} />
        </>
      ) : null}

      {name === 'earnings' ? (
        <>
          <Line x1={12} y1={2} x2={12} y2={22} {...stroke} />
          <Path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" {...stroke} />
        </>
      ) : null}

      {name === 'profile' ? (
        <>
          <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" {...stroke} />
          <Circle cx={12} cy={7} r={4} {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}
