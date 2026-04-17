import 'next-auth';
import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      tenantId: number;
    } & DefaultSession['user'];
    accessToken: string;
    error?: 'RefreshAccessTokenError';
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: number;
    accessToken: string;
    refreshToken: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: number;
    accessToken: string;
    refreshToken: string;
    // epoch millis — when the API's access token expires, not the NextAuth session
    accessTokenExpires: number;
    error?: 'RefreshAccessTokenError';
  }
}
