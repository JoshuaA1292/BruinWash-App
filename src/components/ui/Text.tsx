import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { colors, typography } from '@/theme';

type Variant = keyof typeof typography;

interface Props extends TextProps {
  variant?: Variant;
  color?: string;
  center?: boolean;
}

export function Text({ variant = 'body', color, center, style, ...rest }: Props) {
  return (
    <RNText
      style={[
        typography[variant] as TextStyle,
        { color: color ?? colors.text },
        center && { textAlign: 'center' },
        style,
      ]}
      {...rest}
    />
  );
}
