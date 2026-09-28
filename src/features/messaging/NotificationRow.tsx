import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { AppNotification } from '@/types/database';

interface Props {
  notification: AppNotification;
  onPress: (notification: AppNotification) => void;
  /** False when the row references no order and therefore cannot deep-link. */
  linkable?: boolean;
}

export function NotificationRow({ notification, onPress, linkable = true }: Props) {
  const unread = !notification.read_at;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}. ${notification.body}. ${formatRelative(
        notification.created_at,
      )}.${unread ? ' Unread.' : ''}`}
      accessibilityHint={linkable ? 'Opens the order this update belongs to' : undefined}
      onPress={() => onPress(notification)}
      style={({ pressed }) => [styles.row, unread && styles.unread, pressed && styles.pressed]}
    >
      <View style={styles.dotColumn}>
        <View style={[styles.dot, unread ? styles.dotOn : styles.dotOff]} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant={unread ? 'bodyStrong' : 'body'} style={styles.title} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text variant="micro" color={colors.textSubtle}>
            {formatRelative(notification.created_at)}
          </Text>
        </View>
        <Text variant="caption" color={colors.textMuted} style={styles.message}>
          {notification.body}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  unread: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight },
  pressed: { opacity: 0.8 },
  dotColumn: { paddingTop: spacing.xs + 1 },
  dot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.pill },
  dotOn: { backgroundColor: colors.primary },
  dotOff: { backgroundColor: colors.border },
  body: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  message: { lineHeight: 18 },
});
