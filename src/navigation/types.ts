import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Navigation shape.
 *
 * Five tabs, two of which own a stack. The "More" tab is the Settings screen
 * itself rather than a menu that leads to it — an extra tap to reach a list of
 * links is a layer, not a feature.
 */

export type AccountsStackParamList = {
  Accounts: undefined;
  AccountDetail: { accountId: string };
  AddAccount: undefined;
  ImportCsv: undefined;
};

export type MoreStackParamList = {
  Settings: undefined;
  Diagnostics: undefined;
};

export type TabParamList = {
  Home: undefined;
  AccountsTab: NavigatorScreenParams<AccountsStackParamList> | undefined;
  Activity: undefined;
  Plan: undefined;
  MoreTab: NavigatorScreenParams<MoreStackParamList> | undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Notifications: undefined;
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
