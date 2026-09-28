import React from 'react';
import { Tabs } from 'expo-router';
import { TabBarIcon } from '@/features/requester/TabBarIcon';
import { colors } from '@/theme';

/**
 * The requester shell: Home, Schedule, Orders, Settings.
 *
 * The root Stack renders this group with headerShown: false, so each tab owns
 * its own navy header. No unread badge here on purpose — the notification feed
 * hook belongs to the inbox feature and duplicating it would mean a second
 * source of truth for the unread count; Home links to /inbox instead.
 */
export default function RequesterLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textOnPrimary,
        headerTitleStyle: { fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.surfaceAlt },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: 'CampusWash',
          tabBarAccessibilityLabel: 'Home tab',
          tabBarIcon: ({ color, size }) => <TabBarIcon name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          headerTitle: 'Schedule a pickup',
          tabBarAccessibilityLabel: 'Schedule a pickup tab',
          tabBarIcon: ({ color, size }) => <TabBarIcon name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          headerTitle: 'Your orders',
          tabBarAccessibilityLabel: 'Your orders tab',
          tabBarIcon: ({ color, size }) => <TabBarIcon name="orders" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerTitle: 'Settings',
          tabBarAccessibilityLabel: 'Settings tab',
          tabBarIcon: ({ color, size }) => <TabBarIcon name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
