import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';

interface Props {
  count: number;
  /** Zero-based current step, used for the screen-reader announcement. */
  index: number;
  width: number;
  scrollX: Animated.Value;
}

const DOT = 8;

/**
 * The web product's dot progress indicator. Scale and opacity are driven off
 * the same scroll offset as the carousel, so the dots track a half-finished
 * swipe instead of snapping after it.
 */
export function TourDots({ count, index, width, scrollX }: Props) {
  const pageWidth = Math.max(width, 1);

  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${index + 1} of ${count}`}
      accessibilityValue={{ min: 1, max: count, now: index + 1 }}
    >
      {Array.from({ length: count }, (_, i) => {
        const inputRange = [(i - 1) * pageWidth, i * pageWidth, (i + 1) * pageWidth];
        return (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                opacity: scrollX.interpolate({
                  inputRange,
                  outputRange: [0.3, 1, 0.3],
                  extrapolate: 'clamp',
                }),
                transform: [
                  {
                    scale: scrollX.interpolate({
                      inputRange,
                      outputRange: [1, 1.5, 1],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: spacing.xl,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
});
