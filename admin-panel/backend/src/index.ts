import express from 'express';
import cors, { CorsOptions } from 'cors';
import dotenv from 'dotenv';
import { adminRouter } from './routes/admin.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5002;

import { allowedOrigins, isAllowedOrigin, corsOptions } from './corsConfig.js';
export { allowedOrigins, isAllowedOrigin, corsOptions };

app.use(cors(corsOptions));

// Security & Crawling directive: Private administrative APIs must never be indexed
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

// Explicit robots.txt for admin backend API domain
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /\n');
});

// CORS rejection error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'CORS request rejected: Origin not allowed.' });
    return;
  }
  next(err);
});

app.use(express.json());

// Render Health Check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'admin-panel-backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Admin API
app.use('/api/admin', adminRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`[runtime-check] service=ems-admin-backend node=${process.version} openssl=${process.versions.openssl}`);
    console.log(`Admin panel backend listening on port ${port}`);
  });
}

export default app;
