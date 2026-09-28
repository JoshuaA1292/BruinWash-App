import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Button, Screen, Text } from '@/components/ui';
import {
  AvailableJobCard,
  ConnectOnboardingBanner,
  EmptyState,
  useConnectOnboarding,
} from '@/features/washer';
import { useAvailableOrders } from '@/hooks/useAvailableOrders';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme';
import type { AvailableOrder } from '@/types/database';

const EMPTY_TITLE = 'Nothing to pick up yet';
const EMPTY_BODY = "No orders in your building right now — we'll notify you.";

/**
 * Available jobs (spec 2.6).
 *
 * The list is a plain select from public.orders: the orders_select policy only
 * exposes pending, unclaimed orders in the washer's own building, so there is no
 * building filter to get wrong here and no requester identity in the payload.
 */
export default function WasherAvailableScreen() {
  const { profile } = useAuth();
  const {
    orders,
    isLoading,
    isRefetching,
    refetch,
    loadError,
    enabled,
    accept,
    acceptingId,
    acceptError,
    clearAcceptError,
  } = useAvailableOrders();
  const connect = useConnectOnboarding();

  const onboardingPending = isSupabaseConfigured && !profile?.stripe_onboarding_done;
  const buildingMissing = isSupabaseConfigured && !profile?.building_id;
  const hasPinned =
    !isSupabaseConfigured || buildingMissing || onboardingPending || Boolean(acceptError) || Boolean(loadError);

  const renderItem = ({ item }: { item: AvailableOrder }) => (
    <AvailableJobCard
      order={item}
      onAccept={() => accept(item.id)}
      accepting={acceptingId === item.id}
      disabled={Boolean(acceptingId) && acceptingId !== item.id}
    />
  );

  return (
    <Screen scroll={false} contentStyle={styles.flush}>
      {hasPinned ? (
        <View style={styles.pinned}>
          {!isSupabaseConfigured ? (
            <Banner
              tone="warning"
              title="Not connected"
              message="Add your Supabase keys to .env to see live orders."
            />
          ) : null}

          {buildingMissing ? (
            <Banner
              tone="warning"
              title="Pick your building"
              message="Washers are matched to orders in their own building. Add yours in Settings to start receiving jobs."
            />
          ) : null}

          <ConnectOnboardingBanner
            onboardingDone={!onboardingPending}
            onStart={() => void connect.start()}
            pending={connect.pending}
            error={connect.error}
          />

          {acceptError ? (
            <Banner tone="danger" title="Could not accept that job" message={acceptError}>
              <Button
                label="Dismiss"
                variant="ghost"
                fullWidth={false}
                haptic={false}
                onPress={clearAcceptError}
              />
            </Banner>
          ) : null}

          {loadError ? (
            <Banner tone="danger" title="Could not load jobs" message={loadError} />
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={orders}
        keyExtractor={(order) => order.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            accessibilityLabel="Refresh available jobs"
          />
        }
        ListHeaderComponent={
          orders.length ? (
            <Text variant="caption" color={colors.textMuted}>
              {`${orders.length} ${orders.length === 1 ? 'job' : 'jobs'} in your building`}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          isLoading && enabled ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} accessibilityLabel="Loading jobs" />
            </View>
          ) : (
            <EmptyState title={EMPTY_TITLE} body={EMPTY_BODY} />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flush: { padding: 0, gap: 0 },
  pinned: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  list: { padding: spacing.lg, gap: spacing.lg },
  loading: { paddingVertical: spacing.xxxl },
});
