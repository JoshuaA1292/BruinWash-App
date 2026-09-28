/**
 * The tour steps come straight from ONBOARDING_STEPS in @/constants/copy, which
 * is a readonly tuple where only the last step carries a `cta`. Widening it to
 * this shape keeps the carousel code free of `in` checks.
 */
export interface TourStep {
  readonly emoji: string;
  readonly title: string;
  readonly body: string;
  readonly cta?: string;
}
