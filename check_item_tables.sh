#!/bin/bash
echo "=== Table structures in DWH containing 'item' ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT table_schema, table_name, table_type 
FROM information_schema.tables 
WHERE table_name LIKE '%item%' AND table_schema IN ('ss01', 'ss02', 'public');
"
