import { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';

// Server-side calls (NextAuth authorize, refresh) use API_URL which resolves
// inside the Docker network (http://api:3001). Falls back to the public URL
// for local dev where both processes run on the same host.
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Refresh a minute before the API access token actually expires so a request
// never races the clock.
const REFRESH_LEEWAY_MS = 60_000;

// Read the exp claim from a signed JWT without verifying — we trust it because
// we just received it from our own API. Used only for scheduling the refresh.
function readJwtExpiryMs(token: string): number {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return Date.now();
    const normalized = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(normalized, 'base64').toString('utf8');
    const claims = JSON.parse(json) as { exp?: number };
    return claims.exp ? claims.exp * 1000 : Date.now();
  } catch {
    return Date.now();
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await axios.post(`${API_URL}/api/auth/refresh`, {
      refreshToken: token.refreshToken,
    });

    // API response is wrapped: { data: { accessToken, refreshToken } }
    const { accessToken, refreshToken } = response.data.data;
    if (!accessToken || !refreshToken) {
      throw new Error('Refresh response missing tokens');
    }

    return {
      ...token,
      accessToken,
      refreshToken,
      accessTokenExpires: readJwtExpiryMs(accessToken),
      error: undefined,
    };
  } catch {
    // Rotation failed — token might be revoked (reuse detection) or network
    // error. Surface the error so the session callback can force a sign-out.
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const response = await axios.post(`${API_URL}/api/auth/login`, {
            email: credentials.email,
            password: credentials.password,
          });

          // API returns { data: { accessToken, refreshToken, user } }
          const { accessToken, refreshToken, user } = response.data.data;

          if (accessToken && refreshToken && user) {
            return {
              id: user.id.toString(),
              email: user.email,
              name: user.name,
              role: user.role,
              tenantId: user.tenantId,
              accessToken,
              refreshToken,
            };
          }

          return null;
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign-in: seed the NextAuth token from the credentials result.
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpires = readJwtExpiryMs(user.accessToken);
        return token;
      }

      // Still valid, no action needed.
      if (Date.now() + REFRESH_LEEWAY_MS < token.accessTokenExpires) {
        return token;
      }

      // Access token is (about to be) expired — rotate.
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.role = token.role as string;
        session.user.tenantId = token.tenantId as number;
        session.accessToken = token.accessToken as string;
        session.error = token.error;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days — matches the API's refresh-token lifetime
  },
  secret: process.env.NEXTAUTH_SECRET,
};
