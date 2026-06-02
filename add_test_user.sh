#!/bin/bash
PGPASSWORD=vnc_pass_2026 psql -h 127.0.0.1 -U vnc_user -d crm_db -c "
INSERT INTO users (email, name, role, salesperson_code) 
VALUES ('sales@vrancart.com', 'Test Sales Agent', 'sales', 'ASM 8')
ON CONFLICT (email) DO UPDATE SET role = 'sales', salesperson_code = 'ASM 8';
"
echo "Test user added/updated."
