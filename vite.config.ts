import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // The genuinely heavy, only-sometimes-used pieces (Calendar/FullCalendar,
    // both admin dashboards, the Google Calendar sync modal, and the Excel
    // export with its `xlsx` dependency) are already split into their own
    // lazy-loaded chunks — see the `lazy()` imports in AppShell.tsx and
    // NodeInspectorModal.tsx. What's left in the main chunk is React,
    // Supabase's client, and the core app itself, all needed on first load,
    // so raising this past Vite's generic 500kB default just stops it
    // re-flagging a bundle shape that's already been reviewed.
    chunkSizeWarningLimit: 750,
  },
});
