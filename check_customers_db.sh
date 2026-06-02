#!/bin/bash
echo "=== Customers count in crm_db ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d crm_db -c "SELECT count(*) FROM customers;"

echo "=== Customers sample in crm_db ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d crm_db -c "SELECT id, name FROM customers LIMIT 5;"
