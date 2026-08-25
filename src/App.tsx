import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { NodeProvider } from './context/NodeContext';
import { AppShell } from './components/layout/AppShell';

export default function App() {
  return (
    <AuthProvider>
      <NodeProvider>
        <AppShell />
      </NodeProvider>
    </AuthProvider>
  );
}
