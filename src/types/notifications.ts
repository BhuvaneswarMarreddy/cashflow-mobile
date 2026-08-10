export type NotificationCategory = 'insight' | 'warning' | 'reminder' | 'success' | 'system';

export type NotificationSeverity = 'low' | 'medium' | 'high';

/** Where tapping a notification should land. Kept abstract so the notification
 * model does not depend on the navigator's parameter types. */
export type NotificationTarget =
  | { screen: 'Home' }
  | { screen: 'Accounts' }
  | { screen: 'AccountDetail'; accountId: string }
  | { screen: 'Activity' }
  | { screen: 'Plan' }
  | { screen: 'Diagnostics' };

export interface AppNotification {
  id: string;
  title: string;
  /**
   * One or two sentences. Notifications summarise; they never list
   * transactions. See `src/services/summarize.ts` for the rule.
   */
  summary: string;
  timestamp: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  read: boolean;
  target: NotificationTarget | null;
  /** `refresh`, `bills`, `paycheck`, `sync` — what produced it. */
  source: string;
  /** Ties the notification back to the processing run that created it. */
  correlationId: string | null;
}
