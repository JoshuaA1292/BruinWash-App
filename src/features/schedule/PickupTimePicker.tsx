import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';
import { withDatePart, withTimePart } from './time';

interface Props {
  value: Date;
  onChange: (next: Date) => void;
  /** Pickups before this are refused server-side, so the picker blocks them. */
  minimumDate: Date;
  maximumDate: Date;
  error?: string | null;
}

/**
 * The native platform picker, deliberately NOT the web product's custom
 * scroll-wheel (spec 2.3). iOS renders the compact inline pickers directly in
 * the form; Android has no inline picker, so each mode opens its own dialog.
 */
export function PickupTimePicker({ value, onChange, minimumDate, maximumDate, error }: Props) {
  const clamp = (next: Date) => {
    if (next.getTime() < minimumDate.getTime()) return minimumDate;
    if (next.getTime() > maximumDate.getTime()) return maximumDate;
    return next;
  };

  const openAndroid = (mode: 'date' | 'time') => {
    DateTimePickerAndroid.open({
      value,
      mode,
      is24Hour: false,
      ...(mode === 'date' ? { minimumDate, maximumDate } : {}),
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type !== 'set' || !picked) return;
        onChange(clamp(mode === 'date' ? withDatePart(value, picked) : withTimePart(value, picked)));
      },
    });
  };

  return (
    <View style={styles.wrap}>
      <Text variant="label">Pickup Time</Text>

      {Platform.OS === 'android' ? (
        <View style={styles.row}>
          <AndroidTrigger
            label="Date"
            display={format(value, 'EEE, MMM d')}
            onPress={() => openAndroid('date')}
          />
          <AndroidTrigger
            label="Time"
            display={format(value, 'h:mm a')}
            onPress={() => openAndroid('time')}
          />
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.iosCell}>
            <Text variant="caption" color={colors.textMuted}>
              Date
            </Text>
            <DateTimePicker
              value={value}
              mode="date"
              display="compact"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              accessibilityLabel="Pickup date"
              accentColor={colors.primary}
              onChange={(_event, picked) => {
                if (picked) onChange(clamp(withDatePart(value, picked)));
              }}
            />
          </View>
          <View style={styles.iosCell}>
            <Text variant="caption" color={colors.textMuted}>
              Time
            </Text>
            <DateTimePicker
              value={value}
              mode="time"
              display="compact"
              minuteInterval={15}
              accessibilityLabel="Pickup time"
              accentColor={colors.primary}
              onChange={(_event, picked) => {
                if (picked) onChange(clamp(withTimePart(value, picked)));
              }}
            />
          </View>
        </View>
      )}

      {error ? (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : (
        <Text variant="caption" color={colors.textMuted}>
          Pickup and return happen at the end of the hall.
        </Text>
      )}
    </View>
  );
}

function AndroidTrigger({
  label,
  display,
  onPress,
}: {
  label: string;
  display: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Pickup ${label.toLowerCase()}, ${display}`}
      accessibilityHint={`Opens the ${label.toLowerCase()} picker`}
      onPress={onPress}
      style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
    >
      <Text variant="caption" color={colors.textMuted}>
        {label}
      </Text>
      <Text variant="bodyStrong">{display}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  iosCell: { gap: spacing.xs, flexShrink: 1 },
  trigger: {
    flex: 1,
    gap: spacing.xs / 2,
    minHeight: 58,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
});
