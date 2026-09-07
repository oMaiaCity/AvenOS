import assert from 'node:assert/strict'
import test from 'node:test'
import { renderCloudInit } from '../src/cloud-init.mjs'

const hostPrivate = '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n'
const hostPublic = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHost test\n'

function render(appRoot) {
	return renderCloudInit({
		deployUser: 'aven-deploy',
		adminPublicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAdmin admin\n',
		deployPublicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDeploy deploy\n',
		observePublicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIObserve observe\n',
		tunnelPublicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITunnel tunnel\n',
		sshAllowedCidrs: ['192.0.2.4/32'],
		volumeDevice: '/dev/disk/by-id/scsi-0HC_Volume_123',
		appRoot,
		sshHostPrivateKey: hostPrivate,
		sshHostPublicKey: hostPublic
	})
}

test('identity and platform cloud-init use different deployment roots', () => {
	const identity = render('/opt/aven/identity')
	const platform = render('/opt/aven/platform')
	assert.match(identity, /\/opt\/aven\/identity/)
	assert.doesNotMatch(identity, /\/opt\/aven\/platform/)
	assert.match(platform, /\/opt\/aven\/platform/)
	assert.doesNotMatch(platform, /\/opt\/aven\/identity/)
})

test('pins a Pulumi-managed SSH host key and contains no application secret', () => {
	const cloudInit = render('/opt/aven/identity')
	assert.match(cloudInit, /HostKey \/etc\/ssh\/ssh_host_ed25519_key/)
	assert.match(
		cloudInit,
		/path: \/etc\/ssh\/ssh_host_ed25519_key\n\s+owner: root:root\n\s+permissions: "0600"\n\s+defer: true/
	)
	assert.match(
		cloudInit,
		/path: \/etc\/ssh\/ssh_host_ed25519_key\.pub\n\s+owner: root:root\n\s+permissions: "0644"\n\s+defer: true/
	)
	assert.match(cloudInit, /PasswordAuthentication no/)
	assert.doesNotMatch(cloudInit, /BETTER_AUTH|POSTGRES_PASSWORD|POLAR_API_KEY|SMTP_URL/)
})

test('creates least-privilege persistent and deployment directories', () => {
	const cloudInit = render('/opt/aven/platform')
	assert.match(cloudInit, /install -d -o 70 -g 70 -m 0700 \/var\/lib\/aven\/postgres/)
	assert.match(cloudInit, /install -d -o 65532 -g 65532 -m 0700 \/var\/lib\/aven\/backups/)
	assert.match(cloudInit, /install -d -o 10003 -g 10003 -m 0750 \/var\/lib\/aven\/static-sites/)
	assert.match(cloudInit, /install -d -o aven-deploy -g aven-deploy -m 0750 \/opt\/aven\/platform/)
})

test('bounds logs and staggers automatic maintenance reboots', () => {
	const identity = render('/opt/aven/identity')
	const platform = render('/opt/aven/platform')
	assert.match(identity, /"max-size":"10m","max-file":"5"/)
	assert.match(identity, /MaxRetentionSec=14day/)
	assert.match(identity, /Automatic-Reboot-Time "03:30"/)
	assert.match(platform, /Automatic-Reboot-Time "04:00"/)
	assert.match(platform, /aven-observe platform status/)
	assert.match(platform, /data volume usage is \$used%/)
	assert.match(platform, /backup container is \$health/)
})

test('disables cloud-init network hotplug on fixed-NIC hosts', () => {
	const cloudInit = render('/opt/aven/platform')
	assert.match(cloudInit, /updates:\n {2}network:\n(?:.*\n)*? {4}when: \[boot-new-instance\]/)
	assert.match(cloudInit, /systemctl mask --now cloud-init-hotplugd\.socket/)
	assert.match(
		cloudInit,
		/systemctl reset-failed cloud-init-hotplugd\.service 2>\/dev\/null \|\| true/
	)
})

test('creates a key-only admin plus separate least-privilege service accounts', () => {
	const cloudInit = render('/opt/aven/platform')
	assert.match(cloudInit, /name: aven-admin/)
	assert.match(cloudInit, /groups: \[sudo\]/)
	assert.match(cloudInit, /aven-admin aven-deploy aven-observe aven-tunnel/)
	assert.match(cloudInit, /name: aven-observe/)
	assert.match(cloudInit, /name: aven-tunnel/)
	assert.match(cloudInit, /PermitOpen 127\.0\.0\.1:5432/)
	assert.match(cloudInit, /\/usr\/local\/sbin\/aven-deploy platform/)
	assert.match(cloudInit, /\/usr\/local\/sbin\/aven-restore platform/)
	assert.match(cloudInit, /RESTORE_CONFIRMATION|--profile recovery/)
	assert.doesNotMatch(cloudInit, /aven-deploy ALL=\(ALL\) NOPASSWD:ALL|usermod -aG docker/)
	assert.doesNotMatch(cloudInit, /ssh-ed25519[^\n]*\n\s+\n/)
})
