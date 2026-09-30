// The internal tenant the seed creates to hold the super-admin logins. It is
// not a client: Super Admin lists, counts and reports leave it out (deleting
// it from a list would delete those logins). Other internal tenants are real
// test/demo clients and are shown.
export const PLATFORM_TENANT_SLUG = 'platform';
