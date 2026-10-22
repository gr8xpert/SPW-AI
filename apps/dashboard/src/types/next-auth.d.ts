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
      // The agency requires two-factor login and it is not set up yet.
      mfaSetup?: boolean;
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
    mfaSetup?: boolean;
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
    mfaSetup?: boolean;
    error?: 'RefreshAccessTokenError';
  }
}
