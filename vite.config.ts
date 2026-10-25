import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Serves the /api functions (normally Vercel serverless functions) from the
 * Vite dev server so `npm run dev` runs the complete app locally.
 */
function localApi(): Plugin {
  async function handle(server: ViteDevServer, req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value);
    }
    const request = new Request(url, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });
    const { resolveApiRoute } = (await server.ssrLoadModule('/server/router.ts')) as typeof import('./server/router');
    const response = await resolveApiRoute(url.pathname)(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  }

  return {
    name: 'smart-canteen-local-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        handle(server, req, res).catch(next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Expose server-only variables (no VITE_ prefix) to the local API only.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('VITE_') && process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [react(), tailwindcss(), localApi()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/@supabase')) return 'supabase';
            if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion';
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
