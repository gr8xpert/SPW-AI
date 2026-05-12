# Nginx Configuration for Plesk — SPW

For each subdomain, go to **Plesk → Domains → [subdomain] → Apache & nginx Settings** and paste the directive into **Additional nginx directives**.

---

## 1. api.spw-ai.com

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 90s;
    proxy_send_timeout 90s;
    client_max_body_size 50m;
}
```

---

## 2. dashboard.spw-ai.com

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 90s;
    proxy_send_timeout 90s;
}
```

---

## 3. widget.spw-ai.com (static files)

Option A — Serve directly from Plesk document root:
1. In Plesk, set the document root of widget.spw-ai.com to:
   `/var/www/vhosts/spw-ai.com/httpdocs/spw/apps/widget/dist`
2. Add this nginx directive:

```nginx
location / {
    try_files $uri $uri/ /index.html;
    add_header Access-Control-Allow-Origin *;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location ~* \.(html|json)$ {
    add_header Access-Control-Allow-Origin *;
    add_header Cache-Control "no-cache";
}
```

Option B — If you can't change document root, use alias:

```nginx
location / {
    alias /var/www/vhosts/spw-ai.com/httpdocs/spw/apps/widget/dist/;
    try_files $uri $uri/ /index.html;
    add_header Access-Control-Allow-Origin *;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location ~* \.(html|json)$ {
    alias /var/www/vhosts/spw-ai.com/httpdocs/spw/apps/widget/dist/;
    try_files $uri $uri/ =404;
    add_header Access-Control-Allow-Origin *;
    add_header Cache-Control "no-cache";
}
```

---

## Important Notes

- **SSL**: Plesk manages SSL certificates via Let's Encrypt. Enable SSL for each subdomain in Plesk first, then add the nginx directives.
- **Cloudflare**: If using CF proxy, set SSL mode to "Full (strict)" in Cloudflare dashboard.
- **Test after each**: After adding each subdomain config, click OK/Apply and verify nginx is happy — Plesk runs `nginx -t` automatically.
- **Proxy mode in Plesk**: Make sure "Proxy mode" is ON for Apache & nginx (this is the default). The directives above go in the nginx section.
