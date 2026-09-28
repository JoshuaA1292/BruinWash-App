import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Card, Field, Screen, Text } from '@/components/ui';
import { formatCents, PRICING } from '@/constants/pricing';
import { StatusPill } from '@/features/requester/StatusPill';
import { friendlyError } from '@/lib/errors';
import { formatPickupTime, formatRelative } from '@/lib/format';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radius, spacing } from '@/theme';
import type { Dispute, DisputeStatus, Order } from '@/types/database';

/**
 * In-app mediation request (spec 2.7).
 *
 * disputes is the one table a participant writes to directly: disputes_insert
 * allows an insert where opened_by = auth.uid() and the caller is on the order.
 * Users can never update or delete a dispute — an admin resolves it.
 */

const CATEGORIES: readonly { id: string; label: string; hint: string }[] = [
  { id: 'damaged', label: 'Something was damaged', hint: 'Shrunk, torn, stained or discoloured.' },
  { id: 'lost', label: 'Something is missing', hint: 'An item did not come back.' },
  { id: 'late', label: 'Late pickup or return', hint: 'The washer did not turn up on time.' },
  { id: 'not_cleaned', label: 'Not cleaned properly', hint: 'Came back damp, dirty or unwashed.' },
  { id: 'conduct', label: 'Washer conduct', hint: 'How you were treated during the handoff.' },
  { id: 'other', label: 'Something else', hint: 'Anything the options above do not cover.' },
];

const STATUS_COPY: Record<DisputeStatus, string> = {
  open: 'Open — waiting on the CampusWash team',
  reviewing: 'Under review by the CampusWash team',
  resolved: 'Resolved',
  rejected: 'Closed without action',
};

type DisputeOrder = Pick<
  Order,
  'id' | 'status' | 'tier' | 'total_cents' | 'liability_cap_cents' | 'pickup_at'
> & { buildings: { name: string } | null };

