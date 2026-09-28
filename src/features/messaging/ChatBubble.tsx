import React from 'react';
import { StyleSheet, View } from 'react-native';
import { format } from 'date-fns';
import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';
import type { Message } from '@/types/database';

interface Props {
  message: Message;
  mine: boolean;
  /** Shown above the other party's bubble: a first name, or a neutral label. */
  senderLabel: string;
  /** Hide the sender label when the previous bubble was from the same side. */
  showSender?: boolean;
}

export function ChatBubble({ message, mine, senderLabel, showSender = true }: Props) {
  const timestamp = format(new Date(message.created_at), 'h:mm a');

  return (
    <View style={[styles.wrap, mine ? styles.wrapMine : styles.wrapTheirs]}>
      {showSender ? (
        <Text variant="micro" color={colors.textSubtle}>
          {mine ? 'You' : senderLabel}
        </Text>
      ) : null}
      <View
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
        accessibilityRole="text"
        accessibilityLabel={`${mine ? 'You' : senderLabel} at ${timestamp}: ${message.body}`}
      >
        <Text color={mine ? colors.textOnPrimary : colors.text} style={styles.body}>
          {message.body}
        </Text>
      </View>
      <Text variant="micro" color={colors.textSubtle}>
        {timestamp}
        {mine && message.read_at ? ' · Read' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: '84%', gap: spacing.xs / 2 },
  wrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  wrapTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: radius.sm / 2,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm / 2,
  },
  body: { lineHeight: 21 },
});
