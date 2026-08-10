import { httpsCallable } from '@firebase/functions';

import type { LinkExit, LinkSuccess } from 'react-native-plaid-link-sdk';

import { AppError } from '@/errors';
import { loggerFor } from '@/logging';

import { firebaseFunctions, isFirebaseConfigured } from './firebase';

/**
 * Plaid Link, from the phone.
 *
 * The backend half already existed and is unchanged: `plaid_link_token` and
 * `plaid_exchange` are the same Python callables the web app's Link button uses,
 * and the access token never leaves the server — `plaid_exchange` stores it in
 * `meta/plaid` and returns only the institution name.
 *
 * ## The cost, stated where it is spent
 *
 * From `plaid_link_token`'s own docstring: *"a fresh link burns a lifetime Trial
 * slot"*. The owner has TEN, lifetime, non-recoverable. So:
 *
 *   - Adding a NEW bank spends one, permanently.
 *   - REPAIRING an existing bank must pass `itemId`, which puts Link into update
 *     mode and repairs the Item in place for free. Calling this without an
 *     `itemId` to fix a broken bank silently burns a slot and leaves the broken
 *     Item behind.
 *
 * That is why `linkToken` takes the itemId explicitly rather than defaulting.
 *
 * Native module, so it needs a development build; the lazy require keeps Expo Go
 * and jest alive, matching `googleSignIn.ts`.
 */

const log = loggerFor('auth');

type PlaidModule = typeof import('react-native-plaid-link-sdk');

const loadModule = (): PlaidModule => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-plaid-link-sdk') as PlaidModule;
  } catch {
    throw new AppError({
      category: 'permission',
      code: 'PLAID_LINK_UNAVAILABLE',
      userMessage: 'Connecting a bank needs the installed app, not Expo Go.',
      technicalMessage: 'react-native-plaid-link-sdk native module missing',
      retryable: false,
    });
  }
};

export const isPlaidLinkAvailable = (): boolean => {
  try {
    loadModule();
    return true;
  } catch {
    return false;
  }
};

const callable = <Req, Res>(name: string) => {
  if (!isFirebaseConfigured()) {
    throw new AppError({
      category: 'service-unavailable',
      code: 'FIREBASE_NOT_CONFIGURED',
      userMessage: 'Cashflow is not connected yet.',
      technicalMessage: 'EXPO_PUBLIC_FIREBASE_* missing',
      retryable: false,
    });
  }
  return httpsCallable<Req, Res>(firebaseFunctions(), name);
};

/**
 * @param itemId Pass the existing Item's id to REPAIR it (update mode, free).
 *               Omit ONLY when genuinely adding a bank that is not linked yet.
 */
export const createLinkToken = async (itemId?: string): Promise<string> => {
  const fn = callable<{ itemId?: string }, { linkToken: string }>('plaid_link_token');
  const { data } = await fn(itemId ? { itemId } : {});
  log.info('plaid.link_token_created', { metadata: { updateMode: Boolean(itemId) } });
  return data.linkToken;
};

export interface LinkOutcome {
  /** False when the user backed out — not an error, just nothing to do. */
  linked: boolean;
  institution?: string;
}

export const openPlaidLink = async (linkToken: string, updateMode: boolean): Promise<LinkOutcome> => {
  const plaid = loadModule();

  return new Promise<LinkOutcome>((resolve, reject) => {
    // v13 replaced the old create()/open() pair with a session object; the
    // callbacks are supplied up front and `open()` only presents it.
    plaid
      .createPlaidLinkSession({
        token: linkToken,
        onSuccess: (success: LinkSuccess) => {
          const institution = success.metadata?.institution?.name ?? 'Bank';
          // Update mode repaired an existing Item: there is no public token worth
          // exchanging, and exchanging one would create a SECOND Item for the same
          // bank — burning a lifetime slot to duplicate what was just fixed.
          if (updateMode) {
            log.info('plaid.item_repaired');
            resolve({ linked: true, institution });
            return;
          }
          const exchange = callable<{ publicToken: string; institution: string }, { institution: string }>(
            'plaid_exchange',
          );
          exchange({ publicToken: success.publicToken, institution })
            .then(({ data }) => {
              log.info('plaid.item_linked');
              resolve({ linked: true, institution: data.institution });
            })
            .catch(reject);
        },
        onExit: (exit: LinkExit) => {
          const code = exit.error?.errorCode;
          if (!code) {
            resolve({ linked: false });
            return;
          }
          log.warn('plaid.link_exited', { metadata: { code: String(code) } });
          reject(
            new AppError({
              category: 'user-action',
              code: String(code),
              userMessage: exit.error?.displayMessage ?? "That bank connection didn't complete.",
              technicalMessage: exit.error?.errorMessage ?? String(code),
              retryable: true,
            }),
          );
        },
        // Required by the v13 config type. Link fires a lot of these; only the
        // terminal outcome matters here, and an event stream carrying institution
        // names is not something to log in a finance app.
        onEvent: () => undefined,
      })
      .then((session) => session.open())
      .catch(reject);
  });
};
