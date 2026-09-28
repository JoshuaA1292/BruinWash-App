import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Card, Text } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { useSignedUrl } from './useSignedUrl';

interface Props {
  /** Object path inside the private 'delivery-proof' bucket. */
  photoPath: string;
  deliveredAt: string | null;
}

/** Proof-of-delivery photo the washer uploaded when closing out the order. */
export function DeliveryProof({ photoPath, deliveredAt }: Props) {
  const { url, loading, failed } = useSignedUrl('delivery-proof', photoPath);

  return (
    <Card>
      <Text variant="heading">Delivery photo</Text>
      <Text variant="caption" color={colors.textMuted} style={styles.caption}>
        {deliveredAt
          ? `Your washer left your laundry ${formatRelative(deliveredAt)}.`
          : 'Your washer photographed the drop-off.'}
      </Text>

      <View style={styles.frame}>
        {url ? (
          <Image
            source={{ uri: url }}
            style={styles.photo}
            contentFit="cover"
            transition={150}
            accessible
            accessibilityRole="image"
            accessibilityLabel="Photo of your delivered laundry"
          />
        ) : (
          <View style={styles.placeholder} accessible accessibilityLabel="Delivery photo">
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text variant="caption" color={colors.textSubtle} center>
                {failed ? 'This photo could not be loaded.' : 'No photo available.'}
              </Text>
            )}
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  caption: { marginTop: spacing.xs, lineHeight: 18 },
  frame: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  photo: { width: '100%', aspectRatio: 4 / 3 },
  placeholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
});
