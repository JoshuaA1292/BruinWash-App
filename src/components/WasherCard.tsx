import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Card, Stars, Text } from '@/components/ui';
import { useSignedUrl } from '@/features/order/useSignedUrl';
import { useWasherCard } from '@/hooks/useWasherCard';
import { formatRating } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

interface Props {
  /** orders.washer_id — set the moment accept_order() succeeds. */
  washerId: string;
  /** Needed for the Message affordance's deep link. */
  orderId: string;
  /** Hide the chat affordance where a thread makes no sense. */
  showMessage?: boolean;
}

/**
 * The Uber-style washer visibility card (spec 3.1). FIRST NAME ONLY, straight
 * from the public.washer_cards view — the requester never learns the washer's
 * full identity, and there is deliberately no mirror card for the washer.
 */
export function WasherCard({ washerId, orderId, showMessage = true }: Props) {
  const { data: card, isPending } = useWasherCard(washerId);
  const { url: avatarUrl } = useSignedUrl('avatars', card?.avatar_url);

  if (isPending) {
    return (
      <Card>
        <View style={styles.loading} accessible accessibilityLabel="Loading your washer">
          <ActivityIndicator color={colors.primary} />
        </View>
      </Card>
    );
  }

  if (!card) return null;

  const name = card.first_name?.trim() || 'Your washer';
  const isNew = card.review_count === 0;
  const rating = formatRating(card.avg_rating);

  const openChat = () => {
    router.push({ pathname: '/order/[id]/chat', params: { id: orderId } });
  };

  const summary = isNew
    ? `${name} is your washer. New washer, no ratings yet.`
    : `${name} is your washer. Rated ${rating} from ${card.review_count} reviews, ${card.completed_orders} orders completed.`;

  return (
    <Card>
      <Text variant="micro" color={colors.textSubtle}>
        YOUR WASHER
      </Text>

      <View style={styles.row}>
        <View style={styles.avatarWrap} accessible accessibilityLabel={`${name}'s profile photo`}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.avatar, styles.initials]}>
              <Text variant="title" color={colors.textOnPrimary}>
                {name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.identity} accessible accessibilityLabel={summary}>
          <Text variant="title" numberOfLines={1}>
            {name}
          </Text>

          {isNew ? (
            <View style={styles.newChip}>
              <Text variant="micro" color={colors.primaryDark}>
                NEW WASHER
              </Text>
            </View>
          ) : (
            <View style={styles.ratingRow}>
              <Stars rating={card.avg_rating} size={15} />
              <Text variant="bodyStrong">{rating}</Text>
              <Text variant="caption" color={colors.textSubtle}>
                ({card.review_count})
              </Text>
            </View>
          )}

          <Text variant="caption" color={colors.textMuted}>
            {card.completed_orders} {card.completed_orders === 1 ? 'order' : 'orders'} completed
          </Text>
        </View>

        {showMessage ? (
          <Pressable
            onPress={openChat}
            accessibilityRole="button"
            accessibilityLabel={`Message ${name}`}
            accessibilityHint="Opens your chat thread for this order"
            hitSlop={spacing.sm}
            style={({ pressed }) => [styles.message, pressed && styles.messagePressed]}
          >
            <Text variant="label" color={colors.primary}>
              Message
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const AVATAR = 64;

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: radius.pill },
  initials: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flex: 1, gap: spacing.xs },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  newChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  message: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  messagePressed: { backgroundColor: colors.primarySoft, opacity: 0.9 },
});
