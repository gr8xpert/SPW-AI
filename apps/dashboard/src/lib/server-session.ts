import { cache } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

// One session read per server request. The root layout, the section layouts
// and some pages all need the session; without this each would run the jwt
// callback separately, and an expired access token would be rotated more than
// once with the same refresh token, which the API treats as token reuse.
export const getCurrentSession = cache(() => getServerSession(authOptions));
