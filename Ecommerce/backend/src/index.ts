import express from 'express';
import cors, { CorsOptions } from 'cors';
import dotenv from 'dotenv';
import { ordersRouter } from './routes/orders.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

// CORS configuration (allow Netlify storefront and local development)
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://ecommerce-storefront-client.vercel.app',
  'https://ecommerce-storefront-client.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean) as string[];

const corsOptions: CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(null, true); // Permissive for initial deploy, can be restricted to FRONTEND_URL
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

app.listen(port, () => {
  console.log(`Ecommerce backend listening on port ${port}`);
});

export default app;
