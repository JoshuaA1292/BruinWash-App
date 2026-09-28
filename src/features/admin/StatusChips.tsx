import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/components/ui';
import { ADMIN_STATUS_FILTERS, type AdminStatusFilter } from '@/hooks/useAdminOrders';
import { colors, radius, spacing } from '@/theme';

/** The status filter row on the admin dashboard. */
export function StatusChips({
  value,
  counts,
  onChange,
}: {
  value: AdminStatusFilter;
  counts: Record<AdminStatusFilter, number>;
  onChange: (next: AdminStatusFilter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {ADMIN_STATUS_FILTERS.map((chip) => {
        const selected = chip.id === value;
        const count = counts[chip.id] ?? 0;
        return (
          <Pressable
            key={chip.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${chip.label}, ${count} orders`}
            onPress={() => onChange(chip.id)}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text variant="caption" color={selected ? colors.textOnPrimary : colors.text}>
              {chip.label} · {count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.8 },
});
