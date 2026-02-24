import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: [
      '@privy-io/react-auth',
      '@privy-io/react-auth/solana',
    ],
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress annotation warnings from Privy/Viem minified bundles
        if (warning.code === 'INVALID_ANNOTATION') return;
        if (warning.message?.includes('annotation')) return;
        warn(warning);
      },
    },
  },
});
