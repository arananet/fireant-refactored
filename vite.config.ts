import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    hmr: process.env.VITE_TEST_MODE === '1' ? false : undefined,
    watch: { ignored: ['**/test-results/**', '**/playwright-report/**', '**/.openspec/runs/**'] },
  },
  optimizeDeps: { include: ['three', 'pathfinding', 'lucide'] },
});
