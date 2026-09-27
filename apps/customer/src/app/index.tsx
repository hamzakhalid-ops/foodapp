import { StyleSheet, Text, View } from 'react-native';

/**
 * FOUNDATION PLACEHOLDER — not a product screen.
 *
 * Expo Router requires at least one route to build. This route is replaced by the first approved
 * screen batch (see SCREEN_PLAN.md). It intentionally has no Stitch styling, no navigation and no
 * business behavior.
 */
export default function FoundationPlaceholder() {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header">QuickBite</Text>
      <Text>Customer App foundation — no screens implemented yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
});
