import express from 'express';
import cors, { CorsOptions } from 'cors';
import dotenv from 'dotenv';
import { ordersRouter } from './routes/orders.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

import { allowedOrigins, isAllowedOrigin, corsOptions } from './corsConfig.js';
export { allowedOrigins, isAllowedOrigin, corsOptions };

app.use(cors(corsOptions));

// Security & Crawling directive: APIs must never be indexed by search engines
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

// Explicit robots.txt for backend API domain
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
    service: 'ecommerce-backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Orders API
app.use('/api/orders', ordersRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Ecommerce backend listening on port ${port}`);
  });
}

export default app;
