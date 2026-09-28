import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Field, Screen, Text } from '@/components/ui';
import { BuildingPicker } from '@/components/BuildingPicker';
import {
  AddOnRow,
  CancellationPolicyLink,
  LiabilityDisclosure,
  LoadStepper,
  PickupTimePicker,
  Section,
  TierToggle,
  defaultPickupAt,
  earliestPickupAt,
  isInPast,
  latestPickupAt,
} from '@/features/schedule';
import { useBuildings } from '@/hooks/useBuildings';
import { usePriceQuote } from '@/hooks/usePriceQuote';
import { useAuth } from '@/providers/AuthProvider';
import { PRICING, formatCents } from '@/constants/pricing';
import { friendlyError } from '@/lib/errors';
import { formatPickupTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { ServiceTier } from '@/types/database';

function parseTier(raw: string | string[] | undefined): ServiceTier {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'standard' ? 'standard' : 'full';
}

/**
 * Schedule Pickup (spec 2.3) — the primary booking surface, mirroring
 * campuswash.app/schedule?tier=full.
 *
 * This screen NEVER creates the order and never decides what anything costs.
 * It collects options, asks price_order() for the figure on the CTA, and hands
 * the options to the checkout modal, which creates the order after payment.
 */
export default function SchedulePickup() {
  const params = useLocalSearchParams<{ tier?: string }>();
  const { profile } = useAuth();
  const buildingsQuery = useBuildings();

  // ?tier=full deep-links exactly as the web URL does; Full is the default.
  const [tier, setTier] = useState<ServiceTier>(() => parseTier(params.tier));
  // The profile arrives from context and can land after the first render, so
  // these three fields are DERIVED: an explicit edit wins, otherwise fall back
  // to the profile. Syncing the profile into state with an effect instead would
  // set state during the effect body and cascade renders.
  const [buildingEdit, setBuildingEdit] = useState<string | null>(null);
  const [floorEdit, setFloorEdit] = useState<string | null>(null);
  const [roomEdit, setRoomEdit] = useState<string | null>(null);

  const buildingId = buildingEdit ?? profile?.building_id ?? null;
  const floor = floorEdit ?? profile?.floor ?? '';
  const roomNumber = roomEdit ?? profile?.room_number ?? '';
  const [pickupAt, setPickupAt] = useState<Date>(() => defaultPickupAt());
  const [loads, setLoads] = useState(1);
  const [pods, setPods] = useState(false);
  const [gloves, setGloves] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { quote, isEstimate, error: priceError } = usePriceQuote({
    tier,
    loads,
    pods,
    gloves,
  });

  const minimumDate = useMemo(() => earliestPickupAt(), []);
  const maximumDate = useMemo(() => latestPickupAt(), []);

  const buildingError = submitted && !buildingId ? 'Please choose your building.' : null;
  const floorError = submitted && floor.trim().length === 0 ? 'Floor is required.' : null;
  // create_order() refuses a pickup at or before now(), so block it here too.
  const pickupError = isInPast(pickupAt) ? 'Pickup time must be in the future.' : null;

  const ready =
    Boolean(buildingId) && floor.trim().length > 0 && !pickupError && acknowledged;

  const handleContinue = () => {
    setSubmitted(true);
    if (!buildingId || floor.trim().length === 0 || pickupError || !acknowledged) return;

    router.push({
      pathname: '/checkout',
      params: {
        building_id: buildingId,
        floor: floor.trim(),
        room_number: roomNumber.trim(),
        pickup_at: pickupAt.toISOString(),
        tier,
        loads: String(loads),
        pods: pods ? 'true' : 'false',
        gloves: gloves ? 'true' : 'false',
        liability_ack: 'true',
      },
    });
  };

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button
            label="Continue to Checkout"
            trailing={formatCents(quote.cta_cents)}
            onPress={handleContinue}
            disabled={!ready}
          />
          <Text variant="micro" color={colors.textMuted} center>
            {acknowledged
              ? `Before tip${isEstimate ? ' · estimated' : ''} · ${formatPickupTime(pickupAt.toISOString())}`
              : 'Acknowledge the liability terms to continue'}
          </Text>
        </View>
      }
    >
      <View style={styles.intro}>
        <Text variant="title">Schedule a Pickup</Text>
        <Text variant="caption" color={colors.textMuted}>
          A verified student washer in your building collects your laundry and brings it back clean.
        </Text>
      </View>

      {buildingsQuery.error ? (
        <Banner tone="danger" title="Couldn't load buildings" message={friendlyError(buildingsQuery.error)} />
      ) : null}

      <Section title="Pickup Details">
        <BuildingPicker
          value={buildingId}
          onChange={(building) => setBuildingEdit(building.id)}
          error={buildingError}
        />

        <Field
          label="Floor"
          value={floor}
          onChangeText={setFloorEdit}
          placeholder="e.g. 4"
          keyboardType="default"
          returnKeyType="next"
          maxLength={12}
          error={floorError}
        />

        <Field
          label="Room Number"
          optional
          value={roomNumber}
          onChangeText={setRoomEdit}
          placeholder="e.g. 412B"
          maxLength={12}
          hint="Shared with your washer only after they accept."
        />

        <PickupTimePicker
          value={pickupAt}
          onChange={setPickupAt}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          error={pickupError}
        />
      </Section>

      <Section title="Laundry Details">
        <TierToggle value={tier} onChange={setTier} />
        <LoadStepper value={loads} onChange={setLoads} />

        <View style={styles.addons}>
          <Text variant="label">Add-ons</Text>
          <AddOnRow
            label="Detergent pods"
            price={`${formatCents(PRICING.addonDetergentPodsCents)} / load`}
            checked={pods}
            onChange={setPods}
          />
          <AddOnRow
            label="Gloves"
            price={formatCents(PRICING.addonGlovesCents)}
            checked={gloves}
            onChange={setGloves}
          />
        </View>
      </Section>

      <LiabilityDisclosure
        acknowledged={acknowledged}
        onChange={setAcknowledged}
        capCents={quote.liability_cap_cents}
      />

      {priceError ? (
        <Banner
          tone="warning"
          title="Showing an estimated price"
          message={`${friendlyError(priceError)} The exact total is confirmed at checkout.`}
        />
      ) : null}

      <CancellationPolicyLink />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xs },
  footer: { gap: spacing.sm },
  addons: { gap: spacing.md },
});
