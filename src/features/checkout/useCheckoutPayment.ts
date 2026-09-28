/**
 * Checkout payment orchestration (spec 2.7 / 7).
 *
 *   create_order RPC  ->  create-payment-intent Edge Function  ->  Payment Sheet
 *
 * The order is created first and comes back payment_status 'unpaid'. It only
 * becomes visible to washers once the Stripe webhook marks it paid, so this hook
 * never claims a paid state locally — it hands the order id back and the order
 * status screen shows confirmation arriving over Realtime.
 */
import { useCallback, useRef, useState } from 'react';
import { PaymentSheetError, useStripe } from '@stripe/stripe-react-native';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { isStripeConfigured } from '@/providers/StripeProviderShell';
import { useCreateOrder, type CreateOrderInput } from '@/hooks/useCreateOrder';

/** What the create-payment-intent Edge Function returns. */
interface PaymentIntentBundle {
  paymentIntent?: string;
  ephemeralKey?: string;
  customer?: string;
  publishableKey?: string;
}

export type CheckoutStage =
  | 'idle'
  /** create_order is running. */
  | 'creating'
  /** Asking the Edge Function for a PaymentIntent. */
  | 'funding'
  /** Stripe's native sheet is up. */
  | 'sheet'
  /** Sheet succeeded; the webhook now has to confirm. */
  | 'submitted'
  /** No Stripe key configured — the order exists but is unpaid. */
  | 'preview'
  | 'cancelled'
  | 'failed';

export interface CheckoutOutcome {
  kind: 'submitted' | 'preview' | 'cancelled';
  orderId: string;
}

export interface CheckoutPayment {
  stage: CheckoutStage;
  error: string | null;
  busy: boolean;
  /** Set once create_order has succeeded, so a retry never double-books. */
  orderId: string | null;
  /**
   * The total the created order was priced at server-side. Stripe charges this
   * figure, so the CTA must quote it rather than a live re-quote the order no
   * longer reflects.
   */
  lockedTotalCents: number | null;
  pay: (input: CreateOrderInput) => Promise<CheckoutOutcome | null>;
  reset: () => void;
}

export function useCheckoutPayment(): CheckoutPayment {
  const createOrder = useCreateOrder();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [stage, setStage] = useState<CheckoutStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  // The total the created order was priced at. Stripe charges this, not whatever
  // the live quote says afterwards, so the UI must quote it back.
  const [lockedTotalCents, setLockedTotalCents] = useState<number | null>(null);
  const orderIdRef = useRef<string | null>(null);
  const runningRef = useRef(false);

  const pay = useCallback(
    async (input: CreateOrderInput): Promise<CheckoutOutcome | null> => {
      if (runningRef.current) return null;
      runningRef.current = true;
      setError(null);

      try {
        // The order is created once. A retry after a failed or cancelled sheet
        // funds the SAME order rather than booking a second one.
        let id = orderIdRef.current;
        if (!id) {
          setStage('creating');
          const order = await createOrder.mutateAsync(input);
          id = order.id;
          orderIdRef.current = id;
          setOrderId(id);
          setLockedTotalCents(order.total_cents);
        }

        if (!isStripeConfigured) {
          setStage('preview');
          return { kind: 'preview', orderId: id };
        }

        setStage('funding');
        const { data, error: fnError } = await supabase.functions.invoke(
          'create-payment-intent',
          { body: { order_id: id } },
        );
        if (fnError) throw fnError;

        const bundle = (data ?? null) as PaymentIntentBundle | null;
        if (!bundle?.paymentIntent) {
          throw new Error('We could not start that payment. Please try again.');
        }

        setStage('sheet');
        const init = await initPaymentSheet({
          merchantDisplayName: 'CampusWash',
          paymentIntentClientSecret: bundle.paymentIntent,
          ...(bundle.customer && bundle.ephemeralKey
            ? { customerId: bundle.customer, customerEphemeralKeySecret: bundle.ephemeralKey }
            : {}),
          returnURL: 'bruinwash://stripe-redirect',
          allowsDelayedPaymentMethods: false,
          applePay: { merchantCountryCode: 'US' },
          googlePay: { merchantCountryCode: 'US', testEnv: __DEV__ },
        });
        if (init.error) throw new Error(init.error.message);

        const presented = await presentPaymentSheet();
        if (presented.error) {
          if (presented.error.code === PaymentSheetError.Canceled) {
            setStage('cancelled');
            return { kind: 'cancelled', orderId: id };
          }
          throw new Error(presented.error.message);
        }

        // Paid is the webhook's call to make, not ours.
        setStage('submitted');
        return { kind: 'submitted', orderId: id };
      } catch (err) {
        setStage('failed');
        setError(friendlyError(err));
        return null;
      } finally {
        runningRef.current = false;
      }
    },
    [createOrder, initPaymentSheet, presentPaymentSheet],
  );

  const reset = useCallback(() => {
    setStage(orderIdRef.current ? 'cancelled' : 'idle');
    setError(null);
  }, []);

  return {
    stage,
    error,
    busy: stage === 'creating' || stage === 'funding' || stage === 'sheet',
    orderId,
    lockedTotalCents,
    pay,
    reset,
  };
}
