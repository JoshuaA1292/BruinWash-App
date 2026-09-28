import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Checkbox, Text } from '@/components/ui';
import { LIABILITY_BULLETS, LIABILITY_CHECKBOX_LABEL } from '@/constants/copy';
import { formatCents } from '@/constants/pricing';
import { colors, spacing } from '@/theme';

interface Props {
  acknowledged: boolean;
  onChange: (next: boolean) => void;
  /** liability_cap_cents as the server reports it, shown in the footnote. */
  capCents: number;
}

/**
 * The amber "Liability & Care of Items" disclosure from spec 2.3. The bullets
 * scroll inside a fixed-height box so the box cannot push the CTA off screen,
 * and the acknowledgement gates booking — create_order() also refuses without it.
 */
export function LiabilityDisclosure({ acknowledged, onChange, capCents }: Props) {
  return (
    <View style={styles.wrap}>
      <Banner tone="warning" title="Liability & Care of Items">
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          accessibilityLabel="Liability and care of items terms"
        >
          {LIABILITY_BULLETS.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <Text variant="caption" color={colors.warning} style={styles.dot}>
                •
              </Text>
              <Text variant="caption" color={colors.text} style={styles.bulletText}>
                {bullet}
              </Text>
            </View>
          ))}
        </ScrollView>
        <Text variant="micro" color={colors.textMuted}>
          Scroll to read all terms. Claims are capped at {formatCents(capCents)} per order.
        </Text>
      </Banner>

      <Checkbox checked={acknowledged} onChange={onChange} label={LIABILITY_CHECKBOX_LABEL} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  // Fixed height: the box scrolls internally rather than growing the form.
  scroll: { maxHeight: 156 },
  scrollContent: { gap: spacing.sm, paddingRight: spacing.sm },
  bulletRow: { flexDirection: 'row', gap: spacing.sm },
  dot: { lineHeight: 19 },
  bulletText: { flex: 1, lineHeight: 19 },
});
