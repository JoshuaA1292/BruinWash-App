import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Stars, Text } from '@/components/ui';
import { formatRating } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { WasherCard } from '@/types/database';

interface Props {
  /** From the washer_cards view: FIRST NAME ONLY, never a full profile. */
  card: WasherCard | null | undefined;
  /** Fallback used before the card loads, or for a washer viewing the thread. */
  fallbackName?: string;
  subtitle?: string;
  showRating?: boolean;
  size?: number;
}

/**
 * The one-way identity strip. There is no requester equivalent by design: a
 * washer only ever sees a neutral label for the person they are washing for.
 */
export function WasherIdentity({
  card,
  fallbackName = 'Your washer',
  subtitle,
  showRating = true,
  size = 48,
}: Props) {
  const name = card?.first_name ?? fallbackName;
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <View style={styles.row}>
      {card?.avatar_url ? (
        <Image
          source={{ uri: card.avatar_url }}
          style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
          contentFit="cover"
          accessibilityLabel={`${name}'s profile photo`}
        />
      ) : (
        <View
          style={[styles.avatar, styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}
        >
          <Text variant="heading" color={colors.primary}>
            {initial}
          </Text>
        </View>
      )}

      <View style={styles.meta}>
        <Text variant="bodyStrong">{name}</Text>
        {showRating && card ? (
          <View style={styles.ratingRow}>
            <Stars rating={card.avg_rating} size={13} />
            <Text variant="caption" color={colors.textMuted}>
              {`${formatRating(card.avg_rating)} · ${card.review_count} ${
                card.review_count === 1 ? 'review' : 'reviews'
              }`}
            </Text>
          </View>
        ) : null}
        {subtitle ? (
          <Text variant="caption" color={colors.textMuted}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { backgroundColor: colors.primarySoft },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryLight,
    borderRadius: radius.pill,
  },
  meta: { flex: 1, gap: spacing.xs / 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
