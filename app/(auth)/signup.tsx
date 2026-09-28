import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Card, Field, Screen, Text } from '@/components/ui';
import { EDU_EMAIL_HINT } from '@/constants/copy';
import { friendlyError, isEduEmail } from '@/lib/errors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme';
import type { UserRole } from '@/types/database';

const MIN_PASSWORD = 8;

const ROLE_COPY: Record<'requester' | 'washer', { eyebrow: string; blurb: string; cta: string }> = {
  requester: {
    eyebrow: 'Get your laundry done',
    blurb:
      'Schedule a pickup, and a verified student washer in your building brings your laundry back clean.',
    cta: 'Create my account',
  },
  washer: {
    eyebrow: 'Become a washer',
    blurb:
      'Earn money washing laundry loads for students in your own building. You only ever see orders in your building.',
    cta: 'Start washing',
  },
};

/**
 * Dual signup. The ?role= param decides which of the two web CTAs the student
 * came from; it is passed to Supabase as user metadata because
 * handle_new_user() reads raw_user_meta_data.role to set the profile role.
 * Nothing here writes to public.profiles — the trigger owns that row.
 */
export default function Signup() {
  const params = useLocalSearchParams<{ role?: string }>();
  const role: Extract<UserRole, 'requester' | 'washer'> =
    params.role === 'washer' ? 'washer' : 'requester';
  const copy = ROLE_COPY[role];

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  const canSubmit = useMemo(
    () =>
      isSupabaseConfigured &&
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length > 0,
    [firstName, lastName, email, password],
  );

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'Please enter your first name.';
    if (!lastName.trim()) next.lastName = 'Please enter your last name.';
    if (!isEduEmail(email)) next.email = EDU_EMAIL_HINT;
    if (password.length < MIN_PASSWORD) {
      next.password = `Use at least ${MIN_PASSWORD} characters.`;
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            role,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });

      if (error) {
        // handle_new_user() raises inside the auth.users insert, which GoTrue
        // reports as a generic database failure. The only thing it rejects is a
        // non-.edu address, so say that instead of leaking the plumbing.
        const raw = error.message.toLowerCase();
        setFormError(
          raw.includes('database error')
            ? EDU_EMAIL_HINT
            : friendlyError(error, 'We could not create your account. Please try again.'),
        );
        return;
      }

      // No session means email confirmation is on: stay put and tell them to
      // check their inbox. With a session, the root layout routes them onward.
      if (!data.session) setAwaitingVerification(true);
    } catch (err) {
      setFormError(friendlyError(err, 'We could not create your account. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (awaitingVerification) {
    return (
      <Screen>
        <Card>
          <View style={styles.confirmation}>
            <Text variant="title" color={colors.text}>
              Check your .edu inbox
            </Text>
            <Text variant="body" color={colors.textMuted} style={styles.line}>
              We sent a verification link to {email.trim().toLowerCase()}. Tap it to confirm your
              college email, then come back and log in.
            </Text>
            <Banner
              tone="info"
              message="Verifying your .edu address is what keeps CampusWash students-only. No anonymous accounts."
            />
            <Button label="Back to log in" onPress={() => router.replace('/(auth)/login')} />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          label={copy.cta}
          onPress={() => void submit()}
          loading={submitting}
          disabled={!canSubmit}
        />
      }
    >
      <View style={styles.intro}>
        <Text variant="micro" color={colors.primary} style={styles.eyebrow}>
          {copy.eyebrow.toUpperCase()}
        </Text>
        <Text variant="title" color={colors.text}>
          Create your account
        </Text>
        <Text variant="caption" color={colors.textMuted} style={styles.line}>
          {copy.blurb}
        </Text>
      </View>

      {formError ? <Banner tone="danger" title="Sign up failed" message={formError} /> : null}

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
            returnKeyType="next"
          />
          <Field
            label="Last name"
            value={lastName}
            onChangeText={setLastName}
            error={fieldErrors.lastName}
            placeholder="Nguyen"
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
            returnKeyType="next"
          />
          <Field
            label="College email"
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
            hint={EDU_EMAIL_HINT}
            placeholder="you@ucla.edu"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
            hint={`At least ${MIN_PASSWORD} characters.`}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
        </View>
      </Card>

      <Text variant="micro" color={colors.textSubtle} center style={styles.line}>
        Only your first name is ever shown to other students.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xs },
  eyebrow: { letterSpacing: 1.2 },
  form: { gap: spacing.lg },
  confirmation: { gap: spacing.lg },
  line: { lineHeight: 20 },
});
