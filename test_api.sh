#!/bin/bash
echo "=== Articles API HTTP status ==="
curl -o /dev/null -s -w "%{http_code}\n" "http://127.0.0.1:8080/products?category=articles"
echo "=== Board Grades API HTTP status ==="
curl -o /dev/null -s -w "%{http_code}\n" "http://127.0.0.1:8080/products?category=board_grades"
