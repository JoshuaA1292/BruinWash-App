import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Card, Field, Screen, Text } from '@/components/ui';
import { CANCELLATION_POLICY, SAFETY_NOTES } from '@/constants/copy';
import { BulletList, LinkRow, ToggleRow } from '@/features/requester/SettingsRows';
import { useBuildings } from '@/hooks/useBuildings';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radius, spacing } from '@/theme';
import type { Profile } from '@/types/database';

/**
 * Profile and preferences.
 *
 * A user may update their OWN profiles row (profiles_update_self), but
 * guard_profile_privileges() rejects any change to role, the stripe_* columns or
 * edu_email — so those are never in a payload from this screen.
 */
interface Draft {
  firstName: string;
  lastName: string;
  buildingId: string | null;
  floor: string;
  room: string;
  phone: string;
}

function draftFromProfile(profile: Profile | null): Draft {
  return {
    firstName: profile?.first_name ?? '',
    lastName: profile?.last_name ?? '',
    buildingId: profile?.building_id ?? null,
    floor: profile?.floor ?? '',
    room: profile?.room_number ?? '',
    phone: profile?.phone ?? '',
  };
}

export default function RequesterSettings() {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const { data: buildings } = useBuildings();

  // The form is DERIVED from the profile rather than copied into state by an
  // effect: `draft` stays null until the user types, and is cleared after a save
  // so the freshly refreshed profile becomes the new baseline.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showSafety, setShowSafety] = useState(false);

  const baseline = useMemo(() => draftFromProfile(profile), [profile]);
  const form = draft ?? baseline;
  const update = (patch: Partial<Draft>) => setDraft({ ...form, ...patch });

  const { firstName, lastName, buildingId, floor, room, phone } = form;

  const dirty = useMemo(
    () =>
      Boolean(profile) &&
      (form.firstName.trim() !== baseline.firstName ||
        form.lastName.trim() !== baseline.lastName ||
        form.buildingId !== baseline.buildingId ||
        form.floor.trim() !== baseline.floor ||
        form.room.trim() !== baseline.room ||
        form.phone.trim() !== baseline.phone),
    [baseline, form, profile],
  );

  const userId = session?.user.id;

  const patchProfile = async (patch: Record<string, unknown>) => {
    if (!userId) return false;
    setError(null);
    const { error: updateError } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (updateError) {
      setError(friendlyError(updateError));
      return false;
    }
    await refreshProfile();
    return true;
  };

  const onSave = async () => {
    if (!firstName.trim()) {
      setError('Please enter your first name.');
      return;
    }
    if (!buildingId) {
      setError('Pick the building you live in so washers can find you.');
      return;
    }
    setSaving(true);
    const ok = await patchProfile({
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      building_id: buildingId,
      floor: floor.trim() || null,
      room_number: room.trim() || null,
      phone: phone.trim() || null,
    });
    setSaving(false);
    if (ok) {
      setDraft(null);
      setSavedAt(Date.now());
    }
  };

  const onToggleFemaleOnly = async (next: boolean) => {
    await patchProfile({ female_washers_only: next });
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'You will need your .edu email to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen>
      <Card style={styles.card}>
        <Text variant="heading" color={colors.text}>
          {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Your profile'}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {profile?.edu_email ?? session?.user.email ?? ''}
        </Text>
        <Text variant="caption" color={colors.textSubtle}>
          Verified student account. Your .edu address cannot be changed here.
        </Text>
      </Card>

      {error ? <Banner tone="danger" title="Could not save" message={error} /> : null}
      {savedAt && !dirty && !error ? (
        <Banner tone="success" title="Saved" message="Your profile is up to date." />
      ) : null}

      <Card style={styles.card}>
        <Text variant="heading" color={colors.text}>
          Your details
        </Text>
        <Field label="First name" value={firstName} onChangeText={(next) => update({ firstName: next })} autoCapitalize="words" />
        <Field
          label="Last name"
          optional
          value={lastName}
          onChangeText={(next) => update({ lastName: next })}
          autoCapitalize="words"
        />

        <View style={styles.pickerBlock}>
          <Text variant="label" color={colors.text}>
            Building
          </Text>
          <View style={styles.chips}>
            {(buildings ?? []).map((building) => {
              const selected = building.id === buildingId;
              return (
                <Pressable
                  key={building.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={`Building ${building.name}`}
                  onPress={() => update({ buildingId: building.id })}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    variant="caption"
                    color={selected ? colors.textOnPrimary : colors.text}
                  >
                    {building.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Field
              label="Floor"
              value={floor}
              onChangeText={(next) => update({ floor: next })}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={styles.rowItem}>
            <Field label="Room" optional value={room} onChangeText={(next) => update({ room: next })} />
          </View>
        </View>

        <Field
          label="Phone"
          optional
          value={phone}
          onChangeText={(next) => update({ phone: next })}
          keyboardType="phone-pad"
          hint="Only used if your washer cannot reach you in the app."
        />

        <Button
          label="Save changes"
          onPress={() => void onSave()}
          loading={saving}
          disabled={!dirty}
        />
      </Card>

      <Card style={styles.card}>
        <Text variant="heading" color={colors.text}>
          Preferences
        </Text>
        <ToggleRow
          label="Female washers only"
          description="Only washers who identify as female will see your orders."
          value={profile?.female_washers_only ?? false}
          onChange={(next) => void onToggleFemaleOnly(next)}
        />
        <LinkRow
          label="Notifications"
          onPress={() => router.push('/settings/notifications')}
          accessibilityHint="Choose which updates you get"
        />
      </Card>

      <Card style={styles.card}>
        <LinkRow
          label="Cancellation policy"
          value={showPolicy ? 'Hide' : 'View'}
          onPress={() => setShowPolicy((s) => !s)}
        />
        {showPolicy ? <BulletList items={CANCELLATION_POLICY} /> : null}
        <LinkRow
          label="Safety on CampusWash"
          value={showSafety ? 'Hide' : 'View'}
          onPress={() => setShowSafety((s) => !s)}
        />
        {showSafety ? <BulletList items={SAFETY_NOTES} /> : null}
      </Card>

      <Button label="Sign out" variant="secondary" onPress={confirmSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  pickerBlock: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.8 },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
});
