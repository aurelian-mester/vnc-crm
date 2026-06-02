#!/bin/bash
echo "=== Columns of ss01.item_v ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'ss01' AND table_name = 'item_v'
  AND column_name ILIKE '%category%';
"
echo "=== Sample item category codes ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT \"Item Category Code\", count(*)
FROM ss01.item_v
GROUP BY \"Item Category Code\";
"
