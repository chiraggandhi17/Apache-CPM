import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { NodeProvider } from './context/NodeContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppShell } from './components/layout/AppShell';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NodeProvider>
          <AppShell />
        </NodeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
