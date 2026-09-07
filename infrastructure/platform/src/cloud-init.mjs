import { normalizeOpenSshPublicKey } from './config.mjs'

function indent(value, spaces) {
	const prefix = ' '.repeat(spaces)
	return value
		.split('\n')
		.map((line) => `${prefix}${line}`)
		.join('\n')
}

export function renderCloudInit({
	deployUser,
	adminPublicKey,
	deployPublicKey,
	observePublicKey,
	tunnelPublicKey,
	sshAllowedCidrs,
	volumeDevice,
	appRoot,
	sshHostPrivateKey,
	sshHostPublicKey
}) {
	if (!/^[a-z][a-z0-9-]{0,30}$/.test(deployUser)) throw new Error('invalid deploy user')
	const normalizedAdminPublicKey = normalizeOpenSshPublicKey(adminPublicKey)
	const normalizedDeployPublicKey = normalizeOpenSshPublicKey(deployPublicKey)
	const normalizedObservePublicKey = normalizeOpenSshPublicKey(observePublicKey)
	const normalizedTunnelPublicKey = normalizeOpenSshPublicKey(tunnelPublicKey)
	const normalizedSshHostPublicKey = normalizeOpenSshPublicKey(sshHostPublicKey)
	if (!sshHostPrivateKey.includes('OPENSSH PRIVATE KEY')) throw new Error('invalid SSH host key')
	if (!/^\/dev\/[A-Za-z0-9_./-]+$/.test(volumeDevice) || volumeDevice.includes('..'))
		throw new Error('volume device must be a safe path below /dev')
	if (!/^\/opt\/aven\/(?:identity|platform)$/.test(appRoot)) throw new Error('invalid app root')
	const firewallCommands = sshAllowedCidrs
		.map((cidr) => `  - ufw allow from ${cidr} to any port 22 proto tcp`)
		.join('\n')
	const mountScript = `#!/bin/sh
set -eu
device=${volumeDevice}
for attempt in $(seq 1 180); do
  [ -b "$device" ] && break
  sleep 2
done
[ -b "$device" ] || { echo "attached volume did not appear" >&2; exit 1; }
if ! blkid "$device" >/dev/null 2>&1; then
  mkfs.ext4 -F "$device"
fi
mkdir -p /var/lib/aven
uuid=$(blkid -s UUID -o value "$device")
grep -q "UUID=$uuid " /etc/fstab || printf 'UUID=%s /var/lib/aven ext4 defaults,nofail 0 2\\n' "$uuid" >> /etc/fstab
mountpoint -q /var/lib/aven || mount /var/lib/aven
install -d -o 70 -g 70 -m 0700 /var/lib/aven/postgres
install -d -o 65532 -g 65532 -m 0700 /var/lib/aven/backups
install -d -o 65532 -g 65532 -m 0755 /var/lib/aven/backups/public-status
install -d -m 0750 /var/lib/aven/caddy/data /var/lib/aven/caddy/config
install -d -o 10003 -g 10003 -m 0750 /var/lib/aven/static-sites
`

	return `#cloud-config
updates:
  network:
    # Hetzner servers have fixed NICs. Treating Docker veth devices as cloud
    # hotplug events makes cloud-init fail and delays every container change.
    when: [boot-new-instance]
users:
  - default
  - name: aven-admin
    shell: /bin/bash
    lock_passwd: true
    groups: [sudo]
    sudo: ALL=(ALL) NOPASSWD:ALL
    ssh_authorized_keys:
      - ${normalizedAdminPublicKey}
  - name: ${deployUser}
    shell: /bin/bash
    lock_passwd: true
    ssh_authorized_keys:
      - ${normalizedDeployPublicKey}
  - name: aven-observe
    shell: /bin/bash
    lock_passwd: true
    ssh_authorized_keys:
      - no-agent-forwarding,no-port-forwarding,no-X11-forwarding ${normalizedObservePublicKey}
  - name: aven-tunnel
    shell: /usr/sbin/nologin
    lock_passwd: true
    ssh_authorized_keys:
      - restrict,port-forwarding,permitopen="127.0.0.1:5432" ${normalizedTunnelPublicKey}
ssh_pwauth: false
package_update: true
package_upgrade: true
packages:
  - ca-certificates
  - curl
  - docker.io
  - docker-compose-v2
  - fail2ban
  - unattended-upgrades
write_files:
  - path: /etc/docker/daemon.json
    owner: root:root
    permissions: "0644"
    content: |
      {"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"},"live-restore":true}
  - path: /etc/systemd/journald.conf.d/99-aven-retention.conf
    owner: root:root
    permissions: "0644"
    content: |
      [Journal]
      SystemMaxUse=256M
      RuntimeMaxUse=64M
      MaxRetentionSec=14day
      Compress=yes
  - path: /etc/apt/apt.conf.d/52aven-unattended
    owner: root:root
    permissions: "0644"
    content: |
      Unattended-Upgrade::Automatic-Reboot "true";
      Unattended-Upgrade::Automatic-Reboot-WithUsers "false";
      Unattended-Upgrade::Automatic-Reboot-Time "${appRoot.endsWith('/identity') ? '03:30' : '04:00'}";
  - path: /etc/ssh/ssh_host_ed25519_key
    owner: root:root
    permissions: "0600"
    defer: true
    content: |
${indent(sshHostPrivateKey.trimEnd(), 6)}
  - path: /etc/ssh/ssh_host_ed25519_key.pub
    owner: root:root
    permissions: "0644"
    defer: true
    content: |
${indent(normalizedSshHostPublicKey, 6)}
  - path: /etc/ssh/sshd_config.d/99-aven-hardening.conf
    owner: root:root
    permissions: "0644"
    content: |
      HostKey /etc/ssh/ssh_host_ed25519_key
      AuthenticationMethods publickey
      PubkeyAuthentication yes
      PasswordAuthentication no
      KbdInteractiveAuthentication no
      PermitEmptyPasswords no
      PermitRootLogin no
      AllowUsers aven-admin ${deployUser} aven-observe aven-tunnel
      MaxAuthTries 3
      Match User aven-tunnel
        AllowTcpForwarding local
        PermitOpen 127.0.0.1:5432
        PermitTTY no
        X11Forwarding no
      Match User aven-observe
        AllowTcpForwarding no
        PermitTTY no
        X11Forwarding no
  - path: /etc/fail2ban/jail.d/aven-sshd.local
    owner: root:root
    permissions: "0644"
    content: |
      [sshd]
      enabled = true
      port = ssh
      maxretry = 5
      findtime = 10m
      bantime = 1h
  - path: /usr/local/sbin/aven-mount-data-volume
    owner: root:root
    permissions: "0755"
    content: |
${indent(mountScript.trimEnd(), 6)}
  - path: /usr/local/sbin/aven-deploy
    owner: root:root
    permissions: "0755"
    content: |
      #!/bin/sh
      set -eu
      case "\${1:-}" in
        identity|platform) root="/opt/aven/$1" ;;
        *) echo "invalid deployment" >&2; exit 64 ;;
      esac
      cd "$root"
      export DOCKER_CONFIG=/home/${deployUser}/.docker
      exec /usr/bin/docker compose --env-file .env up --detach --pull always --wait --wait-timeout 240
  - path: /usr/local/sbin/aven-restore
    owner: root:root
    permissions: "0755"
    content: |
      #!/bin/sh
      set -eu
      case "\${1:-}" in
        identity|platform) root="/opt/aven/$1" ;;
        *) echo "invalid recovery target" >&2; exit 64 ;;
      esac
      cd "$root"
      export DOCKER_CONFIG=/home/${deployUser}/.docker
      /usr/bin/docker compose --env-file .env up --detach --pull always --wait --wait-timeout 240 database database-roles
      /usr/bin/docker compose --env-file .env --profile recovery run --rm restore
      exec /usr/bin/docker compose --env-file .env up --detach --pull always --wait --wait-timeout 240
  - path: /usr/local/sbin/aven-observe
    owner: root:root
    permissions: "0755"
    content: |
      #!/bin/sh
      set -eu
      case "\${1:-}" in identity|platform) root="/opt/aven/$1" ;; *) exit 64 ;; esac
      case "\${2:-}" in
        ps) exec /usr/bin/docker compose --project-directory "$root" ps --all ;;
        logs) exec /usr/bin/docker compose --project-directory "$root" logs --no-color --tail=300 ;;
        status)
          echo "filesystem"
          /usr/bin/df -h /var/lib/aven
          echo "services"
          /usr/bin/docker compose --project-directory "$root" ps --all
          echo "backup"
          if [ -r /var/lib/aven/backups/last-success ]; then cat /var/lib/aven/backups/last-success; else echo missing; fi
          ;;
        check)
          used=$(/usr/bin/df --output=pcent /var/lib/aven | /usr/bin/tail -1 | /usr/bin/tr -dc '0-9')
          [ "$used" -lt 85 ] || { echo "data volume usage is $used%" >&2; exit 1; }
          backup_id=$(/usr/bin/docker compose --project-directory "$root" ps --quiet backup)
          [ -n "$backup_id" ] || { echo "backup container is missing" >&2; exit 1; }
          health=$(/usr/bin/docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$backup_id")
          [ "$health" = healthy ] || { echo "backup container is $health" >&2; exit 1; }
          echo "host check passed"
          ;;
        *) exit 64 ;;
      esac
  - path: /etc/sudoers.d/aven-roles
    owner: root:root
    permissions: "0440"
    content: |
      ${deployUser} ALL=(root) NOPASSWD: /usr/local/sbin/aven-deploy identity, /usr/local/sbin/aven-deploy platform
      ${deployUser} ALL=(root) NOPASSWD: /usr/local/sbin/aven-restore identity, /usr/local/sbin/aven-restore platform
      aven-observe ALL=(root) NOPASSWD: /usr/local/sbin/aven-observe identity ps, /usr/local/sbin/aven-observe identity logs, /usr/local/sbin/aven-observe identity status, /usr/local/sbin/aven-observe identity check, /usr/local/sbin/aven-observe platform ps, /usr/local/sbin/aven-observe platform logs, /usr/local/sbin/aven-observe platform status, /usr/local/sbin/aven-observe platform check
runcmd:
  - systemctl mask --now cloud-init-hotplugd.socket
  - systemctl reset-failed cloud-init-hotplugd.service 2>/dev/null || true
  - systemctl restart systemd-journald
  - systemctl enable --now docker
  - systemctl enable --now fail2ban
  - systemctl restart ssh
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw allow 443/udp
${firewallCommands}
  - ufw --force enable
  - /usr/local/sbin/aven-mount-data-volume
  - install -d -o ${deployUser} -g ${deployUser} -m 0750 ${appRoot} ${appRoot}/deploy
  - touch /var/lib/aven/cloud-init-complete
`
}
