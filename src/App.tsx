import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { NodeProvider } from './context/NodeContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { DialogProvider } from './context/DialogContext';
import { AppShell } from './components/layout/AppShell';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <DialogProvider>
          <AuthProvider>
            <NodeProvider>
              <AppShell />
            </NodeProvider>
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
