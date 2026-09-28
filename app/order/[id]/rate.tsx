import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Card, Field, Screen, Stars, Text } from '@/components/ui';
import { WasherIdentity } from '@/features/messaging';
import { useOrder } from '@/hooks/useOrder';
import { useWasherCard, washerCardKey } from '@/hooks/useWasherCard';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme';
import type { Review } from '@/types/database';

/**
 * The post-delivery rating prompt (spec 3.5). Presented as a modal, reached from
 * the delivered notification or the order screen.
 *
 * Writes go through the submit_review RPC only — `authenticated` has no insert
 * or update on public.reviews. The RPC refuses anything but the requester's own
 * delivered order and upserts on order_id, so re-rating edits the existing
 * review instead of stacking a second one.
 */
const COMMENT_MAX_LENGTH = 1000;
const DISMISS_DELAY_MS = 1400;

export default function RateWasher() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: order, isLoading: orderLoading, error: orderError } = useOrder(id);
  const { data: washerCard } = useWasherCard(order?.washer_id);

  const existingReview = useQuery<Review | null>({
    queryKey: ['review', id ?? null],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('order_id', id as string)
        .maybeSingle();
      if (error) throw error;
      return (data as Review | null) ?? null;
    },
  });

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);
  const prefilled = useRef(false);

  // Prefill once so an edit starts from what the washer was already given.
  useEffect(() => {
    const review = existingReview.data;
    if (!review || prefilled.current) return;
    prefilled.current = true;
    setRating(review.rating);
    setComment(review.comment ?? '');
  }, [existingReview.data]);

  const dismiss = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (id) {
      router.replace({ pathname: '/order/[id]', params: { id } });
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('submit_review', {
        p_order_id: id as string,
        p_rating: rating,
        p_comment: comment.trim() ? comment.trim() : null,
      });
      if (error) throw error;
      return data as Review;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['review', id ?? null] });
      if (order?.washer_id) {
        void queryClient.invalidateQueries({ queryKey: washerCardKey(order.washer_id) });
      }
      setDone(true);
    },
  });

  // Brief thank-you, then back to the order.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(dismiss, DISMISS_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (orderLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (orderError || !order) {
    return (
      <Screen>
        <Banner
          tone="danger"
          title="Order not found"
          message={friendlyError(orderError, 'We could not open this order.')}
        />
        <Button label="Close" variant="secondary" onPress={dismiss} />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <Text variant="display">🌟</Text>
          <Text variant="title" center>
            Thanks for rating
          </Text>
          <Text variant="caption" color={colors.textMuted} center>
            {`Your ${rating}-star rating is now part of ${
              washerCard?.first_name ?? 'your washer'
            }'s score.`}
          </Text>
        </View>
      </Screen>
    );
  }

  const notDelivered = order.status !== 'delivered';
  const noWasher = !order.washer_id;
  const blocked = notDelivered || noWasher;

  return (
    <Screen
      footer={
        <Button
          label={existingReview.data ? 'Update rating' : 'Submit rating'}
          onPress={() => submit.mutate()}
          disabled={blocked || rating < 1}
          loading={submit.isPending}
        />
      }
    >
      {blocked ? (
        <Banner
          tone="warning"
          title={noWasher ? 'No washer to rate' : 'Not delivered yet'}
          message={
            noWasher
              ? 'This order was never accepted by a washer, so there is nobody to rate.'
              : 'You can rate your washer once your laundry is back at your door.'
          }
        />
      ) : null}

      <Card>
        <WasherIdentity
          card={washerCard}
          subtitle="Delivered your laundry"
          size={56}
        />
      </Card>

      <View style={styles.block}>
        <Text variant="title" center>
          How did it go?
        </Text>
        <Text variant="caption" color={colors.textMuted} center style={styles.blurb}>
          {`Your rating becomes part of ${
            washerCard?.first_name ?? 'your washer'
          }'s public star score, which every student in your building sees before they get matched.`}
        </Text>
        <View style={styles.stars}>
          <Stars rating={rating} size={40} onRate={setRating} />
        </View>
        <Text variant="caption" color={colors.textSubtle} center>
          {rating > 0 ? RATING_WORDS[rating] ?? '' : 'Tap a star to rate'}
        </Text>
      </View>

      <Field
        label="Add a review"
        optional
        value={comment}
        onChangeText={setComment}
        placeholder="Folded neatly and right on time…"
        multiline
        maxLength={COMMENT_MAX_LENGTH}
        style={styles.comment}
        hint="Kept between you, your washer, and CampusWash support."
      />

      {submit.error ? (
        <Banner
          tone="danger"
          title="Rating not saved"
          message={friendlyError(submit.error, 'We could not save your rating.')}
        />
      ) : null}

      <Button label="Not now" variant="ghost" onPress={dismiss} />
    </Screen>
  );
}

const RATING_WORDS: Record<number, string> = {
  1: 'Something went wrong',
  2: 'Below what you expected',
  3: 'Got the job done',
  4: 'Great service',
  5: 'Perfect — would request again',
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  block: { gap: spacing.md, alignItems: 'stretch' },
  blurb: { lineHeight: 19 },
  stars: { alignItems: 'center', paddingVertical: spacing.sm },
  comment: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
});
