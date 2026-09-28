import React, { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Screen, Text } from '@/components/ui';
import { MessagingEmpty, NotificationRow } from '@/features/messaging';
import {
  notificationTarget,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationFeed,
} from '@/hooks/useNotificationFeed';
import { friendlyError } from '@/lib/errors';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, spacing } from '@/theme';
import type { AppNotification } from '@/types/database';

/**
 * The system notification inbox (spec 3.2 / 3.3).
 *
 * Automated order updates only. The manual requester <-> washer thread lives at
 * /order/[id]/chat and is never mixed in here — useNotificationFeed drops the
 * push-only rows that a chat message writes.
 */
export default function Inbox() {
  const { data, isLoading, isRefetching, refetch, error } = useNotificationFeed();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = data ?? [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const openNotification = useCallback(
    (notification: AppNotification) => {
      if (!notification.read_at) markRead(notification.id);
      const target = notificationTarget(notification);
      if (target) router.push(target);
    },
    [markRead],
  );

  const header = (
    <View style={styles.header}>
      <Text variant="caption" color={colors.textMuted}>
        {unreadCount > 0
          ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}`
          : 'You are all caught up'}
      </Text>
      {unreadCount > 0 ? (
        <Button
          label="Mark all read"
          variant="ghost"
          fullWidth={false}
          haptic={false}
          loading={markAllRead.isPending}
          onPress={() => markAllRead.mutate()}
          style={styles.markAll}
        />
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false} contentStyle={styles.flush}>
      {!isSupabaseConfigured ? (
        <View style={styles.notice}>
          <Banner
            tone="warning"
            title="Not connected"
            message="Add your Supabase keys to .env to load your notifications."
          />
        </View>
      ) : null}

      {error ? (
        <View style={styles.notice}>
          <Banner
            tone="danger"
            title="Could not load notifications"
            message={friendlyError(error)}
          />
        </View>
      ) : null}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={notifications.length > 0 ? header : null}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={() => void refetch()}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <NotificationRow
            notification={item}
            onPress={openNotification}
            linkable={notificationTarget(item) !== null}
          />
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <MessagingEmpty
              emoji="🔔"
              title="No notifications yet"
              body="Order updates land here — when a washer accepts, when your laundry is picked up, and when it is back at your door."
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flush: { padding: 0, gap: 0 },
  notice: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  list: { padding: spacing.lg, gap: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: spacing.xxl,
  },
  markAll: { minHeight: spacing.xxl, paddingHorizontal: 0 },
});
