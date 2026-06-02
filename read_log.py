import sys
try:
    with open('/home/user/vnc-crm/test_customer_api_nginx.log', 'r') as f:
        lines = f.readlines()
    print("LOG LINES COUNT:", len(lines))
    for idx, line in enumerate(lines[:15]):
        print(f"{idx+1:02d}: {line.rstrip()}")
except Exception as e:
    print("ERROR:", e)
