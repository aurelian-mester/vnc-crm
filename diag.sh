#!/bin/bash
echo "=== PG_ISREADY ==="
pg_isready -h localhost
pg_isready -h 127.0.0.1
pg_isready

echo "=== POSTGRES PROCESSES ==="
ps -ef | grep -E "postgres|psql" | grep -v grep

echo "=== ACTIVE LOCKS ==="
PGPASSWORD=vnc_pass_2026 psql -h 127.0.0.1 -U vnc_user -d products_db -c "
SELECT pid, relation::regclass, mode, granted, query 
FROM pg_locks l 
JOIN pg_stat_activity a ON l.pid = a.pid;
" || true
