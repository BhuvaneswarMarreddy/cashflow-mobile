import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { usageAnalytics } from '@/analytics';
import { AppScreen, AppText, Button, Card, Icon, SectionHeader } from '@/components';
import { createAccount, type NewAccountKind, type Provider } from '@/data/accountsWrite';
import { SegmentedControl } from '@/features/settings/SegmentedControl';
import { createLinkToken, isPlaidLinkAvailable, openPlaidLink } from '@/services/plaidLink';
import { triggerRefresh } from '@/hooks/useRefresh';
import type { AccountsStackParamList } from '@/navigation/types';
import { useFinanceStore } from '@/store/financeStore';
import { useTheme } from '@/theme';

const KINDS: { value: NewAccountKind; label: string }[] = [
  { value: 'checking', label: 'Bank' },
  { value: 'credit-card', label: 'Card' },
  { value: 'loan', label: 'Loan' },
  { value: 'cash', label: 'Cash' },
];

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'bank-transfer', label: 'Bank' },
  { value: 'amex', label: 'Amex' },
  { value: 'chase', label: 'Chase' },
  { value: 'discover', label: 'Discover' },
  { value: 'apple', label: 'Apple' },
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

/** `"1,234.56"` → `123456`. Empty or unparseable → null, which is NOT zero. */
const parseCents = (raw: string): number | null => {
  const trimmed = raw.replace(/[,$\s]/g, '').trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
};

/**
 * Add an account by hand.
 *
 * This is the path for everything Plaid cannot reach — Apple Card, Synchrony's
 * Amazon card, a private loan. The account is created here and its history
 * arrives separately (CSV import on the web); the two are deliberately
 * independent, which is why the opening balance below is optional.
 *
 * The one field that decides whether the numbers come out right is the opening
 * balance, so it gets the explanation rather than a placeholder.
 */
