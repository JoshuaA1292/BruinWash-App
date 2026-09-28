import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Card, Screen, Text } from '@/components/ui';
import { OrderHistoryRow } from '@/features/requester/OrderHistoryRow';
import { useMyOrders } from '@/hooks/useMyOrders';
import { friendlyError } from '@/lib/errors';
import { colors, spacing } from '@/theme';

export default function RequesterOrders() {
  const { orders, active, past, isLoading, error } = useMyOrders();

  const awaitingRating = past.filter(
    (o) => o.status === 'delivered' && !o.reviewed && Boolean(o.washer_id),
  );

  if (isLoading) {
    return (
      <Screen scroll={false} contentStyle={styles.centre}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your orders" />
      </Screen>
    );
  }

  return (
    <Screen>
      {error ? (
        <Banner tone="danger" title="Could not load your orders" message={friendlyError(error)} />
      ) : null}

      {awaitingRating.length > 0 ? (
        <Banner
          tone="info"
          title={
            awaitingRating.length === 1
              ? 'One order is waiting on your rating'
              : `${awaitingRating.length} orders are waiting on your rating`
          }
          message="Ratings are how washers build their reputation on campus."
        />
      ) : null}

      {orders.length === 0 ? (
        <Card style={styles.empty}>
          <Text variant="heading" color={colors.text}>
            No orders yet
          </Text>
          <Text variant="caption" color={colors.textMuted}>
            Your laundry history will live here. Schedule your first pickup and a verified washer
            in your building will take it from there.
          </Text>
          <Button label="Schedule a pickup" onPress={() => router.push('/(requester)/schedule')} />
        </Card>
      ) : null}

      {active.length > 0 ? (
        <View style={styles.section}>
          <Text variant="heading" color={colors.text}>
            Active
          </Text>
          {active.map((order) => (
            <OrderHistoryRow key={order.id} order={order} />
          ))}
        </View>
      ) : null}

      {past.length > 0 ? (
        <View style={styles.section}>
          <Text variant="heading" color={colors.text}>
            Past orders
          </Text>
          {past.map((order) => (
            <OrderHistoryRow key={order.id} order={order} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.md },
  empty: { gap: spacing.md },
});
