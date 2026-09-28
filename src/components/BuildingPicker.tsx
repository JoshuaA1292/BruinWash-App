import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { useBuildings, type BuildingOption } from '@/hooks/useBuildings';
import { friendlyError } from '@/lib/errors';
import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  value: string | null;
  onChange: (building: BuildingOption) => void;
  label?: string;
  error?: string | null;
  hint?: string;
}

/**
 * Building selector shared by profile setup and the schedule screen. A modal
 * list rather than a native picker: the campus list is ~20 rows, it has to look
 * identical on both platforms, and it needs no extra dependency.
 */
export function BuildingPicker({ value, onChange, label = 'Building', error, hint }: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { data, isLoading, error: loadError, refetch, isRefetching } = useBuildings();

  const buildings = data ?? [];
  const selected = value ? buildings.find((b) => b.id === value) ?? null : null;
  const selectedLabel = selected?.name ?? (value && isLoading ? 'Loading…' : 'Select your building');

  const choose = useCallback(
    (building: BuildingOption) => {
      onChange(building);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <View style={styles.wrap}>
      <Text variant="label" color={colors.text}>
        {label}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          selected ? `${label}: ${selected.name}. Change building` : `Select your ${label.toLowerCase()}`
        }
        accessibilityHint="Opens the list of buildings on your campus"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          Boolean(error) && styles.triggerError,
          pressed && styles.pressed,
        ]}
      >
        <Text variant="body" color={selected ? colors.text : colors.textSubtle} style={styles.triggerText}>
          {selectedLabel}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          ▾
        </Text>
      </Pressable>

      {error ? (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={colors.textMuted}>
          {hint}
        </Text>
      ) : null}

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
        accessibilityViewIsModal
      >
        <View style={styles.backdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the building list"
            style={styles.backdropTap}
            onPress={() => setOpen(false)}
          />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.sheetHeader}>
              <Text variant="heading" color={colors.text}>
                Your building
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => setOpen(false)}
              >
                <Text variant="bodyStrong" color={colors.primary}>
                  Done
                </Text>
              </Pressable>
            </View>

            {isLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : loadError ? (
              <View style={styles.centered}>
                <Text variant="caption" color={colors.danger} center>
                  {friendlyError(loadError, 'We could not load the building list.')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Try loading the building list again"
                  onPress={() => void refetch()}
                  hitSlop={8}
                >
                  <Text variant="bodyStrong" color={colors.primary}>
                    {isRefetching ? 'Retrying…' : 'Try again'}
                  </Text>
                </Pressable>
              </View>
            ) : buildings.length === 0 ? (
              <View style={styles.centered}>
                <Text variant="caption" color={colors.textMuted} center>
                  No buildings are listed for your campus yet.
                </Text>
              </View>
            ) : (
              <FlatList
                data={buildings}
                keyExtractor={(item) => item.id}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                renderItem={({ item }) => {
                  const isSelected = item.id === value;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected, checked: isSelected }}
                      accessibilityLabel={item.name}
                      onPress={() => choose(item)}
                      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    >
                      <Text
                        variant={isSelected ? 'bodyStrong' : 'body'}
                        color={isSelected ? colors.primary : colors.text}
                        style={styles.rowLabel}
                      >
                        {item.name}
                      </Text>
                      {isSelected ? (
                        <Text variant="bodyStrong" color={colors.primary}>
                          ✓
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  trigger: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  triggerError: { borderColor: colors.danger },
  triggerText: { flex: 1, fontSize: typography.body.fontSize },
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.lg,
    maxHeight: '75%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  list: { paddingHorizontal: spacing.lg },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowLabel: { flex: 1 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  centered: { padding: spacing.xl, gap: spacing.md, alignItems: 'center' },
});
