import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    return ({
        plugins: [react()],
        base: mode === 'production' ? '/app/' : '/',
        server: { port: 5174 },
        test: {
            environment: 'jsdom',
            setupFiles: ['./src/test-setup.ts'],
            globals: true,
        },
    });
});
