import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Card, Field, Screen, Text } from '@/components/ui';
import { EDU_EMAIL_HINT } from '@/constants/copy';
import { friendlyError } from '@/lib/errors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme';

/**
 * Email + password. On success the AuthProvider's onAuthStateChange listener
 * updates the session and the root layout's guards move the student on, so
 * there is nothing to navigate here.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = isSupabaseConfigured && email.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) setFormError(friendlyError(error, 'We could not log you in. Please try again.'));
    } catch (err) {
      setFormError(friendlyError(err, 'We could not log you in. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      footer={
        <Button
          label="Log in"
          onPress={() => void submit()}
          loading={submitting}
          disabled={!canSubmit}
        />
      }
    >
      <View style={styles.intro}>
        <Text variant="title" color={colors.text}>
          Welcome back
        </Text>
        <Text variant="caption" color={colors.textMuted} style={styles.line}>
          Log in with the college email you verified.
        </Text>
      </View>

      {formError ? <Banner tone="danger" title="Log in failed" message={formError} /> : null}

      <Card>
        <View style={styles.form}>
          <Field
            label="College email"
            value={email}
            onChangeText={setEmail}
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
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
        </View>
      </Card>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Create a new account"
        onPress={() => router.push({ pathname: '/(auth)/signup', params: { role: 'requester' } })}
        hitSlop={8}
        style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
      >
        <Text variant="caption" color={colors.textMuted}>
          New to CampusWash?{' '}
        </Text>
        <Text variant="bodyStrong" color={colors.primary}>
          Create an account
        </Text>
      </Pressable>

      <Text variant="micro" color={colors.textSubtle} center style={styles.line}>
        {EDU_EMAIL_HINT}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xs },
  form: { gap: spacing.lg },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  line: { lineHeight: 18 },
});
