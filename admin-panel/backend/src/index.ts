import express from 'express';
import cors, { CorsOptions } from 'cors';
import dotenv from 'dotenv';
import { adminRouter } from './routes/admin.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5002;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://ems-admin-portal.vercel.app',
  'https://ems-admin-panel-provider.vercel.app',
  'https://ems-admin-panel-provider.netlify.app',
  'http://localhost:5174',
  'http://localhost:3000',
].filter(Boolean) as string[];

const corsOptions: CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

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

app.listen(port, () => {
  console.log(`Admin panel backend listening on port ${port}`);
});

export default app;
