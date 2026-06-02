#!/bin/bash
PASS='1qaz@WSX3edc'
CERT_DIR='/etc/nginx/ssl'

echo "Generating self-signed certificate..."
echo "$PASS" | sudo -S mkdir -p $CERT_DIR
echo "$PASS" | sudo -S openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout $CERT_DIR/vnc-crm.key -out $CERT_DIR/vnc-crm.crt \
    -subj "/C=RO/ST=Vrancea/L=Adjud/O=Vrancart/OU=IT/CN=192.168.72.20"

echo "Updating Nginx for HTTPS..."
cat <<'NGINX_EOF' > /tmp/vnc-crm-nginx-https
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate /etc/nginx/ssl/vnc-crm.crt;
    ssl_certificate_key /etc/nginx/ssl/vnc-crm.key;

    location /vnc-crm/ {
        alias /home/user/vnc-crm/frontend/build/;
        index index.html;
        try_files $uri $uri/ /vnc-crm/index.html;
    }

    location /vnc-crm/api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_EOF

echo "$PASS" | sudo -S mv /tmp/vnc-crm-nginx-https /etc/nginx/sites-available/vnc-crm
echo "$PASS" | sudo -S nginx -t && echo "$PASS" | sudo -S systemctl reload nginx
echo "HTTPS Configuration completed."
