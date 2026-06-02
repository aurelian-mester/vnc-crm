#!/bin/bash
echo "=== Test Products API via Gateway - board_grades ==="
curl -s "http://127.0.0.1:8080/products?category=board_grades" | head -c 500
echo ""
echo "=== Test Products API via Gateway - articles ==="
curl -s "http://127.0.0.1:8080/products?category=articles" | head -c 500
echo ""
