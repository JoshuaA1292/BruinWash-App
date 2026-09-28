import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/theme';

/** The admin shell. One screen today: the order dashboard (spec 5). */
export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textOnPrimary,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.surfaceAlt },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Order dashboard' }} />
    </Stack>
  );
}
