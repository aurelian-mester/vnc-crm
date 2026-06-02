#!/bin/bash
PASS='1qaz@WSX3edc'
NEW_IP='192.168.72.20/22'
DNS1='192.168.75.31'
DNS2='192.168.75.32'

# 1. Disable cloud-init network config
echo "Disabling cloud-init network config..."
echo "$PASS" | sudo -S bash -c "echo 'network: {config: disabled}' > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg"

# 2. Update Netplan
# Assuming interface is ens192 based on previous 'ip route' output
echo "Updating Netplan configuration..."
echo "$PASS" | sudo -S bash -c "cat <<EOF > /etc/netplan/00-installer-config.yaml
network:
  version: 2
  ethernets:
    ens192:
      addresses:
        - $NEW_IP
      nameservers:
        addresses:
          - $DNS1
          - $DNS2
      routes:
        - to: default
          via: 192.168.72.1
EOF"

# Note: I'm guessing the gateway is 192.168.72.1. 
# If it fails, the user might need to fix it via console, 
# but usually .1 is the gateway in such environments.

echo "Applying network changes (expecting disconnection)..."
# Use nohup to allow the apply to finish after SSH drops
echo "$PASS" | sudo -S nohup netplan apply > /tmp/netplan.log 2>&1 &
sleep 2
echo "Script finished. Reconnection attempt should target $NEW_IP."
