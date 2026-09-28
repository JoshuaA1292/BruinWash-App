import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { PRICING, formatCents } from '@/constants/pricing';
import { colors, spacing } from '@/theme';
import { Divider, LineItem } from './LineItem';
import type { CheckoutFigures } from './figures';

interface Props {
  figures: CheckoutFigures;
  /** True while price_order() is in flight. */
  repricing: boolean;
}

const PROCESSING_LABEL = `${(PRICING.processingRate * 100).toFixed(1)}% + ${formatCents(
  PRICING.processingFlatCents,
)}`;

export function TotalsCard({ figures, repricing }: Props) {
  return (
    <Card>
      <View style={styles.stack}>
        <LineItem label="Subtotal" value={formatCents(figures.subtotalCents)} />
        <LineItem label="Tip for washer" value={formatCents(figures.tipCents)} />
        <LineItem
          label="Processing fee"
          sublabel={PROCESSING_LABEL}
          value={formatCents(figures.processingFeeCents)}
        />
        <Divider />
        <LineItem label="Total" value={formatCents(figures.totalCents)} emphasis />

        <View style={styles.footnote} accessibilityLiveRegion="polite">
          {repricing ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          <Text variant="caption" color={colors.textMuted}>
            {repricing
              ? 'Updating your total…'
              : figures.authoritative
                ? 'Total confirmed by CampusWash. You are charged this exact amount.'
                : 'Estimated total — confirming with CampusWash…'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  footnote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
