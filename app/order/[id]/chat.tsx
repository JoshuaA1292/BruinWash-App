import React, { useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Banner, Card, Screen, Text } from '@/components/ui';
import { ChatBubble, ChatComposer, MessagingEmpty, WasherIdentity } from '@/features/messaging';
import { useChat } from '@/hooks/useChat';
import { useWasherCard } from '@/hooks/useWasherCard';
import { colors, spacing } from '@/theme';
import type { Message } from '@/types/database';

/**
 * The MANUAL requester <-> washer thread (spec 3.2).
 *
 * One-way visibility holds here too: a requester sees the washer's first name
 * from the washer_cards view, while a washer only ever sees a neutral label for
 * the person they are washing for.
 */
const REQUESTER_LABEL = 'Your customer';

export default function OrderChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    messages,
    isLoading,
    loadError,
    viewerIsRequester,
    washerId,
    canSend,
    disabledReason,
    send,
    sending,
    sendError,
    isMine,
  } = useChat(id);

  // Only a requester is entitled to the washer card; skip the read otherwise.
  const { data: washerCard } = useWasherCard(viewerIsRequester ? washerId : null);

  const counterpartName = viewerIsRequester
    ? (washerCard?.first_name ?? 'Your washer')
    : REQUESTER_LABEL;

  const listRef = useRef<FlatList<Message>>(null);
  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(scrollToEnd, 60);
    return () => clearTimeout(timer);
  }, [messages.length, scrollToEnd]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        scroll={false}
        contentStyle={styles.flush}
        footer={
          <ChatComposer
            onSend={send}
            sending={sending}
            enabled={canSend}
            disabledReason={disabledReason}
            error={sendError}
          />
        }
      >
        <View style={styles.identity}>
          <Card>
            <WasherIdentity
              card={viewerIsRequester ? washerCard : null}
              fallbackName={counterpartName}
              showRating={viewerIsRequester}
              subtitle={
                viewerIsRequester
                  ? 'Your washer for this order'
                  : 'We never share a requester’s name or room number.'
              }
            />
          </Card>
        </View>

        {loadError ? (
          <View style={styles.identity}>
            <Banner tone="danger" title="Could not load this thread" message={loadError} />
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToEnd}
            renderItem={({ item, index }) => {
              const previous = index > 0 ? messages[index - 1] : undefined;
              const mine = isMine(item);
              return (
                <ChatBubble
                  message={item}
                  mine={mine}
                  senderLabel={counterpartName}
                  showSender={!previous || isMine(previous) !== mine}
                />
              );
            }}
            ListEmptyComponent={
              <MessagingEmpty
                emoji="💬"
                title="No messages yet"
                body={
                  canSend
                    ? `Send ${counterpartName} a note about your pickup — a floor, a bin, anything they should know.`
                    : 'Messaging opens as soon as a washer accepts this order.'
                }
              />
            }
            ListFooterComponent={<View style={styles.footerSpacer} />}
          />
        )}

        {messages.length > 0 ? (
          <Text variant="micro" color={colors.textSubtle} center style={styles.disclaimer}>
            All communication stays in the app.
          </Text>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flush: { padding: 0, gap: 0 },
  identity: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  loading: { paddingVertical: spacing.xxl },
  list: { padding: spacing.lg, gap: spacing.md },
  footerSpacer: { height: spacing.sm },
  disclaimer: { paddingBottom: spacing.sm },
});
