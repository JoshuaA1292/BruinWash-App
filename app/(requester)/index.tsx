import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Card, Screen, Text } from '@/components/ui';
import { ActiveOrderCard } from '@/features/requester/ActiveOrderCard';
import { HowItWorks } from '@/features/requester/HowItWorks';
import { PricingGlance } from '@/features/requester/PricingGlance';
import { useMyOrders } from '@/hooks/useMyOrders';
import { friendlyError } from '@/lib/errors';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme';

export default function RequesterHome() {
  const { profile } = useAuth();
  const { activeOrder, active, isLoading, error } = useMyOrders();

  const firstName = profile?.first_name?.trim();

  return (
    <Screen>
      <View style={styles.hero}>
        <Text variant="title" color={colors.text}>
          {firstName ? `Hi ${firstName}` : 'Hi there'}
        </Text>
        <Text variant="body" color={colors.textMuted}>
          A verified student washer in your building picks up your laundry and brings it back
          clean.
        </Text>
      </View>

      <Button
        label="Schedule a pickup"
        onPress={() => router.push('/(requester)/schedule')}
      />

      {!isSupabaseConfigured ? (
        <Banner
          tone="warning"
          title="Not connected"
          message="Supabase is not configured on this build, so your orders cannot load."
        />
      ) : null}

      {error ? <Banner tone="danger" title="Could not load your orders" message={friendlyError(error)} /> : null}

      {isLoading ? (
        <Card>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your orders" />
        </Card>
      ) : activeOrder ? (
        <View style={styles.section}>
          <Text variant="heading" color={colors.text}>
            {active.length > 1 ? `Your next pickup of ${active.length}` : 'Your active order'}
          </Text>
          <ActiveOrderCard order={activeOrder} />
          {active.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See all of your orders"
              onPress={() => router.push('/(requester)/orders')}
              hitSlop={8}
            >
              <Text variant="label" color={colors.primary}>
                See all {active.length} active orders ›
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Card style={styles.emptyCard}>
          <Text variant="bodyStrong" color={colors.text}>
            No pickup scheduled
          </Text>
          <Text variant="caption" color={colors.textMuted}>
            Book one and we will match you with a washer in your building.
          </Text>
        </Card>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open your notification inbox"
        onPress={() => router.push('/inbox')}
        style={({ pressed }) => (pressed ? styles.pressed : undefined)}
      >
        <Card style={styles.inboxCard}>
          <View style={styles.grow}>
            <Text variant="bodyStrong" color={colors.text}>
              Notifications
            </Text>
            <Text variant="caption" color={colors.textMuted}>
              Every update on your orders, in one place.
            </Text>
          </View>
          <Text variant="body" color={colors.textSubtle}>
            ›
          </Text>
        </Card>
      </Pressable>

      <HowItWorks />
      <PricingGlance />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm },
  section: { gap: spacing.md },
  emptyCard: { gap: spacing.xs },
  inboxCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1, gap: spacing.xs },
  pressed: { opacity: 0.9 },
});
