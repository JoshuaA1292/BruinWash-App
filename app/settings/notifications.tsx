import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Banner, Button, Card, Screen, Text } from '@/components/ui';
import { ToggleRow } from '@/features/requester/SettingsRows';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { usePushNotifications } from '@/providers/NotificationsProvider';
import { colors, spacing } from '@/theme';
import type { NotificationPrefs } from '@/types/database';

/**
 * Notification preferences.
 *
 * profiles.notification_prefs is a jsonb object with exactly four keys; the
 * database reads it when fanning out the automated messages from
 * public.message_templates, so the whole object is written back each time rather
 * than a partial patch. Nothing here touches role, stripe_* or edu_email.
 */
const DEFAULT_PREFS: NotificationPrefs = {
  order_updates: true,
  new_orders: true,
  chat_messages: true,
  marketing: false,
};

export default function NotificationSettings() {
  const { profile, session, refreshProfile, isWasher } = useAuth();
  const { permission, token, register } = usePushNotifications();

  const [saving, setSaving] = useState<keyof NotificationPrefs | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushNote, setPushNote] = useState<string | null>(null);

  const prefs: NotificationPrefs = { ...DEFAULT_PREFS, ...(profile?.notification_prefs ?? {}) };
  const granted = permission === 'granted';

  const setPref = async (key: keyof NotificationPrefs, next: boolean) => {
    const userId = session?.user.id;
    if (!userId) return;
    setError(null);
    setSaving(key);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ notification_prefs: { ...prefs, [key]: next } })
      .eq('id', userId);
    setSaving(null);
    if (updateError) {
      setError(friendlyError(updateError));
      return;
    }
    await refreshProfile();
  };

  const onEnablePush = async () => {
    setAsking(true);
    setPushNote(null);
    const ok = await register();
    setAsking(false);
    if (!ok) {
      setPushNote(
        'Push could not be enabled. Simulators cannot receive push, and if you previously ' +
          'declined you will need to allow notifications for CampusWash in your device settings.',
      );
    }
  };

  return (
    <Screen>
      {error ? <Banner tone="danger" title="Could not save" message={error} /> : null}

      <Card style={styles.card}>
        <Text variant="heading" color={colors.text}>
          Push notifications
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {granted
            ? 'This device is registered for push. Order updates arrive even when the app is closed.'
            : permission === 'denied'
              ? 'Notifications are turned off for CampusWash in your device settings.'
              : 'Allow notifications so you hear the moment a washer claims your order.'}
        </Text>
        {granted ? (
          <Text variant="micro" color={colors.textSubtle}>
            {token ? 'Device registered' : 'Permission granted — registering this device'}
          </Text>
        ) : (
          <Button
            label="Turn on notifications"
            onPress={() => void onEnablePush()}
            loading={asking}
            variant="secondary"
          />
        )}
        {pushNote ? <Banner tone="warning" message={pushNote} /> : null}
      </Card>

      <Card style={styles.card}>
        <Text variant="heading" color={colors.text}>
          What we send you
        </Text>

        <ToggleRow
          label="Order updates"
          description="Accepted, picked up, washing, on the way back, delivered."
          value={prefs.order_updates}
          onChange={(next) => void setPref('order_updates', next)}
          disabled={saving === 'order_updates'}
        />

        {isWasher ? (
          <ToggleRow
            label="New orders in your building"
            description="A heads-up when an unclaimed order appears where you live."
            value={prefs.new_orders}
            onChange={(next) => void setPref('new_orders', next)}
            disabled={saving === 'new_orders'}
          />
        ) : null}

        <ToggleRow
          label="Messages"
          description="When the other person on an order sends you a message."
          value={prefs.chat_messages}
          onChange={(next) => void setPref('chat_messages', next)}
          disabled={saving === 'chat_messages'}
        />

        <ToggleRow
          label="News and offers"
          description="Occasional promos and campus announcements. Off by default."
          value={prefs.marketing}
          onChange={(next) => void setPref('marketing', next)}
          disabled={saving === 'marketing'}
        />
      </Card>

      <Text variant="caption" color={colors.textSubtle}>
        Turning something off here stops the message entirely — the app will not push it and it
        will not appear in your inbox.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
});
