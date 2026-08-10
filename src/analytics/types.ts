/**
 * Interaction telemetry — "how is the user using Cashflow?"
 *
 * The event set is a closed, typed union rather than a free-form
 * `track(name, props)` for one reason: **privacy by construction**. There is no
 * shape here that can carry a balance, an amount, a merchant or an account
 * number, so no future call site can accidentally send one to an analytics
 * vendor. Financial values belong in the system audit stream instead
 * (`src/audit`), which never leaves the device.
 */

export type InteractionEventName =
  | 'app.opened'
  | 'app.foregrounded'
  | 'app.backgrounded'
  | 'session.started'
  | 'session.ended'
  | 'screen.viewed'
  | 'screen.exited'
  | 'tab.selected'
  | 'refresh.initiated'
  | 'refresh.completed'
  | 'refresh.failed'
  | 'card.opened'
  | 'action.selected'
  | 'fab.selected'
  | 'error.encountered'
  | 'empty.encountered'
  | 'notification.opened'
  | 'settings.changed';

/** Where an interaction came from. Deliberately coarse. */
export type InteractionSource =
  | 'home'
  | 'accounts'
  | 'account-detail'
  | 'activity'
  | 'plan'
  | 'more'
  | 'settings'
  | 'notifications'
  | 'diagnostics'
  | 'system';

/**
 * Payload. Every field is either an enum, a duration, a count or a stable
 * identifier of a *UI element* — never of money and never of a person.
 */
export interface InteractionProperties {
  screen?: string;
  previousScreen?: string;
  /** Milliseconds spent on a screen or in a session. */
  durationMs?: number;
  /** Which tab, card, action or FAB item — a UI key like `safe-to-spend`. */
  target?: string;
  /** Coarse outcome for actions that can fail. */
  outcome?: 'success' | 'partial' | 'failure' | 'cancelled';
  /** Error *category*, never an error message. */
  errorCategory?: string;
  /** Which empty state was shown, e.g. `no-transactions`. */
  emptyKind?: string;
  /** Setting key that changed, e.g. `themeMode`. Never the value if personal. */
  settingKey?: string;
  /** Count of items rendered — useful for "is this list ever non-empty?". */
  itemCount?: number;
}

export interface InteractionEvent {
  id: string;
  timestamp: string;
  name: InteractionEventName;
  source: InteractionSource;
  sessionId: string;
  properties: InteractionProperties;
}

/**
 * The transport seam. A vendor SDK (Amplitude, PostHog, Firebase Analytics)
 * implements this and gets registered in `usageAnalytics.ts`. Nothing else in
 * the app changes.
 */
export interface AnalyticsSink {
  name: string;
  send(event: InteractionEvent): void;
}
