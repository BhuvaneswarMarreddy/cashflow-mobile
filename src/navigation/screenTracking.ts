import type { InteractionSource } from '@/analytics';

/**
 * Route name → telemetry source.
 *
 * Explicit rather than derived from the route name so that renaming a screen
 * cannot silently fork a metric into "Accounts" and "AccountsScreen".
 */
const SOURCE_BY_ROUTE: Record<string, InteractionSource> = {
  Home: 'home',
  Accounts: 'accounts',
  AccountDetail: 'account-detail',
  Activity: 'activity',
  Plan: 'plan',
  Settings: 'settings',
  Diagnostics: 'diagnostics',
  Notifications: 'notifications',
};

export const sourceForRoute = (routeName: string | undefined): InteractionSource =>
  (routeName && SOURCE_BY_ROUTE[routeName]) || 'system';
