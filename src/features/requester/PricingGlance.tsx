import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { PRICING_BREAKDOWN_NOTE } from '@/constants/copy';
import { formatCents, PRICING, TIERS } from '@/constants/pricing';
import { colors, radius, spacing } from '@/theme';

/**
 * Pricing at a glance. These figures mirror public.pricing_config for display
 * only — price_order() on the server is what an order is actually charged.
 */
export function PricingGlance() {
  return (
    <Card style={styles.card}>
      <Text variant="heading" color={colors.text}>
        Pricing at a glance
      </Text>

      {TIERS.map((tier) => (
        <View key={tier.id} style={styles.tier}>
          <View style={styles.tierHead}>
            <Text variant="bodyStrong" color={colors.text}>
              {tier.name}
            </Text>
            {tier.popular ? (
              <View style={styles.tag}>
                <Text variant="micro" color={colors.primaryDark}>
                  MOST POPULAR
                </Text>
              </View>
            ) : null}
            <View style={styles.spacer} />
            <Text variant="bodyStrong" color={colors.primary}>
              {formatCents(PRICING.serviceFeeCents[tier.id])}
            </Text>
          </View>
          <Text variant="caption" color={colors.textMuted}>
            {tier.includes} · {tier.tagline}
          </Text>
        </View>
      ))}

      <Text variant="caption" color={colors.textMuted}>
        Plus {formatCents(PRICING.machineCostCents)} machine cost per load.
      </Text>
      <Text variant="caption" color={colors.textSubtle} style={styles.note}>
        {PRICING_BREAKDOWN_NOTE}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  tier: { gap: spacing.xs },
  tierHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  spacer: { flex: 1 },
  tag: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  note: { lineHeight: 18 },
});
