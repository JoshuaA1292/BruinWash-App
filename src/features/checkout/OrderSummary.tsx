import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { DEFAULT_WASH_SETTINGS, PRICING, TIERS, formatCents } from '@/constants/pricing';
import { colors, spacing } from '@/theme';
import { Divider, LineItem } from './LineItem';
import { serviceFeePerLoadCents, type CheckoutFigures } from './figures';
import type { CheckoutBooking } from './params';

interface Props {
  booking: CheckoutBooking;
  figures: CheckoutFigures;
}

/** Spec 2.4: the itemised order summary, matching the web checkout. */
export function OrderSummary({ booking, figures }: Props) {
  const tier = TIERS.find((t) => t.id === booking.tier);
  const loads = Math.max(booking.loads, 1);
  const loadSuffix = loads > 1 ? ` · ${loads} loads` : '';
  const washSettings = [
    booking.washCycle || DEFAULT_WASH_SETTINGS.cycle,
    booking.washTemp || DEFAULT_WASH_SETTINGS.temp,
    booking.dryLevel || DEFAULT_WASH_SETTINGS.level,
  ].join(' • ');

  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="heading">Order Summary</Text>

        <LineItem
          label={`${tier?.name ?? 'Laundry service'}${loadSuffix}`}
          sublabel={`${formatCents(serviceFeePerLoadCents(booking.tier))} service fee per load`}
          value={formatCents(figures.serviceFeeCents)}
        />

        <LineItem
          label="Wash & Dry Machine Cost"
          sublabel={`${formatCents(PRICING.machineCostCents)} per load`}
          value={formatCents(figures.machineCostCents)}
        />

        <LineItem label="Wash settings" value={washSettings} />

        {booking.pods ? (
          <LineItem
            label="Detergent Pods"
            sublabel={`${formatCents(PRICING.addonDetergentPodsCents)} per load`}
            value={formatCents(PRICING.addonDetergentPodsCents * loads)}
          />
        ) : null}

        {booking.gloves ? (
          <LineItem
            label="Gloves"
            sublabel="Flat add-on"
            value={formatCents(PRICING.addonGlovesCents)}
          />
        ) : null}

        {figures.discountCents > 0 ? (
          <>
            <Divider />
            <LineItem
              label={figures.promoCode ? `Promo code ${figures.promoCode}` : 'Promo discount'}
              value={`−${formatCents(figures.discountCents)}`}
              credit
            />
          </>
        ) : null}

        <Divider />
        <Text variant="caption" color={colors.textMuted}>
          Pickup and return happen at the end of the hall, not at your door.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
});
