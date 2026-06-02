#!/bin/bash
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'ss02' AND table_name LIKE '%_v'
ORDER BY table_name;
"
