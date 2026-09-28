/**
 * Product copy lifted from the live web product (campuswash.app) and the
 * product spec. Keep wording identical to the web app — the mobile app is a
 * faithful translation, not a rewrite.
 *
 * NOTE: the seven AUTOMATED messages are NOT here. They live in the
 * public.message_templates table so they can be changed without a code deploy
 * (spec 3.2).
 */

export const ONBOARDING_STEPS = [
  {
    emoji: '🗓️',
    title: 'Schedule a Wash',
    body:
      'Pick your building, choose a date and time, and select your service level. ' +
      'A verified student washer in your building picks up your laundry and brings it back clean.',
  },
  {
    emoji: '🚀',
    title: "You're All Set!",
    body:
      'Track every stage in real time, message your washer in the app, and rate them when ' +
      'your laundry lands back at your door.',
    cta: 'Get Started',
  },
] as const;

/**
 * Liability & Care of Items disclosure (spec 2.3). Rendered in the amber
 * warning box; the acknowledgement checkbox gates the CTA.
 */
export const LIABILITY_BULLETS = [
  'CampusWash is a technology platform that connects students. We do not wash your laundry ourselves and are not a party to the service agreement.',
  'Damage claims are capped at a maximum of $25 per order. This cap sits with your washer, not with CampusWash.',
  'Do not send delicates, dry-clean-only garments, or anything you could not replace. Everyday clothes only — t-shirts, jeans, towels, bedding.',
  'Do not include valuables, cash, electronics, hazardous materials, or items worth more than $500.',
  'Use a washable garment bag or bin, and check pockets before pickup.',
  'Pickup and return happen at the end of the hall, not at your door.',
] as const;

export const LIABILITY_CHECKBOX_LABEL =
  'I understand that CampusWash does not assume any liability for lost or damaged items, and that claims are capped at $25.';

export const ORDER_STAGES = [
  { status: 'pending', label: 'Pending', blurb: 'Finding a washer in your building' },
  { status: 'accepted', label: 'Accepted', blurb: 'A washer has your order' },
  { status: 'picked_up', label: 'Picked Up', blurb: 'Your laundry is with your washer' },
  { status: 'washing', label: 'Washing', blurb: 'In the machines now' },
  { status: 'out_for_delivery', label: 'Out for Delivery', blurb: 'On the way back to you' },
  { status: 'delivered', label: 'Delivered', blurb: 'Back with you — clean' },
] as const;

export const PRICING_BREAKDOWN_NOTE =
  'The service fee goes to your washer for their time. The machine cost covers what they pay ' +
  'at the washer and dryer on your behalf. No subscriptions, no hidden fees.';

export const PROMO_INVALID_MESSAGE = 'Invalid or ineligible promo code.';

export const CANCELLATION_POLICY = [
  'Cancel more than 2 hours before pickup for a full refund.',
  'Cancel within 2 hours of pickup and 50% is retained as a cancellation fee.',
  'Cancel after pickup but before washing starts for a 50% refund.',
  'Once washing has begun, no refund is available.',
] as const;

export const EDU_EMAIL_HINT = 'Use your college .edu email address. Only .edu addresses can register.';

export const SAFETY_NOTES = [
  'Every user verifies a .edu email address. No anonymous accounts.',
  'Washers only see orders in their own building.',
  'We never share full names or room numbers.',
  'All communication happens in the app.',
] as const;
