import React from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Tab icons drawn with react-native-svg.
 *
 * @expo/vector-icons is not installed in this project and adding a dependency is
 * out of scope, so the four glyphs the tab bar needs are inlined as stroked
 * paths. They inherit the tab bar's active/inactive colour.
 */

export type TabIconName = 'home' | 'calendar' | 'orders' | 'settings';

interface Props {
  name: TabIconName;
  /** The tab bar hands us a ColorValue, which may be a platform colour object. */
  color: ColorValue;
  size?: number;
}

export function TabBarIcon({ name, color, size = 24 }: Props) {
  const stroke = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' ? (
        <>
          <Path d="M3.5 10.5 12 3.5l8.5 7" {...stroke} />
          <Path d="M5.5 9.8V20h13V9.8" {...stroke} />
          <Path d="M9.8 20v-5.6h4.4V20" {...stroke} />
        </>
      ) : null}

      {name === 'calendar' ? (
        <>
          <Rect x={3.5} y={5.5} width={17} height={15} rx={3} {...stroke} />
          <Path d="M3.5 10.5h17M8.5 3.5v4M15.5 3.5v4" {...stroke} />
          <Circle cx={8.8} cy={14.5} r={1.1} fill={color} />
        </>
      ) : null}

      {name === 'orders' ? (
        <>
          <Rect x={4.5} y={3.5} width={15} height={17} rx={3} {...stroke} />
          <Path d="M8.5 9h7M8.5 13h7M8.5 17h4" {...stroke} />
        </>
      ) : null}

      {name === 'settings' ? (
        <>
          <Circle cx={12} cy={12} r={3.2} {...stroke} />
          <Path
            d="M12 2.8v2.4M12 18.8v2.4M4.5 12H2.1M21.9 12h-2.4M6.7 6.7 5 5M19 19l-1.7-1.7M17.3 6.7 19 5M5 19l1.7-1.7"
            {...stroke}
          />
        </>
      ) : null}
    </Svg>
  );
}
