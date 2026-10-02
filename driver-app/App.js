import React, { useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DriverProvider } from './src/context/DriverContext';
import AppNavigator from './src/navigation/AppNavigator';
import { colors } from './src/utils/colors';
import { initBackgroundUpdates } from './src/services/updateService';

export default function App() {
  useEffect(() => {
    const cleanup = initBackgroundUpdates();
    return () => cleanup && cleanup();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <DriverProvider>
          <AppNavigator />
        </DriverProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  }
});
