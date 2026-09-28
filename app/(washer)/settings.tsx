import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Card, Checkbox, Screen, Text } from '@/components/ui';
import { ConnectStatusCard, DetailRow, useConnectOnboarding } from '@/features/washer';
import { useMyBuilding } from '@/features/washer/useMyBuilding';
import { friendlyError } from '@/lib/errors';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme';

const FEMALE_ONLY_LABEL = 'I can take female-only requests';
const FEMALE_ONLY_NOTE =
  'Some requesters ask for a female washer only. accept_order() checks this flag on your profile, so turning it off removes those orders from your list.';

/** Washer settings: profile summary, matching preference, payouts, sign out. */
export default function WasherSettingsScreen() {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const { data: building } = useMyBuilding();
  const connect = useConnectOnboarding();

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');

  const setFemaleWasher = async (next: boolean) => {
    if (!session?.user.id || !isSupabaseConfigured) return;
    setSaving(true);
    setSaveError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ is_female: next })
      .eq('id', session.user.id);

    if (error) setSaveError(friendlyError(error));
    else await refreshProfile();
    setSaving(false);
  };

  return (
    <Screen>
      <Card>
        <Text variant="heading" color={colors.text}>
          {fullName || 'Your profile'}
        </Text>
        <View style={styles.details}>
          <DetailRow label="Role" value="Washer" />
          <DetailRow label="Verified email" value={profile?.edu_email ?? '—'} />
          <DetailRow label="Building" value={building?.name ?? 'Not set'} />
          <DetailRow label="Floor" value={profile?.floor ?? 'Not set'} />
          {profile?.phone ? <DetailRow label="Phone" value={profile.phone} /> : null}
        </View>
        <Text variant="caption" color={colors.textSubtle} style={styles.note}>
          You only ever see orders in your own building, and never the name or room of the student
          who booked them.
        </Text>
      </Card>

      <Card>
        <Text variant="heading" color={colors.text}>
          Matching
        </Text>
        <View style={styles.toggle}>
          <Checkbox
            checked={Boolean(profile?.is_female)}
            onChange={(next) => void setFemaleWasher(next)}
            label={FEMALE_ONLY_LABEL}
            disabled={saving || !isSupabaseConfigured}
          />
        </View>
        <Text variant="caption" color={colors.textMuted} style={styles.note}>
          {FEMALE_ONLY_NOTE}
        </Text>
        {saveError ? (
          <Banner tone="danger" title="Could not save that" message={saveError} />
        ) : null}
      </Card>

      <ConnectStatusCard
        onboardingDone={Boolean(profile?.stripe_onboarding_done)}
        onStart={() => void connect.start()}
        pending={connect.pending}
        error={connect.error}
      />

      <Button
        label="Notification settings"
        variant="secondary"
        onPress={() => router.push('/settings/notifications')}
      />

      <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  details: { gap: spacing.sm, marginTop: spacing.md },
  note: { lineHeight: 19, marginTop: spacing.md },
  toggle: { marginTop: spacing.md },
});
