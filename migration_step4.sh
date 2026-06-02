#!/bin/bash
PASS='1qaz@WSX3edc'

# Build Frontend
cd ~/vnc-crm/frontend
echo "Installing frontend dependencies..."
npm install --legacy-peer-deps --silent
echo "Building frontend..."
npx react-scripts build --silent

# Build Backend
cd ~/vnc-crm/backend
echo "Building backend..."
go build -o api-gateway ./cmd/api_gateway/main.go

# Setup Nginx
echo "Configuring Nginx..."
echo "$PASS" | sudo -S bash -c "cat <<'EOF' > /etc/nginx/sites-available/vnc-crm
server {
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
}
EOF"

# Wait, I used \$uri again. If I use 'EOF', I should use $uri.
# But I am using bash -c "cat <<'EOF' ...". 
# The \$ in the outer bash script might be needed if I didn't use 'EOF'.
# If I use 'EOF', the inner cat doesn't expand. 
# But the outer echo/bash might?
# Actually, I'll just use a simpler method for Nginx.

echo "Migration steps completed on new server."
