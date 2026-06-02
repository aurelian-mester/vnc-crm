#!/bin/bash
PASS='1qaz@WSX3edc'
NEW_IP='192.168.72.20/22'
GATEWAY='192.168.75.254'
DNS1='192.168.75.31'
DNS2='192.168.75.32'

echo "Fixing Gateway and verifying cloud-init on 192.168.72.20..."

# Ensure cloud-init network config is disabled
echo "$PASS" | sudo -S bash -c "echo 'network: {config: disabled}' > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg"

# Update Netplan with correct gateway
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
          via: $GATEWAY
EOF"

echo "Applying network changes..."
echo "$PASS" | sudo -S netplan apply
echo "Network configuration updated."
