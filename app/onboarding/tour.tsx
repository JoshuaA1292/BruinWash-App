import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Button, Screen, Text } from '@/components/ui';
import { ONBOARDING_STEPS } from '@/constants/copy';
import { TourDots, TourSlide, useCompleteTour, type TourStep } from '@/features/onboarding';
import { colors, spacing } from '@/theme';

/** Widened from the readonly tuple in @/constants/copy; only the last step has a cta. */
const STEPS: readonly TourStep[] = ONBOARDING_STEPS;

/**
 * First-launch walkthrough (spec 2.1). The web product shows a sequence of
 * tooltips; on mobile the spec asks for the same steps and copy as a
 * full-screen modal carousel — swipeable, with Back / Next and dot progress.
 *
 * Finishing (or skipping) writes onboarding_tour_done so the root layout lets
 * the user into the app.
 */
export default function OnboardingTour() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { complete, saving, error } = useCompleteTour();

  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const listRef = useRef<Animated.FlatList<TourStep>>(null);
  // useMemo, not useRef(...).current: reading a ref during render is a React
  // rule violation, and the value only needs to be stable across renders.
  const scrollX = useMemo(() => new Animated.Value(0), []);

  const lastIndex = STEPS.length - 1;
  const currentStep = STEPS[index];
  const isLast = index === lastIndex;
  const nextLabel = isLast ? (currentStep?.cta ?? 'Get Started') : 'Next';

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
      }),
    [scrollX],
  );

  const settle = useCallback((next: number) => {
    indexRef.current = next;
    setIndex(next);
  }, []);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 0), lastIndex);
      listRef.current?.scrollToOffset({ offset: clamped * width, animated: true });
      settle(clamped);
    },
    [lastIndex, settle, width],
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
      settle(Math.min(Math.max(page, 0), lastIndex));
    },
    [lastIndex, settle, width],
  );

  // Keep the current page aligned when the window changes (rotation, split view).
  // `index` is read through the ref so a button-driven animated scroll is not
  // cancelled by this effect re-running.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: indexRef.current * width, animated: false });
  }, [width]);

  const onNext = useCallback(() => {
    if (isLast) {
      void complete();
      return;
    }
    goTo(index + 1);
  }, [complete, goTo, index, isLast]);

  const renderItem = useCallback(
    ({ item, index: i }: ListRenderItemInfo<TourStep>) => (
      <TourSlide step={item} index={i} width={width} scrollX={scrollX} />
    ),
    [scrollX, width],
  );

  return (
    <Screen
      scroll={false}
      background={colors.primary}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {error ? <Banner tone="danger" title="Could not continue" message={error} /> : null}

          <TourDots count={STEPS.length} index={index} width={width} scrollX={scrollX} />

          <View style={styles.buttonRow}>
            <Button
              label="Back"
              variant="ghost"
              fullWidth={false}
              style={styles.button}
              disabled={index === 0 || saving}
              onPress={() => goTo(index - 1)}
            />
            <Button
              label={nextLabel}
              variant="primary"
              fullWidth={false}
              style={styles.button}
              loading={saving}
              onPress={onNext}
            />
          </View>
        </View>
      }
    >
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}>
        {isLast ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip the walkthrough"
            accessibilityHint="Goes straight into the app"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={() => void complete()}
            hitSlop={spacing.md}
            style={({ pressed }) => [styles.skip, pressed && styles.skipPressed]}
          >
            <Text variant="label" color={colors.primarySoft}>
              Skip
            </Text>
          </Pressable>
        )}
      </View>

      <Animated.FlatList<TourStep>
        ref={listRef}
        data={STEPS}
        keyExtractor={(item) => item.title}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        accessibilityLabel="Walkthrough steps"
        style={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 0, gap: 0 },
  list: { flex: 1 },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    minHeight: spacing.xxl,
    alignItems: 'flex-end',
  },
  skip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  skipPressed: { opacity: 0.6 },
  footer: { gap: spacing.md },
  buttonRow: { flexDirection: 'row', gap: spacing.md },
  button: { flex: 1 },
});
