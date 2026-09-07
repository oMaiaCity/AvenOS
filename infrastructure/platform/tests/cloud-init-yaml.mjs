import { parse } from 'yaml'
import { renderCloudInit } from '../src/cloud-init.mjs'

const parsed = parse(
	renderCloudInit({
		deployUser: 'aven-deploy',
		adminPublicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAdmin admin\n',
		deployPublicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDeploy deploy\n',
		observePublicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIObserve observe\n',
		tunnelPublicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITunnel tunnel\n',
		sshAllowedCidrs: ['192.0.2.4/32'],
		volumeDevice: '/dev/disk/by-id/scsi-0HC_Volume_123',
		appRoot: '/opt/aven/identity',
		sshHostPrivateKey:
			'-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n',
		sshHostPublicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHost test\n'
	})
)
if (!Array.isArray(parsed.runcmd) || !Array.isArray(parsed.write_files))
	throw new Error('cloud-init did not parse into the expected structure')
if (JSON.stringify(parsed.updates?.network?.when) !== JSON.stringify(['boot-new-instance']))
	throw new Error('cloud-init did not disable subsequent network hotplug handling')
for (const user of parsed.users.slice(1)) {
	if (!Array.isArray(user.ssh_authorized_keys) || user.ssh_authorized_keys.length !== 1)
		throw new Error(`cloud-init did not preserve one authorized key for ${user.name}`)
}
