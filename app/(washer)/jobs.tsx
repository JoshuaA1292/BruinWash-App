import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Screen, Text } from '@/components/ui';
import { ActiveJobCard, EmptyState, HistoryCard } from '@/features/washer';
import { useWasherJobs } from '@/hooks/useWasherJobs';
import { colors, radius, spacing } from '@/theme';
import type { OrderWithBuilding } from '@/types/database';

type Segment = 'active' | 'history';

const PHOTO_PROMPT_TITLE = 'Delivery photo required';
const PHOTO_PROMPT_BODY =
  'Take a photo of the laundry where you left it. CampusWash cannot mark the order delivered without proof of delivery.';

/**
 * My Jobs — the pipeline driver (spec 2.6).
 *
 * Every control is an RPC: set_washer_en_route() for "I'm on my way" (which
 * fires the "Washer on the way" automated message and is not a stage), then
 * advance_order_status() one legal stage at a time. Delivery additionally needs
 * a photo in the delivery-proof bucket (spec 3.4).
 */
export default function WasherJobsScreen() {
  const [segment, setSegment] = useState<Segment>('active');
  const {
    active,
    history,
    isLoading,
    isRefetching,
    refetch,
    loadError,
    goEnRoute,
    advance,
    markDelivered,
    hasUploadedProof,
    busyOrderId,
    busyLabel,
    actionError,
    clearActionError,
  } = useWasherJobs();

  const promptForProof = (orderId: string) => {
    // The photo is already in the bucket — only the RPC needs retrying, so do
    // not make the washer shoot it again.
    if (hasUploadedProof(orderId)) {
      markDelivered(orderId, 'camera');
      return;
    }

    Alert.alert(PHOTO_PROMPT_TITLE, PHOTO_PROMPT_BODY, [
      { text: 'Take photo', onPress: () => markDelivered(orderId, 'camera') },
      { text: 'Choose from library', onPress: () => markDelivered(orderId, 'library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderActive = ({ item }: { item: OrderWithBuilding }) => (
    <ActiveJobCard
      order={item}
      busy={busyOrderId === item.id}
      busyLabel={busyLabel}
      proofReady={hasUploadedProof(item.id)}
      onEnRoute={() => goEnRoute(item.id)}
      onAdvance={(to) => advance(item.id, to)}
      onDeliver={() => promptForProof(item.id)}
      onOpenChat={() => router.push({ pathname: '/order/[id]/chat', params: { id: item.id } })}
    />
  );

  const data = segment === 'active' ? active : history;

  return (
    <Screen scroll={false} contentStyle={styles.flush}>
      <View style={styles.pinned}>
        <View style={styles.segments} accessibilityRole="tablist">
          <SegmentButton
            label={`Active${active.length ? ` (${active.length})` : ''}`}
            selected={segment === 'active'}
            onPress={() => setSegment('active')}
          />
          <SegmentButton
            label="History"
            selected={segment === 'history'}
            onPress={() => setSegment('history')}
          />
        </View>

        {actionError ? (
          <Banner tone="danger" title="That did not go through" message={actionError}>
            <Button
              label="Dismiss"
              variant="ghost"
              fullWidth={false}
              haptic={false}
              onPress={clearActionError}
            />
          </Banner>
        ) : null}

        {loadError ? <Banner tone="danger" title="Could not load your jobs" message={loadError} /> : null}
      </View>

      <FlatList
        data={data}
        keyExtractor={(order) => order.id}
        renderItem={segment === 'active' ? renderActive : ({ item }) => <HistoryCard order={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            accessibilityLabel="Refresh your jobs"
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your jobs" />
            </View>
          ) : segment === 'active' ? (
            <EmptyState
              title="No active jobs"
              body="Accept a job from the Available tab and it will show up here with its stage controls."
            />
          ) : (
            <EmptyState
              title="No finished jobs yet"
              body="Delivered and cancelled orders land here, with what each one paid."
            />
          )
        }
      />
    </Screen>
  );
}

function SegmentButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.segment, selected && styles.segmentOn, pressed && styles.pressed]}
    >
      <Text variant="label" color={selected ? colors.textOnPrimary : colors.primary}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flush: { padding: 0, gap: 0 },
  pinned: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  segments: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  segmentOn: { backgroundColor: colors.primary },
  pressed: { opacity: 0.8 },
  list: { padding: spacing.lg, gap: spacing.lg },
  loading: { paddingVertical: spacing.xxxl },
});
