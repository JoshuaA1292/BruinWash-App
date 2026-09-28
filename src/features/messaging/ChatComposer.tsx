import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { MESSAGE_MAX_LENGTH } from '@/hooks/useChat';
import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  onSend: (body: string) => void;
  sending: boolean;
  /** Mirrors the messages_insert RLS gate: washer assigned, order not cancelled. */
  enabled: boolean;
  disabledReason?: string | null;
  error?: string | null;
}

export function ChatComposer({ onSend, sending, enabled, disabledReason, error }: Props) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const tooLong = trimmed.length > MESSAGE_MAX_LENGTH;
  const canSubmit = enabled && !sending && trimmed.length > 0 && !tooLong;

  const submit = () => {
    if (!canSubmit) return;
    onSend(trimmed);
    setDraft('');
  };

  if (!enabled) {
    return (
      <View style={styles.closed}>
        <Text variant="caption" color={colors.textMuted} center>
          {disabledReason ?? 'Messaging is not available for this order.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {error ? (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : null}
      {tooLong ? (
        <Text variant="caption" color={colors.danger}>
          {`Messages are limited to ${MESSAGE_MAX_LENGTH} characters.`}
        </Text>
      ) : null}
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message"
          placeholderTextColor={colors.textSubtle}
          multiline
          maxLength={MESSAGE_MAX_LENGTH}
          accessibilityLabel="Message"
          accessibilityHint="Type a message to send about this order"
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={submit}
        />
        <Button
          label="Send"
          onPress={submit}
          disabled={!canSubmit}
          loading={sending}
          fullWidth={false}
          style={styles.send}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.body.fontSize,
  },
  send: { paddingHorizontal: spacing.lg },
  closed: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
});
