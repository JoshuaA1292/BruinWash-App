import React from 'react';
import { Banner } from '@/components/ui';
import { PRICING_BREAKDOWN_NOTE } from '@/constants/copy';

/** Spec 2.4: explains the service-fee vs machine-cost split. */
export function PricingBreakdownNote() {
  return <Banner tone="info" title="Pricing Breakdown" message={PRICING_BREAKDOWN_NOTE} />;
}
