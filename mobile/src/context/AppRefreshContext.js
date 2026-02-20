import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const AppRefreshContext = createContext(null);

export const useAppRefresh = () => {
  const context = useContext(AppRefreshContext);
  if (!context) {
    throw new Error('useAppRefresh must be used within AppRefreshProvider');
  }
  return context;
};

export const AppRefreshProvider = ({ children }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastRefreshReason, setLastRefreshReason] = useState('init');
  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  const refreshAllPages = useCallback((reason = 'manual') => {
    setRefreshTick((prev) => prev + 1);
    setLastRefreshReason(reason);
    setLastRefreshAt(Date.now());
  }, []);

  const value = useMemo(
    () => ({
      refreshTick,
      lastRefreshReason,
      lastRefreshAt,
      refreshAllPages,
    }),
    [refreshTick, lastRefreshReason, lastRefreshAt, refreshAllPages]
  );

  return <AppRefreshContext.Provider value={value}>{children}</AppRefreshContext.Provider>;
};

