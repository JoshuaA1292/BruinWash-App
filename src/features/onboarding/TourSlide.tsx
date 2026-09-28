import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';
import type { TourStep } from './types';

interface Props {
  step: TourStep;
  /** Position of this slide in the carousel, used to drive the interpolations. */
  index: number;
  /** Width of one page — the window width, so rotation is handled. */
  width: number;
  scrollX: Animated.Value;
}

const EMOJI_SIZE = 72;
const EMOJI_CIRCLE = 148;

/**
 * One page of the walkthrough: the big centred emoji the web tooltip shows,
 * the step title and the body copy. The emoji lifts and the copy fades as the
 * page settles, so swiping feels native rather than like a web carousel.
 */
export function TourSlide({ step, index, width, scrollX }: Props) {
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  const emojiStyle = {
    opacity: scrollX.interpolate({ inputRange, outputRange: [0, 1, 0], extrapolate: 'clamp' }),
    transform: [
      {
        scale: scrollX.interpolate({
          inputRange,
          outputRange: [0.8, 1, 0.8],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  const copyStyle = {
    opacity: scrollX.interpolate({
      inputRange,
      outputRange: [0, 1, 0],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateY: scrollX.interpolate({
          inputRange,
          outputRange: [spacing.xl, 0, spacing.xl],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  return (
    <View
      style={[styles.slide, { width }]}
      accessible
      accessibilityLabel={`${step.title}. ${step.body}`}
    >
      <Animated.View style={[styles.emojiCircle, emojiStyle]}>
        <Text style={styles.emoji} allowFontScaling={false}>
          {step.emoji}
        </Text>
      </Animated.View>

      <Animated.View style={[styles.copy, copyStyle]}>
        <Text variant="display" color={colors.textOnPrimary} center>
          {step.title}
        </Text>
        <Text variant="body" color={colors.primarySoft} center style={styles.body}>
          {step.body}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    // A horizontal list lays items out on the main axis, so the page takes its
    // width from the prop and stretches to full height on the cross axis.
    // flex: 1 here would fight the explicit width.
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xxl,
  },
  emojiCircle: {
    width: EMOJI_CIRCLE,
    height: EMOJI_CIRCLE,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: EMOJI_SIZE, lineHeight: EMOJI_SIZE * 1.2 },
  copy: { gap: spacing.md, alignSelf: 'stretch' },
  body: { lineHeight: 24 },
});
