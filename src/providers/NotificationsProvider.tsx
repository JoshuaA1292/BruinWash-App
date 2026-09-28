import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

/**
 * Push notifications (spec 3.3).
 *
 * The device registers an Expo push token against the signed-in user; the
 * `dispatch-push` Edge Function reads public.push_tokens and delivers every
 * unsent row in public.notifications. Tapping a notification deep-links to the
 * order it belongs to.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

interface RegistrationResult {
  status: Notifications.PermissionStatus | null;
  token: string | null;
}

/**
 * Pure async registration: asks for permission, fetches the Expo push token, and
 * saves it against the user. Deliberately holds no React state so the effect
 * below can await it and only then touch state — setting state synchronously
 * inside an effect body causes cascading renders.
 */
async function registerForPush(userId: string | undefined): Promise<RegistrationResult> {
  // Push requires a physical device; a simulator has no APNs/FCM token.
  if (!Device.isDevice) return { status: null, token: null };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Order updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#005581',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return { status, token: null };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  try {
    const pushToken = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    if (userId) {
      const { error } = await supabase.rpc('register_push_token', {
        p_token: pushToken.data,
        p_platform: Platform.OS,
        p_device_name: Device.deviceName ?? null,
      });
      if (error) console.warn('[push] could not save token:', error.message);
    }

    return { status, token: pushToken.data };
  } catch (e) {
    console.warn('[push] token request failed:', (e as Error).message);
    return { status, token: null };
  }
}

interface NotificationsState {
  permission: Notifications.PermissionStatus | null;
  token: string | null;
  /** Prompts for permission, registers the token, and resolves to granted. */
  register: () => Promise<boolean>;
}

const Ctx = createContext<NotificationsState | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [permission, setPermission] = useState<Notifications.PermissionStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const register = useCallback(async (): Promise<boolean> => {
    const result = await registerForPush(userId);
    setPermission(result.status);
    setToken(result.token);
    return result.token !== null;
  }, [userId]);

  // Register once a user is signed in; the token belongs to an account.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void (async () => {
      const result = await registerForPush(userId);
      if (cancelled) return;
      setPermission(result.status);
      setToken(result.token);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Deep-link on tap. Works both from a cold start and from the background.
  useEffect(() => {
    const open = (data: Record<string, unknown> | undefined) => {
      const orderId = typeof data?.order_id === 'string' ? data.order_id : null;
      if (!orderId) {
        router.push('/inbox');
        return;
      }
      if (data?.kind === 'chat') {
        router.push({ pathname: '/order/[id]/chat', params: { id: orderId } });
      } else if (data?.template_key === 'order_delivered_requester') {
        router.push({ pathname: '/order/[id]/rate', params: { id: orderId } });
      } else {
        router.push({ pathname: '/order/[id]', params: { id: orderId } });
      }
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) open(response.notification.request.content.data);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      open(response.notification.request.content.data);
    });

    return () => sub.remove();
  }, []);

  const value = useMemo<NotificationsState>(
    () => ({ permission, token, register }),
    [permission, token, register],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePushNotifications(): NotificationsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePushNotifications must be used inside <NotificationsProvider>.');
  return ctx;
}
