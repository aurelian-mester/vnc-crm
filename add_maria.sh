#!/bin/bash
PGPASSWORD=vnc_pass_2026 psql -h 127.0.0.1 -U vnc_user -d crm_db -c "
INSERT INTO users (email, name, role, salesperson_code) 
VALUES ('maria.ionescu@vrancart.com', 'Maria Ionescu', 'production', '')
ON CONFLICT (email) DO UPDATE SET role = 'production';
"
echo "Maria Ionescu added."
