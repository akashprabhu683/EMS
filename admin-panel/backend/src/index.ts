import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { adminRouter } from './routes/admin.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5002;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5174',
  'http://localhost:3000',
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);

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
