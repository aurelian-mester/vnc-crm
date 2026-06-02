#!/bin/bash
export DEBIAN_FRONTEND=noninteractive
echo "Testing sudo with provided password..."
echo '1qaz@WSX3edc' | sudo -S true
if [ $? -eq 0 ]; then
    echo "Sudo successful. Proceeding with installation..."
    echo '1qaz@WSX3edc' | sudo -S apt-get update
    echo '1qaz@WSX3edc' | sudo -S apt-get install -y nginx postgresql nodejs npm
    echo '1qaz@WSX3edc' | sudo -S snap install go --classic
else
    echo "Sudo failed. Please check the password."
    exit 1
fi
