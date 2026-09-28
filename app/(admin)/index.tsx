import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Banner, Card, Screen, Text } from '@/components/ui';
import { formatCents } from '@/constants/pricing';
import { AdminOrderRow } from '@/features/admin/AdminOrderRow';
import { StatusChips } from '@/features/admin/StatusChips';
import { SummaryTile } from '@/features/admin/SummaryTile';
import { useAdminOrders, type AdminStatusFilter } from '@/hooks/useAdminOrders';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme';

/**
 * The admin order dashboard (spec 5).
 *
 * Read-only by design: every state change still goes through the order RPCs from
 * the order detail screen, so there is no way to nudge an order from here.
 */
export default function AdminDashboard() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<AdminStatusFilter>('all');
  const { orders, allOrders, summary, counts, isLoading, isRefetching, error, refetch } =
    useAdminOrders(filter);

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="title" color={colors.text}>
          Orders
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh the dashboard"
          onPress={() => void refetch()}
          hitSlop={8}
        >
          <Text variant="label" color={colors.primary}>
            {isRefetching ? 'Refreshing…' : 'Refresh'}
          </Text>
        </Pressable>
      </View>

      <Text variant="caption" color={colors.textMuted}>
        Signed in as {profile?.first_name ?? 'admin'} · live via Realtime · newest first
      </Text>

      {error ? (
        <Banner tone="danger" title="Could not load orders" message={friendlyError(error)} />
      ) : null}

      <View style={styles.tiles}>
        <SummaryTile label="Orders today" value={String(summary.todayCount)} hint="Since midnight" />
        <SummaryTile
          label="Gross today"
          value={formatCents(summary.todayGrossCents)}
          hint="Excludes cancelled"
        />
        <SummaryTile
          label="Unclaimed"
          value={String(summary.unclaimedCount)}
          hint="Pending, no washer"
        />
        <SummaryTile
          label="Gross loaded"
          value={formatCents(summary.totalGrossCents)}
          hint={`Last ${allOrders.length} orders`}
        />
      </View>

      <StatusChips value={filter} counts={counts} onChange={setFilter} />

      {isLoading ? (
        <Card>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading orders" />
        </Card>
      ) : orders.length === 0 ? (
        <Card style={styles.empty}>
          <Text variant="bodyStrong" color={colors.text}>
            Nothing here
          </Text>
          <Text variant="caption" color={colors.textMuted}>
            No orders match this filter yet.
          </Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {orders.map((order) => (
            <AdminOrderRow key={order.id} order={order} />
          ))}
        </View>
      )}

      <Card style={styles.backlog}>
        <Text variant="heading" color={colors.text}>
          Backlog
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          Promo-code management and dispute resolution are not built yet. Promo codes are created
          directly in public.promo_codes and disputes are resolved in public.disputes; both are
          admin-only tables today.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="About the backlog sections"
          onPress={() =>
            Alert.alert(
              'Not built yet',
              'Promo codes and dispute resolution are tracked as backlog for the admin app. ' +
                'Until then they are handled in the Supabase dashboard.',
            )
          }
          hitSlop={8}
        >
          <Text variant="label" color={colors.primary}>
            Why? ›
          </Text>
        </Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  list: { gap: spacing.md },
  empty: { gap: spacing.xs },
  backlog: { gap: spacing.sm },
});
