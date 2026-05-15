# Dashboard `<img>` usage note

`@next/next/no-img-element` is configured at `warn` (not `error`) in
`.eslintrc.json`. Property images come from external feed CDNs (Resales,
Kyero, Inmoba, Odoo) whose hostnames are tenant-configurable. `next/image`'s
`remotePatterns` whitelist in `next.config.js` is impractical when each
tenant may point at a different image origin.

We use `<img>` for property thumbnails and galleries. The rule stays at
`warn` so genuine candidates (e.g. static logos in admin UI) surface during
PR review without blocking the build.

If you add a new `<img>` for an internal asset whose host is known and
fixed, prefer `next/image` and configure `remotePatterns` if needed.
