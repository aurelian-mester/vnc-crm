#!/bin/bash
PASS='1qaz@WSX3edc'
echo "=== Nginx Access Log (last 20 lines) ==="
echo "$PASS" | sudo -S tail -n 20 /var/log/nginx/access.log
echo "=== Nginx Error Log (last 20 lines) ==="
echo "$PASS" | sudo -S tail -n 20 /var/log/nginx/error.log
