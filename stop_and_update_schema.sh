#!/bin/bash
echo "Stopping backend services to release DB locks..."
pkill api-gateway || true
pkill auth-service || true
pkill crm-service || true
pkill pricing-service || true
sleep 1

echo "Applying schema update to products_db..."
PGPASSWORD=vnc_pass_2026 psql -h 127.0.0.1 -U vnc_user -d products_db -c "
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS assign_to_type VARCHAR(50);
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS assign_to_no VARCHAR(50);
"

echo "Verifying price_lists table schema..."
PGPASSWORD=vnc_pass_2026 psql -h 127.0.0.1 -U vnc_user -d products_db -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'price_lists';
"
