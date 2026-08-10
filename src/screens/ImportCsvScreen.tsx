import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { View } from 'react-native';

import { usageAnalytics } from '@/analytics';
import { AppScreen, AppText, Button, Card, Icon, ListRow, SectionHeader } from '@/components';
import { MAX_IMPORT_BYTES, importCsv, type ImportResult } from '@/data/csvImport';
import { triggerRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/theme';

/**
 * Import a statement.
 *
 * The route to every account no aggregator reaches — Apple Card has no Plaid
 * path at all, by Apple's design, and Synchrony's is unreliable.
 *
 * The phone only reads the file and uploads it; the parsing happens in the
 * `importCsv` callable, which runs the same parser as the web app. That is why
 * this screen is short: there is no second importer here to get wrong.
 */
export const ImportCsvScreen = () => {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    setResult(null);

    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
      // Some providers hand back a CSV typed as text/plain or octet-stream, so
      // the extension is checked below rather than trusting the MIME type.
        type: [
          'text/csv',
          'text/comma-separated-values',
          'text/plain',
          'public.comma-separated-values-text',
        ],
        copyToCacheDirectory: true,
      });
    } catch {
      // File access denied, or the provider extension crashed. Without this the
      // rejection escaped into `void` and the button silently did nothing on
      // every subsequent tap.
      setError("Cashflow couldn't open the file picker. Check Files access in iOS Settings.");
      return;
    }
    if (picked.canceled) return;

    const asset = picked.assets[0];
    if (!asset) return;
    setPickedName(asset.name);

    if (!asset.name.toLowerCase().endsWith('.csv')) {
      setError('That is not a CSV. Export "Transactions CSV" from your bank or Monarch.');
      return;
    }
    // `?? 0` passed an unknown size straight through the guard; iCloud Drive
    // routinely reports none. Unknown is treated as too big to read blindly.
    if (asset.size === undefined || asset.size > MAX_IMPORT_BYTES) {
      setError('That file is too large to import in one go. Split it by year.');
      return;
    }

    setBusy(true);
    try {
      const content = new File(asset.uri).textSync();
      const imported = await importCsv(content, asset.name);
      setResult(imported);
      usageAnalytics.track('action.selected', 'accounts', {
        target: 'import-csv',
        outcome: 'success',
        itemCount: imported.imported,
      });
      // Re-derive: the balances that just changed are the server's to compute.
      if (imported.imported > 0 || imported.enriched > 0) void triggerRefresh('tap');
    } catch (caught) {
      setError((caught as { userMessage?: string }).userMessage ?? 'That import did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen testID="screen-import-csv">
      <View style={{ gap: theme.spacing.xl }}>
        <View>
          <SectionHeader
            title="Import a statement"
            caption="For accounts your bank feed cannot reach — Apple Card, store cards."
          />
          <Card style={{ gap: theme.spacing.md }}>
            <AppText variant="secondary" tone="textSecondary">
              Export a transactions CSV, then pick it here. Cashflow reads the same formats
              the web app does — Monarch, Chase, Amex, Discover, Capital One, Apple Card.
            </AppText>
            <Button
              label={busy ? 'Importing…' : 'Choose a CSV file'}
              icon="upload"
              onPress={() => void pick()}
              loading={busy}
              disabled={busy}
              fullWidth
              testID="button-pick-csv"
            />
            {pickedName && !busy ? (
              <AppText variant="caption" tone="textTertiary" align="center">
                {pickedName}
              </AppText>
            ) : null}
          </Card>
        </View>

        {error ? (
          <View
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
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

        {result ? (
          <View>
            <SectionHeader title="Result" />
            <Card padded={false}>
              <ListRow
                title={`${result.imported} imported`}
                subtitle="New rows added to your ledger"
                leadingIcon="plus-circle"
                leadingTone="success"
              />
              {/* Enriched, not duplicated: a row the bank feed already had gets
                  the CSV's category and merchant merged into it. */}
              <ListRow
                title={`${result.enriched} enriched`}
                subtitle="Existing rows gained the CSV's category or merchant"
                leadingIcon="edit-3"
              />
              <ListRow
                title={`${result.skipped} already imported`}
                subtitle="Skipped, so your own corrections survive re-importing"
                leadingIcon="skip-forward"
              />
              {result.invalid > 0 ? (
                <ListRow
                  title={`${result.invalid} unreadable`}
                  subtitle="Rows with no valid date or a zero amount"
                  leadingIcon="alert-triangle"
                  leadingTone="warning"
                />
              ) : null}
              {result.createdAccounts.length > 0 ? (
                <ListRow
                  title={`${result.createdAccounts.length} account${result.createdAccounts.length === 1 ? '' : 's'} created`}
                  subtitle={result.createdAccounts.join(', ')}
                  leadingIcon="credit-card"
                />
              ) : null}
            </Card>
            <AppText
              variant="caption"
              tone="textTertiary"
              style={{ marginTop: theme.spacing.sm }}
            >
              A newly created account has no opening anchor, so every row you imported
              counts toward its balance.
            </AppText>
          </View>
        ) : null}
      </View>
    </AppScreen>
  );
};
