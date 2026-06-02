#!/bin/bash
echo "=== Columns of ss02.articles_v ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'ss02' AND table_name = 'articles_v';
"
echo "=== Sample rows of ss02.articles_v ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT * FROM ss02.articles_v LIMIT 5;
"
