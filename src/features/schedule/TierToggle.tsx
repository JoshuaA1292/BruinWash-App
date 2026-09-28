import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { PRICING, TIERS, formatCents } from '@/constants/pricing';
import { colors, radius, spacing } from '@/theme';
import type { ServiceTier } from '@/types/database';

interface Props {
  value: ServiceTier;
  onChange: (tier: ServiceTier) => void;
}

/**
 * Standard (Wash & Dry) vs Full (Wash, Dry & Fold), with the live site's names,
 * taglines and "Most popular" flag. The per-load figure is the display mirror of
 * pricing_config — the amount actually charged comes from price_order().
 */
export function TierToggle({ value, onChange }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Pricing tier">
      {TIERS.map((tier) => {
        const active = tier.id === value;
        return (
          <Pressable
            key={tier.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${tier.name}, ${formatCents(
              PRICING.serviceFeeCents[tier.id],
            )} per load. ${tier.tagline}${tier.popular ? '. Most popular' : ''}`}
            onPress={() => onChange(tier.id)}
            style={({ pressed }) => [
              styles.card,
              active && styles.cardActive,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.radioCol}>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active ? <View style={styles.radioDot} /> : null}
              </View>
            </View>

            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text variant="bodyStrong" color={active ? colors.primary : colors.text}>
                  {tier.name}
                </Text>
                {tier.popular ? (
                  <View style={styles.badge}>
                    <Text variant="micro" color={colors.textOnPrimary}>
                      Most popular
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text variant="caption" color={colors.textMuted}>
                {tier.tagline}
              </Text>
              <Text variant="caption" color={colors.textSubtle}>
                {tier.includes}
              </Text>
            </View>

            <View style={styles.priceCol}>
              <Text variant="bodyStrong" color={active ? colors.primary : colors.text}>
                {formatCents(PRICING.serviceFeeCents[tier.id])}
              </Text>
              <Text variant="micro" color={colors.textSubtle}>
                per load
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  cardActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.8 },
  radioCol: { paddingTop: spacing.xs / 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  body: { flex: 1, gap: spacing.xs / 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  priceCol: { alignItems: 'flex-end' },
});
