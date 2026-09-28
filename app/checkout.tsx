/**
 * Checkout (spec 2.4) and the Stripe payment flow (spec 2.7 / 7).
 *
 * Presented as a sheet over the Schedule screen — registered in app/_layout.tsx
 * with presentation: 'modal'. Mobile checkout never hands off to a browser.
 *
 * Every figure on this screen comes from the price_order() RPC via
 * useCheckoutQuote. @/constants/pricing only fills the summary in for the instant
 * before the first server quote lands, and the Pay button stays disabled until a
 * server quote describing exactly these options has arrived.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Card, Screen, Text } from '@/components/ui';
import { useBuilding } from '@/hooks/useBuildings';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { isStripeConfigured } from '@/providers/StripeProviderShell';
import { formatCents } from '@/constants/pricing';
import { PROMO_INVALID_MESSAGE } from '@/constants/copy';
import type { PromoVerdict } from '@/types/database';
import { colors, spacing } from '@/theme';
import {
  OrderSummary,
  PickupRecap,
  PricingBreakdownNote,
  PromoCodeField,
  SheetHeader,
  TipSelector,
  TotalsCard,
  figuresFromMirror,
  figuresFromQuote,
  parseCheckoutParams,
  quoteMatches,
  resolveTipCents,
  useCheckoutPayment,
  useCheckoutQuote,
  type CheckoutParamMap,
  type TipChoice,
} from '@/features/checkout';

export default function Checkout() {
  const params = useLocalSearchParams();
  const parsed = parseCheckoutParams(params as CheckoutParamMap);
  const { missing } = parsed;

  // The schedule screen hands over a building id; resolve the display name from
  // the cached buildings list rather than trusting a name in the URL.
  const building = useBuilding(parsed.booking.buildingId || null);
  const booking = { ...parsed.booking, buildingName: building?.name ?? parsed.booking.buildingName };

  const [promoText, setPromoText] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [appliedDiscountCents, setAppliedDiscountCents] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [applyingPromo, setApplyingPromo] = useState(false);

  const [tipChoice, setTipChoice] = useState<TipChoice>({ kind: 'none' });
  const [customTipText, setCustomTipText] = useState('');

  const payment = useCheckoutPayment();

  // --- pricing ------------------------------------------------------------
  // Percentage tips size off the pre-tip subtotal, i.e. after any discount. The
  // subtotal never depends on the tip, so reading it from the display mirror and
  // letting price_order() re-price around the chosen tip cannot oscillate — and
  // the tip is the requester's own choice, not a priced figure.
  const tipBaseCents = figuresFromMirror({
    tier: booking.tier,
    loads: booking.loads,
    pods: booking.pods,
    gloves: booking.gloves,
    tipCents: 0,
    discountCents: appliedDiscountCents,
    promoCode: appliedCode,
  }).subtotalCents;

  const tipCents = resolveTipCents(tipChoice, tipBaseCents);

  const priced = useCheckoutQuote({
    tier: booking.tier,
    loads: booking.loads,
    pods: booking.pods,
    gloves: booking.gloves,
    tipCents,
    promoCode: appliedCode,
    enabled: missing.length === 0,
  });

  // A code can expire or hit its cap between validate_promo_code() and
  // price_order(). When the server refuses it, fall back to the undiscounted
  // quote and say so, rather than leaving the Pay button stuck on a quote that
  // will never match.
  const promoRefusedByServer =
    appliedCode !== null && priced.authoritative && priced.quote.promo_valid === false;
  const effectivePromoCode = promoRefusedByServer ? null : appliedCode;

  const quoteUsable =
    priced.authoritative &&
    quoteMatches(priced.quote, {
      tier: booking.tier,
      loads: booking.loads,
      tipCents,
      promoCode: effectivePromoCode,
    });

  const figures = figuresFromQuote(priced.quote, quoteUsable);
  const repricing = priced.repricing || !quoteUsable;

  // --- promo --------------------------------------------------------------
  const applyPromo = async () => {
    const code = promoText.trim().toUpperCase();
    if (!code) return;
    setApplyingPromo(true);
    setPromoError(null);
    try {
      const { data, error } = await supabase.rpc('validate_promo_code', {
        p_code: code,
        p_subtotal_cents: figures.baseCents,
        p_tier: booking.tier,
      });
      if (error) throw error;
      const verdict = (data ?? null) as PromoVerdict | null;
      if (!verdict?.valid) {
        setPromoError(PROMO_INVALID_MESSAGE);
        return;
      }
      setAppliedCode(verdict.code ?? code);
      setAppliedDiscountCents(verdict.discount_cents ?? 0);
    } catch (err) {
      setPromoError(friendlyError(err, PROMO_INVALID_MESSAGE));
    } finally {
      setApplyingPromo(false);
    }
  };

  const removePromo = () => {
    setAppliedCode(null);
    setAppliedDiscountCents(0);
    setPromoText('');
    setPromoError(null);
  };

  // --- payment ------------------------------------------------------------
  const goToOrder = (orderId: string) => {
    router.replace({ pathname: '/order/[id]', params: { id: orderId } });
  };

  const onPay = async () => {
    const outcome = await payment.pay({
      buildingId: booking.buildingId,
      floor: booking.floor,
      roomNumber: booking.roomNumber,
      pickupAt: booking.pickupAt,
      tier: booking.tier,
      liabilityAck: booking.liabilityAck,
      loads: booking.loads,
      pods: booking.pods,
      gloves: booking.gloves,
      tipCents,
      promoCode: effectivePromoCode,
      washCycle: booking.washCycle,
      washTemp: booking.washTemp,
      dryLevel: booking.dryLevel,
      notes: booking.notes,
    });
    // 'preview' and 'cancelled' stay on the sheet and explain themselves.
    if (outcome?.kind === 'submitted') goToOrder(outcome.orderId);
  };

  // --- missing booking details -------------------------------------------
  if (missing.length > 0) {
    return (
      <View style={styles.sheet}>
        <SheetHeader title="Checkout" onClose={() => router.back()} />
        <Screen background={colors.surface}>
          <Banner
            tone="danger"
            title="Some booking details are missing"
            message={`Go back and choose your ${missing.join(', ')} before paying.`}
          />
          <Button label="Back to scheduling" variant="secondary" onPress={() => router.back()} />
        </Screen>
      </View>
    );
  }

  const blocked = !isSupabaseConfigured;
  const previewDone = payment.stage === 'preview' && payment.orderId !== null;
  const previewOrderId = payment.orderId;

  const primary = previewDone
    ? {
        label: 'View order status',
        trailing: undefined as string | undefined,
        disabled: false,
        onPress: () => {
          if (previewOrderId) goToOrder(previewOrderId);
        },
      }
    : {
        label:
          payment.stage === 'cancelled'
            ? 'Try payment again'
            : isStripeConfigured
              ? 'Pay'
              : 'Create order · preview mode',
        trailing: formatCents(figures.totalCents),
        disabled: blocked || repricing,
        onPress: onPay,
      };

  return (
    <View style={styles.sheet}>
      <SheetHeader
        title="Checkout"
        subtitle="Review your order and pay without leaving the app."
        onClose={() => router.back()}
      />

      <Screen
        background={colors.surface}
        footer={
          <View style={styles.footer}>
            {payment.error ? (
              <View accessibilityLiveRegion="polite">
                <Banner tone="danger" message={payment.error} />
              </View>
            ) : null}

            {payment.stage === 'cancelled' && !payment.error ? (
              <Banner
                tone="warning"
                message="Payment was cancelled. Your order is saved but unpaid — tap below to try again."
              />
            ) : null}

            <Button
              label={primary.label}
              trailing={primary.trailing}
              loading={payment.busy}
              disabled={primary.disabled}
              onPress={primary.onPress}
            />

            <Text variant="micro" color={colors.textSubtle} center>
              {previewDone
                ? 'This order is unpaid, so washers cannot see it yet.'
                : repricing
                  ? 'Confirming your total with CampusWash…'
                  : 'Your card is charged the total above. Washers see your order once payment clears.'}
            </Text>
          </View>
        }
      >
        {blocked ? (
          <Banner
            tone="warning"
            title="Not connected"
            message="CampusWash cannot reach its server right now, so this order cannot be placed. Check your connection and try again."
          />
        ) : null}

        {!isStripeConfigured ? (
          <Banner
            tone="warning"
            title="PREVIEW MODE — payment is not configured"
            message="No Stripe key is set on this build, so no card can be charged. Continuing creates a real, server-priced order so you can walk the rest of the flow; it stays unpaid, and washers will not see it."
          />
        ) : null}

        {previewDone ? (
          <Card>
            <View style={styles.previewDone}>
              <Text variant="heading">Order created in preview mode</Text>
              <Text variant="body" color={colors.textMuted}>
                Your order was saved and priced by the server, but it is unpaid because payment is
                not configured on this build. Add a Stripe publishable key to charge cards.
              </Text>
            </View>
          </Card>
        ) : null}

        <PickupRecap booking={booking} />

        <OrderSummary booking={booking} figures={figures} />

        <PricingBreakdownNote />

        <PromoCodeField
          code={promoText}
          onChangeCode={setPromoText}
          onApply={applyPromo}
          onRemove={removePromo}
          applying={applyingPromo}
          appliedCode={effectivePromoCode}
          appliedDiscountCents={figures.discountCents}
          error={promoRefusedByServer ? PROMO_INVALID_MESSAGE : promoError}
          disabled={blocked || payment.busy}
        />

        <TipSelector
          choice={tipChoice}
          onChange={setTipChoice}
          subtotalCents={tipBaseCents}
          customText={customTipText}
          onChangeCustomText={setCustomTipText}
          disabled={payment.busy}
        />

        <TotalsCard figures={figures} repricing={repricing} />

        {priced.error ? (
          <Banner
            tone="danger"
            title="We could not confirm your total"
            message={friendlyError(
              priced.error,
              'We could not confirm your total just now. Check your connection and try again.',
            )}
          >
            <Button label="Retry pricing" variant="secondary" onPress={priced.refetch} />
          </Banner>
        ) : null}

        <Text variant="caption" color={colors.textMuted}>
          {`You acknowledged the liability and care-of-items terms, including the ${formatCents(
            priced.quote.liability_cap_cents,
          )} damage cap.`}
        </Text>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.surface },
  footer: { gap: spacing.sm },
  previewDone: { gap: spacing.md },
});
