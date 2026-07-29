import express, { type Request } from 'express';
import { existsSync }            from 'fs';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { dirname, resolve }      from 'path';
import { fileURLToPath }         from 'url';

import { AuthApi }                         from './api/AuthApi.js';
import { GitApi }                          from './api/GitApi.js';
import { apiErrorHandler, wrapAsyncRoute } from './lib/httpErrors.js';

const moduleDir              = dirname(fileURLToPath(import.meta.url));
const CHECKOUT_WORKSPACE_DIR = process.env.PRISM_CHECKOUT_WORKSPACE_DIR || '/checkout-workspace';
const CHECKOUT_HOST_DIR      = process.env.PRISM_CHECKOUT_HOST_DIR || undefined;

const app = express();
app.use('/api/auth', new AuthApi().getRouter({ wrapHandler : wrapAsyncRoute }));
app.use('/api/git', new GitApi(CHECKOUT_WORKSPACE_DIR, CHECKOUT_HOST_DIR).getRouter({ wrapHandler : wrapAsyncRoute }));
app.use(
	'/api/github',
	express.json(),
	createProxyMiddleware({
		target       : 'https://api.github.com',
		changeOrigin : true,
		pathRewrite  : { '^/api/github' : '' },
		on           : {
			proxyReq(proxyReq, req) {
				const auth = req.headers.authorization;
				if (auth) {
					proxyReq.setHeader('Authorization', auth);
				}

				// Express.json() consumes the raw body stream before the proxy sees it,
				// so re-serialize and rewrite Content-Length for POST/PATCH/PUT requests.
				const body = (req as Request).body;
				if (body && typeof body === 'object' && Object.keys(body).length > 0) {
					const bodyData = JSON.stringify(body);
					proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData).toString());
					proxyReq.write(bodyData);
				}
			},
		},
	})
);
app.use('/api', apiErrorHandler);

// --- Serve SPA: Vite dev proxy in development, static dist in production ---

const isDev            = process.env.NODE_ENV === 'development';
const viteDevServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const distDir          = resolve(moduleDir, '..', '..', 'dist');
let viteProxy: ReturnType<typeof createProxyMiddleware> | undefined;

if (isDev) {
	viteProxy = createProxyMiddleware({
		target       : viteDevServerUrl,
		changeOrigin : true,
		ws           : true,
	});
	app.use(viteProxy);
}
else if (existsSync(distDir)) {
	app.use(express.static(distDir));
	app.get('*', (_req, res) => {
		res.sendFile(resolve(distDir, 'index.html'));
	});
}

const PORT   = parseInt(process.env.PORT || '3002', 10);
const server = app.listen(PORT, () => {
	const mode = isDev ? `development (proxying UI to ${viteDevServerUrl})` : 'production';
	console.log(`Server listening on http://localhost:${PORT} [${mode}]`);
});

if (viteProxy) {
	server.on('upgrade', viteProxy.upgrade);
}
