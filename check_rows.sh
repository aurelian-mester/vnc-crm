#!/bin/bash
echo "=== dwh_sales_headers count ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -c "SELECT count(*) FROM dwh_sales_headers;"
