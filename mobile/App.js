import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { AppRefreshProvider } from './src/context/AppRefreshContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <AuthProvider>
      <AppRefreshProvider>
        <NotificationProvider>
          <StatusBar style="light" />
          <AppNavigator />
        </NotificationProvider>
      </AppRefreshProvider>
    </AuthProvider>
  );
}
