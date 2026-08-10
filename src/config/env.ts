export type AppEnvironment = 'development' | 'test' | 'staging' | 'production';

const ENVIRONMENTS: readonly AppEnvironment[] = [
  'development',
  'test',
  'staging',
  'production',
] as const;

const isAppEnvironment = (value: string | undefined): value is AppEnvironment =>
  value !== undefined && (ENVIRONMENTS as readonly string[]).includes(value);

/**
 * Environment selection.
 *
 * `EXPO_PUBLIC_*` variables are inlined by Metro at bundle time, so this needs
 * no extra config plugin and works identically in Expo Go and a release build.
 * Set it in `.env` (see `.env.example`) or on the command line:
 *
 *   EXPO_PUBLIC_APP_ENV=staging npx expo start
 */
const resolveEnvironment = (): AppEnvironment => {
  const declared = process.env.EXPO_PUBLIC_APP_ENV;
  if (isAppEnvironment(declared)) return declared;
  if (process.env.NODE_ENV === 'test') return 'test';
  return __DEV__ ? 'development' : 'production';
};

export const environment: AppEnvironment = resolveEnvironment();

export const isDevelopment = environment === 'development';
export const isTest = environment === 'test';
export const isProduction = environment === 'production';

/**
 * Whether developer-only surfaces (Diagnostics, the developer settings panel,
 * the scenario switcher) are reachable. Production never shows them.
 */
export const developerToolsAvailable = !isProduction;

const DEFAULT_API_BASE_URL: Record<AppEnvironment, string> = {
  development: 'https://localhost/api',
  test: 'https://test.invalid/api',
  staging: 'https://staging.invalid/api',
  production: 'https://invalid/api',
};

export interface AppConfig {
  environment: AppEnvironment;
  /**
   * Placeholder until the real backend is wired. Every value here is
   * intentionally unroutable — nothing in this build should reach a network.
   */
  apiBaseUrl: string;
  requestTimeoutMs: number;
  maxRetries: number;
  appName: string;
  appVersion: string;
}

export const appConfig: AppConfig = {
  environment,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL[environment],
  requestTimeoutMs: Number(process.env.EXPO_PUBLIC_REQUEST_TIMEOUT_MS ?? 15000),
  maxRetries: 2,
  appName: 'Cashflow',
  appVersion: '1.0.0',
};
