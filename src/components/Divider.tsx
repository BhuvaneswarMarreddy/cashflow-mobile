import { View } from 'react-native';

import { useTheme } from '@/theme';

export const Divider = ({ inset = 0 }: { inset?: number }) => {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: theme.borderWidth.hairline,
        marginLeft: inset,
        backgroundColor: theme.colors.border,
      }}
    />
  );
};
