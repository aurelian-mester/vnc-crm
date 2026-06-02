#!/bin/bash
PASS='1qaz@WSX3edc'
cat <<'EOF' > /tmp/vnc-nginx
server {
    listen 80;
    server_name _;

    location /vnc-crm/ {
        alias /home/user/vnc-crm/frontend/build/;
        index index.html;
        try_files $uri $uri/ /vnc-crm/index.html;
    }

    location /vnc-crm/api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF
echo "$PASS" | sudo -S mv /tmp/vnc-nginx /etc/nginx/sites-available/vnc-crm
echo "$PASS" | sudo -S systemctl reload nginx
