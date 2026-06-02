#!/bin/bash
echo "=== Test Products API - board_grades ==="
curl -s "http://127.0.0.1:8080/vnc-crm/api/products?category=board_grades" | head -c 500
echo ""
echo "=== Test Products API - articles ==="
curl -s "http://127.0.0.1:8080/vnc-crm/api/products?category=articles" | head -c 500
echo ""
