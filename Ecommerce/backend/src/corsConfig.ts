import { CorsOptions } from 'cors';

// CORS configuration (explicit verified production origins & development)
export const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://ecommerce-storefront-client.vercel.app',
  'https://ecommerce-storefront-client.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
].filter(Boolean) as string[];

/**
 * Validates origin against explicit allowlist.
 * Origin-less requests (mobile native apps, curl) are permitted by CORS,
 * but sensitive endpoints independently enforce authentication/authorization.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  allowedList: string[],
  isProduction: boolean
): boolean {
  if (!origin) {
    return true;
  }

  if (allowedList.includes(origin)) {
    return true;
  }

  if (!isProduction) {
    if (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('https://localhost:')
    ) {
      return true;
    }
  }

  return false;
}

export const corsOptions: CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    const isProd = process.env.NODE_ENV === 'production';
    if (isAllowedOrigin(origin, allowedOrigins, isProd)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};
