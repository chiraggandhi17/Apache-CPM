import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { NodeProvider } from './context/NodeContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { DialogProvider } from './context/DialogContext';
import { GoogleCalendarProvider } from './context/GoogleCalendarContext';
import { AppShell } from './components/layout/AppShell';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <DialogProvider>
          <AuthProvider>
            <GoogleCalendarProvider>
              <NodeProvider>
                <AppShell />
              </NodeProvider>
            </GoogleCalendarProvider>
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