export const AddAccountScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AccountsStackParamList>>();
  const accountCount = useFinanceStore((state) => state.accounts.length);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<NewAccountKind>('credit-card');
  const [provider, setProvider] = useState<Provider>('other');
  const [lastFour, setLastFour] = useState('');
  const [balance, setBalance] = useState('');
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);

  // Only offered on a build that has the native module.
  const plaidAvailable = isPlaidLinkAvailable();

  /**
   * Connect a bank through Plaid.
   *
   * Confirmed first, and the confirmation names the real cost: the account is
   * on a Trial plan with TEN lifetime Items. This flow spends one permanently,
   * and no amount of unlinking gives it back (`plaid_unlink_all` revokes the
   * Item at Plaid; the slot stays spent).
   *
   * Repairing a bank that is already linked is a different operation — it needs
   * `itemId` for update mode and costs nothing. That belongs on the broken
   * account's own row, not here, so this screen never offers it.
   */
  const connectBank = () => {
    Alert.alert(
      'Connect a bank with Plaid?',
      'This uses one of your 10 lifetime Plaid connections. It cannot be recovered, ' +
        'even if you unlink the bank later.\n\nApple Card cannot be connected this way — ' +
        'no aggregator reaches it. Use Import a statement instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use one',
          style: 'destructive',
          onPress: () => {
            setLinking(true);
            setError(null);
            // No itemId: this is deliberately a NEW link. Update mode would
            // repair an existing Item instead, and silently doing that here
            // would connect the wrong thing.
            void createLinkToken()
              .then((token) => openPlaidLink(token, false))
              .then((outcome) => {
                if (!outcome.linked) return;
                setLinked(outcome.institution ?? 'Bank');
                usageAnalytics.track('action.selected', 'accounts', {
                  target: 'plaid-link',
                  outcome: 'success',
                });
                // Plaid needs a moment to prepare history, so the accounts and
                // rows appear on the next sync rather than immediately.
                void triggerRefresh('tap');
              })
              .catch((caught: { userMessage?: string }) => {
                setError(caught.userMessage ?? "That bank connection didn't complete.");
              })
              .finally(() => setLinking(false));
          },
        },
      ],
    );
  };

  const isCard = kind === 'credit-card';
  const isDebt = isCard || kind === 'loan';
  const canSave = name.trim().length > 0 && !saving;

  const inputStyle = {
    minHeight: theme.touchTarget.comfortable,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    ...theme.typography.body,
  };

  const save = () => {
    if (!canSave) return;

    // `parseCents` returns null for BOTH "left blank" and "typed nonsense", and
    // those mean opposite things: blank is "no anchor, count all history",
    // nonsense is a typo that would silently produce an unanchored account while
    // the note on screen promised the opposite. Only blank may reach the write.
    const typed = balance.trim().length > 0;
    const openingBalanceCents = parseCents(balance);
    if (typed && openingBalanceCents === null) {
      setError("That balance isn't a number. Use digits and one decimal point, like 1234.56.");
      return;
    }

    setSaving(true);
    setError(null);

    void createAccount(
      {
        name,
        kind,
        provider,
        ...(lastFour.trim() ? { lastFourDigits: lastFour.trim() } : {}),
        openingBalanceCents,
        ...(isCard ? { creditLimitCents: parseCents(limit) } : {}),
      },
      accountCount,
    )
      .then(() => {
        usageAnalytics.track('action.selected', 'accounts', {
          target: 'add-account',
          outcome: 'success',
        });
        // Re-derive rather than patching the list locally: the balance is the
        // server's answer, and a locally-invented row would be the phone
        // holding an opinion about money.
        void triggerRefresh('tap');
        navigation.goBack();
      })
      .catch((caught: { userMessage?: string }) => {
        setError(caught.userMessage ?? "Cashflow couldn't save that account.");
        setSaving(false);
      });
  };

  return (
    <AppScreen fabSource="accounts" testID="screen-add-account">
      <View style={{ gap: theme.spacing.xl }}>
        {plaidAvailable ? (
          <View>
            <SectionHeader
              title="Connect a bank"
              caption="Balances and transactions arrive automatically after this."
            />
            <Card style={{ gap: theme.spacing.md }}>
              <Button
                label={linking ? 'Opening Plaid…' : 'Connect with Plaid'}
                icon="link"
                variant="secondary"
                onPress={connectBank}
                loading={linking}
                disabled={linking || saving}
                fullWidth
                testID="button-plaid-link"
              />
              {linked ? (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: theme.spacing.sm,
                    padding: theme.spacing.md,
                    borderRadius: theme.radius.control,
                    backgroundColor: theme.colors.positiveSurface,
                  }}
                >
                  <Icon name="check-circle" size={16} color={theme.colors.positive} />
                  <AppText variant="caption" tone="positive" style={{ flex: 1 }}>
                    {linked} connected. Its accounts and history appear after the next sync —
                    Plaid needs a moment to prepare them.
                  </AppText>
                </View>
              ) : (
                <AppText variant="caption" tone="textTertiary">
                  Uses one of 10 lifetime connections. Apple Card cannot be connected — no
                  aggregator reaches it.
                </AppText>
              )}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader
            title="Or add it by hand"
            caption="For Apple Card, store cards, private loans — anything Plaid cannot reach."
          />
          <Card style={{ gap: theme.spacing.md }}>
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="caption" tone="textSecondary">
                Name
              </AppText>
              <TextInput
                value={name}
                onChangeText={setName}
                style={inputStyle}
                placeholder="Apple Card"
                placeholderTextColor={theme.colors.textTertiary}
                autoCapitalize="words"
                accessibilityLabel="Account name"
                testID="input-account-name"
              />
            </View>

            <SegmentedControl
              label="Type"
              options={KINDS}
              value={kind}
              onChange={(next) => setKind(next)}
            />

            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="caption" tone="textSecondary">
                Last four digits (optional)
              </AppText>
              <TextInput
                value={lastFour}
                onChangeText={(v) => setLastFour(v.replace(/\D/g, '').slice(0, 4))}
                style={inputStyle}
                placeholder="1234"
                placeholderTextColor={theme.colors.textTertiary}
                keyboardType="number-pad"
                accessibilityLabel="Last four digits"
              />
            </View>
          </Card>
        </View>

        <View>
          <SectionHeader
            title="Starting balance"
            caption="This is the field that decides whether your history adds up."
          />
          <Card style={{ gap: theme.spacing.md }}>
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="caption" tone="textSecondary">
                {isDebt ? 'Amount owed today (optional)' : 'Balance today (optional)'}
              </AppText>
              <TextInput
                value={balance}
                onChangeText={setBalance}
                style={inputStyle}
                placeholder="Leave blank if you will import history"
                placeholderTextColor={theme.colors.textTertiary}
                keyboardType="decimal-pad"
                accessibilityLabel="Opening balance"
                testID="input-opening-balance"
              />
            </View>

            {/* The rule, stated where the decision is made. Getting this wrong
                is what hides a whole imported history behind a $0 anchor. */}
            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderRadius: theme.radius.control,
                backgroundColor: theme.colors.accentSurface,
              }}
            >
              <Icon name="info" size={16} color={theme.colors.accent} />
              <AppText variant="caption" tone="textSecondary" style={{ flex: 1 }}>
                {balance.trim() === ''
                  ? 'Blank: Cashflow counts every transaction you import, from the beginning. Use this when the history is coming from a CSV.'
                  : 'Entered: this becomes the balance as of today, and only transactions from today forward change it. Older imported rows will be ignored.'}
              </AppText>
            </View>

            {isCard ? (
              <View style={{ gap: theme.spacing.xs }}>
                <AppText variant="caption" tone="textSecondary">
                  Credit limit (optional)
                </AppText>
                <TextInput
                  value={limit}
                  onChangeText={setLimit}
                  style={inputStyle}
                  placeholder="5000"
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Credit limit"
                />
              </View>
            ) : null}
          </Card>
        </View>

        {error ? (
          <View
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              borderRadius: theme.radius.control,
              backgroundColor: theme.colors.errorSurface,
            }}
          >
            <Icon name="alert-circle" size={16} color={theme.colors.error} />
            <AppText variant="secondary" tone="error" style={{ flex: 1 }}>
              {error}
            </AppText>
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          {/* All nine, wrapped. Slicing to four left `apple` unselectable on the
              one screen that exists because Apple Card has no other route, and
              provider drives both the icon and how a future CSV import matches
              rows back to this account. */}
          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="caption" tone="textSecondary">
              Provider
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              {PROVIDERS.map((option) => {
                const selected = option.value === provider;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}
                    onPress={() => setProvider(option.value)}
                    style={{
                      minHeight: theme.touchTarget.min,
                      justifyContent: 'center',
                      paddingHorizontal: theme.spacing.lg,
                      borderRadius: theme.radius.pill,
                      backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceAlt,
                      borderWidth: theme.borderWidth.hairline,
                      borderColor: selected ? theme.colors.accent : theme.colors.border,
                    }}
                  >
                    <AppText
                      variant="caption"
                      style={{ color: selected ? theme.colors.textOnAccent : theme.colors.textSecondary }}
                    >
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Button
            label={saving ? 'Saving…' : 'Add account'}
            onPress={save}
            loading={saving}
            disabled={!canSave}
            fullWidth
            testID="button-save-account"
          />
          <AppText variant="caption" tone="textTertiary" align="center">
            Transaction history is imported on the web app — Settings → Import CSV.
          </AppText>
        </View>
      </View>
    </AppScreen>
  );
};
