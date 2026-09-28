import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Card, Screen, Text } from '@/components/ui';
import {
  ConnectStatusCard,
  EmptyState,
  PAYOUT_STATUS_LABEL,
  Pill,
  StatTile,
  useConnectOnboarding,
} from '@/features/washer';
import { useEarnings, type PayoutWithOrder } from '@/hooks/useEarnings';
import { formatCents } from '@/constants/pricing';
import { formatPickupTime } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme';

const BALANCE_NOTE =
  'Pending covers delivered jobs Stripe has not paid out yet. Payouts land in the bank account connected to your Stripe Express profile.';

/**
 * Earnings dashboard.
 *
 * Balances come from the my_earnings() RPC — the database sums public.payouts,
 * the client never adds money up itself. History is the payouts table, which RLS
 * already scopes to the signed-in washer.
 */
export default function WasherEarningsScreen() {
  const { profile } = useAuth();
  const { summary, payouts, isLoading, isRefetching, refetch, error } = useEarnings();
  const connect = useConnectOnboarding();

  return (
    <Screen scroll={false} contentStyle={styles.flush}>
      <FlatList
        data={payouts}
        keyExtractor={(payout) => payout.id}
        renderItem={({ item }) => <PayoutRow payout={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            accessibilityLabel="Refresh earnings"
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {error ? (
              <Banner tone="danger" title="Could not load earnings" message={error} />
            ) : null}

            <View style={styles.tiles}>
              <StatTile
                label="Pending"
                value={formatCents(summary.pending_cents)}
                caption="On its way to you"
                emphasis
              />
              <StatTile
                label="Paid out"
                value={formatCents(summary.paid_cents)}
                caption="Already in your bank"
              />
            </View>
            <View style={styles.tiles}>
              <StatTile label="Lifetime" value={formatCents(summary.lifetime_cents)} />
              <StatTile label="Jobs completed" value={String(summary.order_count)} />
            </View>

            <Text variant="caption" color={colors.textMuted} style={styles.note}>
              {BALANCE_NOTE}
            </Text>

            <ConnectStatusCard
              onboardingDone={Boolean(profile?.stripe_onboarding_done)}
              onStart={() => void connect.start()}
              pending={connect.pending}
              error={connect.error}
            />

            <Text variant="heading" color={colors.text}>
              Payout history
            </Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} accessibilityLabel="Loading earnings" />
            </View>
          ) : (
            <EmptyState
              title="No payouts yet"
              body="Every delivered job adds a payout here — your share of the service fee, the machine cost you covered, and the full tip."
            />
          )
        }
      />
    </Screen>
  );
}

function PayoutRow({ payout }: { payout: PayoutWithOrder }) {
  const order = payout.orders;
  const when = payout.paid_at ?? payout.created_at;
  const tone = payout.status === 'paid' ? 'success' : payout.status === 'failed' || payout.status === 'reversed' ? 'danger' : 'neutral';

  return (
    <Card elevated={false}>
      <View style={styles.payoutRow}>
        <View style={styles.payoutLeft}>
          <Text variant="bodyStrong" color={colors.text}>
            {formatCents(payout.amount_cents)}
          </Text>
          <Text variant="caption" color={colors.textMuted}>
            {formatPickupTime(when)}
          </Text>
          <Text variant="micro" color={colors.textSubtle}>
            {order
              ? `${order.buildings?.name ?? 'Order'} · ${order.load_count} ${order.load_count === 1 ? 'load' : 'loads'}`
              : 'Adjustment'}
          </Text>
        </View>
        <Pill label={PAYOUT_STATUS_LABEL[payout.status] ?? payout.status} tone={tone} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flush: { padding: 0, gap: 0 },
  list: { padding: spacing.lg, gap: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  tiles: { flexDirection: 'row', gap: spacing.md },
  note: { lineHeight: 19 },
  loading: { paddingVertical: spacing.xxxl },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  payoutLeft: { flexShrink: 1, gap: spacing.xs },
});
