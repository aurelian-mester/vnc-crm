#!/bin/bash
echo "=== Check row count of ss01.item_v vs ss01.item_mv ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT 'item_v' AS tbl, count(*) FROM ss01.item_v
UNION ALL
SELECT 'item_mv' AS tbl, count(*) FROM ss01.item_mv;
"

echo "=== Columns of ss01.item_v ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'ss01' AND table_name = 'item_v';
"

echo "=== Let us see if there is any difference in categories between item_v and item_mv ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT 'item_v' AS tbl, \"Item Category Code\", count(*)
FROM ss01.item_v
WHERE \"Item Category Code\" IN ('CO.PLACI', 'CO.CUTII', 'CO.TIP2', 'CO.VAL', 'CO.STRUCTURI')
GROUP BY \"Item Category Code\"
UNION ALL
SELECT 'item_mv' AS tbl, \"Item Category Code\", count(*)
FROM ss01.item_mv
WHERE \"Item Category Code\" IN ('CO.PLACI', 'CO.CUTII', 'CO.TIP2', 'CO.VAL', 'CO.STRUCTURI')
GROUP BY \"Item Category Code\"
ORDER BY \"Item Category Code\", tbl;
"
