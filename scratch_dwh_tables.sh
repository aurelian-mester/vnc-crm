#!/bin/bash
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_schema IN ('ss01', 'ss02') 
ORDER BY table_schema, table_name;
"
