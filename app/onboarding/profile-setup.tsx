import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Card, Checkbox, Field, Screen, Text } from '@/components/ui';
import { BuildingPicker } from '@/components/BuildingPicker';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme';

/**
 * Shown to a signed-in student whose profile has no building or no first name —
 * the root layout's setup guard sends them here and nothing else is reachable
 * until it is filled in, because a washer without a building can never be
 * matched and a requester without one cannot schedule.
 *
 * This writes public.profiles directly, which RLS allows for your own row. It
 * deliberately never sends role, edu_email or any stripe_* column: the
 * profiles_guard trigger rejects the whole update if it sees them change.
 */
export default function ProfileSetup() {
  const { profile, session, isWasher, refreshProfile } = useAuth();

  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [buildingId, setBuildingId] = useState<string | null>(profile?.building_id ?? null);
  const [floor, setFloor] = useState(profile?.floor ?? '');
  const [roomNumber, setRoomNumber] = useState(profile?.room_number ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [canTakeFemaleOnly, setCanTakeFemaleOnly] = useState(profile?.is_female ?? false);
  const [femaleWashersOnly, setFemaleWashersOnly] = useState(profile?.female_washers_only ?? false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(
    () =>
      Boolean(session) &&
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      Boolean(buildingId) &&
      floor.trim().length > 0,
    [session, firstName, lastName, buildingId, floor],
  );

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'Please enter your first name.';
    if (!lastName.trim()) next.lastName = 'Please enter your last name.';
    if (!buildingId) next.building = 'Choose the building you live in.';
    if (!floor.trim()) next.floor = 'Which floor are you on?';
    const digits = phone.replace(/\D/g, '');
    if (phone.trim() && digits.length < 10) next.phone = 'Enter a 10-digit phone number.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    setFormError(null);
    const userId = session?.user.id;
    if (!userId) {
      setFormError('Your session expired. Please log in again.');
      return;
    }
    if (!validate()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          building_id: buildingId,
          floor: floor.trim(),
          room_number: roomNumber.trim() || null,
          phone: phone.trim() || null,
          ...(isWasher ? { is_female: canTakeFemaleOnly } : { female_washers_only: femaleWashersOnly }),
        })
        .eq('id', userId);

      if (error) {
        setFormError(friendlyError(error, 'We could not save your profile. Please try again.'));
        return;
      }

      await refreshProfile();
      router.replace('/');
    } catch (err) {
      setFormError(friendlyError(err, 'We could not save your profile. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <Button
          label="Save and continue"
          onPress={() => void save()}
          loading={saving}
          disabled={!canSubmit}
        />
      }
    >
      <View style={styles.intro}>
        <Text variant="title" color={colors.text}>
          Where do we find you?
        </Text>
        <Text variant="caption" color={colors.textMuted} style={styles.line}>
          {isWasher
            ? 'You only ever see orders in your own building, so we need to know which one it is.'
            : 'Washers in your building pick up and return at the end of your hall, never at your door.'}
        </Text>
      </View>

      {formError ? <Banner tone="danger" title="Could not save" message={formError} /> : null}

      <Card>
        <View style={styles.form}>
          <Field
            label="First name"
            value={firstName}
            onChangeText={setFirstName}
            error={fieldErrors.firstName}
            placeholder="Alex"
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
          />
          <Field
            label="Last name"
            value={lastName}
            onChangeText={setLastName}
            error={fieldErrors.lastName}
            hint="Other students only ever see your first name."
            placeholder="Nguyen"
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
          />
          <BuildingPicker
            value={buildingId}
            onChange={(building) => {
              setBuildingId(building.id);
              setFieldErrors((prev) => ({ ...prev, building: '' }));
            }}
            error={fieldErrors.building || null}
          />
          <Field
            label="Floor"
            value={floor}
            onChangeText={setFloor}
            error={fieldErrors.floor}
            placeholder="4"
            keyboardType="default"
            autoCapitalize="characters"
          />
          <Field
            label="Room number"
            value={roomNumber}
            onChangeText={setRoomNumber}
            optional
            hint="Only the washer who accepts your order sees this, and never anyone else. Pickup still happens at the end of the hall."
            placeholder="412B"
            autoCapitalize="characters"
          />
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            error={fieldErrors.phone}
            optional
            hint="For urgent order issues only. All normal messaging happens in the app."
            placeholder="(310) 555-0134"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />
        </View>
      </Card>

      <Card>
        <View style={styles.form}>
          <Text variant="heading" color={colors.text}>
            Safety preference
          </Text>
          {isWasher ? (
            <Checkbox
              checked={canTakeFemaleOnly}
              onChange={setCanTakeFemaleOnly}
              label="I can take female-only requests"
            />
          ) : (
            <Checkbox
              checked={femaleWashersOnly}
              onChange={setFemaleWashersOnly}
              label="Only let female washers accept my orders"
            />
          )}
          <Text variant="micro" color={colors.textSubtle} style={styles.line}>
            {isWasher
              ? 'Turning this on lets you accept orders from students who asked for a female washer. It is checked on the server when you accept.'
              : 'Your orders will only be accepted by washers who have confirmed this. It is enforced on the server, not just in the app.'}
          </Text>
        </View>
      </Card>

      {profile?.edu_email ? (
        <Text variant="micro" color={colors.textSubtle} center style={styles.line}>
          Signed in as {profile.edu_email}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xs },
  form: { gap: spacing.lg },
  line: { lineHeight: 18 },
});
