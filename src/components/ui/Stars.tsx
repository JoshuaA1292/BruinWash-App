import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors, spacing } from '@/theme';

interface Props {
  /** Fractional values render a half star, e.g. 4.6 -> 4 full + 1 half. */
  rating: number;
  size?: number;
  onRate?: (value: number) => void;
}

export function Stars({ rating, size = 16, onRate }: Props) {
  return (
    <View style={styles.row} accessibilityRole={onRate ? 'adjustable' : 'image'}
      accessibilityLabel={onRate ? 'Rate your washer' : `Rated ${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const glyph = rating >= i ? '★' : rating >= i - 0.5 ? '⯨' : '☆';
        const star = (
          <Text
            key={i}
            style={{ fontSize: size, lineHeight: size * 1.25 }}
            color={rating >= i - 0.5 ? colors.star : colors.borderStrong}
          >
            {glyph}
          </Text>
        );

        if (!onRate) return star;
        return (
          <Pressable
            key={i}
            onPress={() => onRate(i)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${i} star${i > 1 ? 's' : ''}`}
          >
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs / 2, alignItems: 'center' },
});
