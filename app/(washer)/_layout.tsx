import React from 'react';
import { Tabs } from 'expo-router';
import { TabIcon } from '@/features/washer';
import { colors, typography } from '@/theme';

/**
 * The washer's four tabs. The root Stack renders this group with its header
 * hidden, so the brand header lives here.
 */
export default function WasherLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textOnPrimary,
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: typography.micro.fontSize, fontWeight: '500' },
        sceneStyle: { backgroundColor: colors.surfaceAlt },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Available',
          tabBarAccessibilityLabel: 'Available jobs',
          tabBarIcon: ({ color, size }) => <TabIcon name="available" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'My Jobs',
          tabBarAccessibilityLabel: 'My jobs',
          tabBarIcon: ({ color, size }) => <TabIcon name="jobs" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          tabBarAccessibilityLabel: 'Earnings',
          tabBarIcon: ({ color, size }) => <TabIcon name="earnings" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarAccessibilityLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <TabIcon name="profile" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
