import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Card, Screen, Text } from '@/components/ui';
import { WasherCard } from '@/components/WasherCard';
import {
  CancelledNotice,
  CancelOrderDialog,
  DeliveryProof,
  OrderDetailsCard,
  OrderTotalsCard,
  StageTracker,
  StatusHero,
  hasPaymentFailed,
  isAwaitingPayment,
  isCancellable,
} from '@/features/order';
import { useCancelOrder, useOrder } from '@/hooks/useOrder';
import { useOrderRealtime } from '@/hooks/useOrderRealtime';
import { friendlyError } from '@/lib/errors';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radius, spacing } from '@/theme';

/**
 * Order status tracking (spec 2.5) plus the washer visibility card (spec 3.1).
 * Everything on this screen is read from the order row the server wrote; the
 * only mutation available here is the cancel_order RPC.
 */
export default function OrderStatusScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = params.id;
  const orderId = Array.isArray(rawId) ? rawId[0] : rawId;

  const { session } = useAuth();
  const { data: order, isPending, error, refetch, isRefetching } = useOrder(orderId);
  const { live } = useOrderRealtime(orderId);
  const cancel = useCancelOrder(orderId);

  const [confirmVisible, setConfirmVisible] = useState(false);

  if (!isSupabaseConfigured) {
    return (
      <Screen>
        <Banner
          tone="warning"
          title="Not connected"
          message="Supabase is not configured on this build, so live order tracking is unavailable."
        />
      </Screen>
    );
  }

  if (!orderId) {
    return (
      <Screen>
        <Banner
          tone="danger"
          title="Order not found"
          message="This link is missing an order reference."
        />
      </Screen>
    );
  }

  if (isPending) {
    return (
      <Screen scroll={false} contentStyle={styles.centre}>
        <ActivityIndicator
          color={colors.primary}
          accessibilityLabel="Loading your order"
        />
      </Screen>
    );
  }

  if (error || !order) {
    return (
      <Screen>
        <Banner
          tone="danger"
          title={error ? 'Could not load this order' : 'Order not found'}
          message={
            error
              ? friendlyError(error)
              : 'This order either no longer exists or is not yours to view.'
          }
        />
        <Button
          label="Try again"
          variant="secondary"
          loading={isRefetching}
          onPress={() => void refetch()}
        />
      </Screen>
    );
  }

  const viewerId = session?.user.id ?? null;
  const viewerIsRequester = Boolean(viewerId) && order.requester_id === viewerId;
  const viewerIsWasher = Boolean(viewerId) && order.washer_id === viewerId;

  const cancelled = order.status === 'cancelled';
  const delivered = order.status === 'delivered';
  const awaitingPayment = isAwaitingPayment(order);
  const paymentFailed = hasPaymentFailed(order);
  const canCancel = isCancellable(order.status) && (viewerIsRequester || viewerIsWasher);

  // The card appears the instant a washer accepts and stays for the rest of the
  // order's life. One-way only: a washer never sees a requester card.
  const showWasherCard = Boolean(order.washer_id) && viewerIsRequester && !cancelled;
  const chatAvailable = Boolean(order.washer_id) && !cancelled;

  const onConfirmCancel = () => {
    cancel.mutate(undefined, {
      onSuccess: () => setConfirmVisible(false),
    });
  };

  return (
    <Screen
      footer={
        delivered && viewerIsRequester ? (
          <Button
            label="Rate your washer"
            onPress={() =>
              router.push({ pathname: '/order/[id]/rate', params: { id: order.id } })
            }
          />
        ) : undefined
      }
    >
      {cancelled ? (
        <CancelledNotice order={order} cancelledByYou={order.cancelled_by === viewerId} />
      ) : (
        <>
          <StatusHero
            order={order}
            awaitingPayment={awaitingPayment}
            paymentFailed={paymentFailed}
            live={live}
          />

          {paymentFailed ? (
            <Banner
              tone="danger"
              title="We could not take payment"
              message="Nothing has been charged and no washer has been assigned. Cancel this order and book again when your card is ready."
            />
          ) : null}

          {order.en_route_at && order.status === 'accepted' ? (
            <Banner
              tone="info"
              title="Your washer is on the way"
              message="Have your laundry ready at the end of the hall."
            />
          ) : null}

          {showWasherCard ? <WasherCard washerId={order.washer_id as string} orderId={order.id} /> : null}

          <Card>
            <Text variant="heading">Progress</Text>
            <View style={styles.tracker}>
              <StageTracker order={order} awaitingPayment={awaitingPayment} />
            </View>
          </Card>
        </>
      )}

      {delivered && order.delivery_photo_path ? (
        <DeliveryProof photoPath={order.delivery_photo_path} deliveredAt={order.delivered_at} />
      ) : null}

      {chatAvailable ? (
        <Pressable
          onPress={() => router.push({ pathname: '/order/[id]/chat', params: { id: order.id } })}
          accessibilityRole="button"
          accessibilityLabel="Open messages for this order"
          accessibilityHint="Opens the chat thread with the other side of this order"
          style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
        >
          <View style={styles.linkText}>
            <Text variant="bodyStrong">Messages</Text>
            <Text variant="caption" color={colors.textMuted}>
              {viewerIsWasher ? 'Chat with your requester' : 'Chat with your washer'}
            </Text>
          </View>
          <Text variant="heading" color={colors.primary}>
            ›
          </Text>
        </Pressable>
      ) : null}

      <OrderDetailsCard order={order} />
      <OrderTotalsCard order={order} />

      {canCancel ? (
        <Button
          label="Cancel this order"
          variant="ghost"
          onPress={() => setConfirmVisible(true)}
        />
      ) : null}

      <CancelOrderDialog
        visible={confirmVisible}
        status={order.status}
        pickupAt={order.pickup_at}
        submitting={cancel.isPending}
        errorMessage={cancel.error ? friendlyError(cancel.error) : null}
        onDismiss={() => setConfirmVisible(false)}
        onConfirm={onConfirmCancel}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  tracker: { marginTop: spacing.lg },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  linkRowPressed: { backgroundColor: colors.primarySoft },
  linkText: { gap: spacing.xs / 2 },
});
