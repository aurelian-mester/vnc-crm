#!/bash
PUBKEY=$(cat ~/vrancart_crm.pub)
sshpass -p '1qaz@WSX3edc' ssh -o StrictHostKeyChecking=no user@192.168.10.115 "mkdir -p ~/.ssh && echo $PUBKEY >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