export default function ReportIssue() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === 'string' ? id : '';
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const enabled = isSupabaseConfigured && Boolean(orderId);

  const orderQuery = useQuery<DisputeOrder | null, Error>({
    queryKey: ['dispute', 'order', orderId],
    enabled,
    queryFn: async () => {
      const { data, error: qError } = await supabase
        .from('orders')
        .select('id, status, tier, total_cents, liability_cap_cents, pickup_at, buildings ( name )')
        .eq('id', orderId)
        .maybeSingle();
      if (qError) throw new Error(qError.message);
      return (data as unknown as DisputeOrder | null) ?? null;
    },
  });

  const disputesQuery = useQuery<Dispute[], Error>({
    queryKey: ['disputes', orderId],
    enabled,
    queryFn: async () => {
      const { data, error: qError } = await supabase
        .from('disputes')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      if (qError) throw new Error(qError.message);
      return (data ?? []) as unknown as Dispute[];
    },
  });

  const submit = useMutation<void, Error>({
    mutationFn: async () => {
      const openedBy = session?.user.id;
      if (!openedBy) throw new Error('You need to be signed in to report an issue.');
      if (!category) throw new Error('Pick what went wrong first.');
      const { error: insertError } = await supabase.from('disputes').insert({
        order_id: orderId,
        opened_by: openedBy,
        category,
        description: description.trim(),
      });
      if (insertError) throw new Error(insertError.message);
    },
    onSuccess: async () => {
      setSubmitted(true);
      setDescription('');
      setCategory(null);
      await queryClient.invalidateQueries({ queryKey: ['disputes', orderId] });
    },
    onError: (e) => setError(friendlyError(e)),
  });

  const onSubmit = () => {
    setError(null);
    if (!category) {
      setError('Pick what went wrong so we can route this to the right place.');
      return;
    }
    if (description.trim().length < 20) {
      setError('Please describe what happened in a little more detail (at least 20 characters).');
      return;
    }
    submit.mutate();
  };

  const capCents = orderQuery.data?.liability_cap_cents ?? PRICING.liabilityCapCents;
  const openDispute = (disputesQuery.data ?? []).find(
    (d) => d.status === 'open' || d.status === 'reviewing',
  );

  if (orderQuery.isLoading || disputesQuery.isLoading) {
    return (
      <Screen scroll={false} contentStyle={styles.centre}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading this order" />
      </Screen>
    );
  }

  return (
    <Screen>
      {orderQuery.data ? (
        <Card style={styles.card}>
          <View style={styles.headRow}>
            <StatusPill status={orderQuery.data.status} />
            <Text variant="bodyStrong" color={colors.text}>
              {formatCents(orderQuery.data.total_cents)}
            </Text>
          </View>
          <Text variant="caption" color={colors.textMuted}>
            {orderQuery.data.buildings?.name ?? 'Your building'} · pickup{' '}
            {formatPickupTime(orderQuery.data.pickup_at)}
          </Text>
        </Card>
      ) : null}

      {(disputesQuery.data ?? []).length > 0 ? (
        <Card style={styles.card}>
          <Text variant="heading" color={colors.text}>
            Reports on this order
          </Text>
          {(disputesQuery.data ?? []).map((dispute) => (
            <View key={dispute.id} style={styles.disputeRow}>
              <Text variant="bodyStrong" color={colors.text}>
                {CATEGORIES.find((c) => c.id === dispute.category)?.label ?? dispute.category}
              </Text>
              <Text variant="caption" color={colors.textMuted}>
                {STATUS_COPY[dispute.status]} · opened {formatRelative(dispute.created_at)}
              </Text>
              {dispute.resolution ? (
                <Text variant="caption" color={colors.text}>
                  {dispute.resolution}
                </Text>
              ) : null}
              {dispute.refund_cents > 0 ? (
                <Text variant="caption" color={colors.success}>
                  {formatCents(dispute.refund_cents)} refunded
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Banner tone="warning" title={`Claims are capped at ${formatCents(capCents)}`}>
        <Text variant="caption" color={colors.text} style={styles.bannerBody}>
          CampusWash is a platform that connects students, so we mediate between you and your
          washer rather than acting as an insurer. The cap sits with your washer, not with
          CampusWash. We read every report, usually reply within two business days, and may issue a
          partial or full refund where it is warranted.
        </Text>
      </Banner>

      {submitted ? (
        <>
          <Banner
            tone="success"
            title="Report received"
            message="Our team will look at this and get back to you in the app."
          />
          <Button label="Done" onPress={() => router.back()} />
        </>
      ) : (
        <Card style={styles.card}>
          <Text variant="heading" color={colors.text}>
            What went wrong?
          </Text>

          {openDispute ? (
            <Banner
              tone="info"
              message="You already have an open report on this order. Adding another is fine if something new came up."
            />
          ) : null}

          <View style={styles.options}>
            {CATEGORIES.map((option) => {
              const selected = option.id === category;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={option.label}
                  accessibilityHint={option.hint}
                  onPress={() => setCategory(option.id)}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.optionSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text variant="bodyStrong" color={selected ? colors.primaryDark : colors.text}>
                    {option.label}
                  </Text>
                  <Text variant="caption" color={colors.textMuted}>
                    {option.hint}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label="What happened?"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            style={styles.textarea}
            placeholder="Tell us what you sent, what came back, and what you would like us to do."
            hint="Include item names and anything the washer told you."
          />

          {error ? <Banner tone="danger" message={error} /> : null}

          <Button
            label="Submit report"
            onPress={onSubmit}
            loading={submit.isPending}
            disabled={!orderId}
          />
          <Text variant="micro" color={colors.textSubtle}>
            A report cannot be edited once sent, so double-check the details.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  card: { gap: spacing.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  disputeRow: { gap: spacing.xs },
  bannerBody: { lineHeight: 19 },
  options: { gap: spacing.sm },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.85 },
  textarea: { minHeight: 110, paddingTop: spacing.md, textAlignVertical: 'top' },
});
