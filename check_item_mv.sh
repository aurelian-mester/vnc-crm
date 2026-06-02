#!/bin/bash
echo "=== Check if ss01.item_mv exists ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT table_schema, table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'ss01' AND table_name = 'item_mv';
"

echo "=== Get columns of ss01.item_mv ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'ss01' AND table_name = 'item_mv';
"

echo "=== Sample item category codes from ss01.item_mv ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT \"Item Category Code\", count(*) 
FROM ss01.item_mv 
GROUP BY \"Item Category Code\";
"
