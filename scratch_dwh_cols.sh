#!/bin/bash
echo "=== salesinvoiceheader_v columns ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'ss01' AND table_name = 'salesinvoiceheader_v' 
LIMIT 30;
"
echo "=== salesinvoiceline_v columns ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'ss01' AND table_name = 'salesinvoiceline_v' 
LIMIT 30;
"
