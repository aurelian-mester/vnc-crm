#!/bin/bash
PASS='1qaz@WSX3edc'

# Build Frontend
cd ~/vnc-crm/frontend
echo "Installing frontend dependencies..."
npm install --silent
echo "Building frontend..."
npm run build --silent

# Build Backend
cd ~/vnc-crm/backend
echo "Building backend..."
go build -o api-gateway ./cmd/api_gateway/main.go

# Setup DB
echo "Configuring PostgreSQL..."
echo "$PASS" | sudo -S -u postgres psql -c "CREATE USER vnc_user WITH PASSWORD 'vnc_pass_2026';" || true
echo "$PASS" | sudo -S -u postgres psql -c "CREATE DATABASE crm_db OWNER vnc_user;" || true
echo "$PASS" | sudo -S -u postgres psql -c "CREATE DATABASE products_db OWNER vnc_user;" || true

# Setup Nginx
echo "Configuring Nginx..."
echo "server {
    listen 80;
    server_name _;

    location /vnc-crm/ {
        alias /home/user/vnc-crm/frontend/build/;
        index index.html;
        try_files \$uri \$uri/ /vnc-crm/index.html;
    }

    location /vnc-crm/api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}" | echo "$PASS" | sudo -S tee /etc/nginx/sites-available/vnc-crm

echo "$PASS" | sudo -S ln -s /etc/nginx/sites-available/vnc-crm /etc/nginx/sites-enabled/ || true
echo "$PASS" | sudo -S rm -f /etc/nginx/sites-enabled/default
echo "$PASS" | sudo -S nginx -t && echo "$PASS" | sudo -S systemctl reload nginx
echo "Migration steps completed on new server."
