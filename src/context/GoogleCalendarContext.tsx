import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  getGoogleCalendarStatus, setGoogleCalendarPreferences, GoogleCalendarStatus,
} from '../utils/google-calendar-api';

interface GoogleCalendarContextType {
  status: GoogleCalendarStatus | null;
  loadingStatus: boolean;
  isConnected: boolean;
  /** Whether a brand-new task should default to "Sync to Calendar" on. False when not connected. */
  defaultSyncForNewTasks: boolean;
  refreshStatus: () => Promise<void>;
  updatePreferences: (prefs: { defaultSyncNewTasks?: boolean; setupCompleted?: boolean }) => Promise<void>;
}

const GoogleCalendarContext = createContext<GoogleCalendarContextType | undefined>(undefined);

/**
 * A small, app-wide cache of "is this user connected to Google Calendar, and
 * what are their sync preferences" — so any component (the task form's
 * per-task toggle, the Calendar sync modal, AppShell) can gate on connection
 * status without each doing its own status fetch. Refreshed on login and
 * whenever GoogleCalendarSyncModal connects/disconnects/updates prefs.
 */
export const GoogleCalendarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const refreshStatus = useCallback(async () => {
    if (!user) {
      setStatus(null);
      setLoadingStatus(false);
      return;
    }
    setLoadingStatus(true);
    try {
      const s = await getGoogleCalendarStatus();
      setStatus(s);
    } catch (err) {
      console.error('Failed to load Google Calendar status:', err);
      setStatus({ connected: false });
    } finally {
      setLoadingStatus(false);
    }
  }, [user]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const updatePreferences = useCallback(async (prefs: { defaultSyncNewTasks?: boolean; setupCompleted?: boolean }) => {
    await setGoogleCalendarPreferences(prefs);
    setStatus(prev => (prev ? { ...prev, ...(prefs.defaultSyncNewTasks !== undefined ? { defaultSyncNewTasks: prefs.defaultSyncNewTasks } : {}), ...(prefs.setupCompleted !== undefined ? { setupCompleted: prefs.setupCompleted } : {}) } : prev));
  }, []);

  const isConnected = Boolean(status?.connected);
  const defaultSyncForNewTasks = isConnected && status?.defaultSyncNewTasks !== false;

  return (
    <GoogleCalendarContext.Provider value={{ status, loadingStatus, isConnected, defaultSyncForNewTasks, refreshStatus, updatePreferences }}>
      {children}
    </GoogleCalendarContext.Provider>
  );
};

export const useGoogleCalendar = () => {
  const ctx = useContext(GoogleCalendarContext);
  if (!ctx) throw new Error('useGoogleCalendar must be used within a GoogleCalendarProvider');
  return ctx;
};
