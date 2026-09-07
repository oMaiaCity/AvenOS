import * as hcloud from '@pulumi/hcloud'
import * as pulumi from '@pulumi/pulumi'
import * as random from '@pulumi/random'
import * as tls from '@pulumi/tls'
import { renderCloudInit } from './cloud-init.mjs'
import { loadPlatformConfig, requireProviderToken } from './config.mjs'
import { manualIdentityRecordSpecs, platformRecordSpecs } from './dns.mjs'

const config = loadPlatformConfig()
const teardown = process.env.PLATFORM_TEARDOWN === 'true'
const protect = { protect: !teardown }
const replaceable = { protect: false }
const keepExistingDuringTeardown = (...properties) =>
	teardown ? { ignoreChanges: properties } : {}

const computeProvider = new hcloud.Provider('platform-compute-provider', {
	token: pulumi.secret(requireProviderToken(process.env, 'HETZNER_COMPUTE_TOKEN'))
})
const dnsProvider =
	config.target === 'platform'
		? new hcloud.Provider('platform-dns-provider', {
				token: pulumi.secret(requireProviderToken(process.env, 'HETZNER_DNS_TOKEN'))
			})
		: undefined

const selectedServerType = (name) =>
	hcloud.getServerTypeOutput({ name }, { provider: computeProvider }).apply((serverType) => {
		if (serverType.architecture !== 'x86')
			throw new Error(`${name} is not an amd64-compatible Hetzner server type`)
		return serverType.name ?? name
	})

const firewallRules = [
	{
		direction: 'in',
		protocol: 'tcp',
		port: '80',
		sourceIps: ['0.0.0.0/0', '::/0'],
		description: 'HTTP ACME and redirect'
	},
	{
		direction: 'in',
		protocol: 'tcp',
		port: '443',
		sourceIps: ['0.0.0.0/0', '::/0'],
		description: 'HTTPS ingress'
	},
	{
		direction: 'in',
		protocol: 'udp',
		port: '443',
		sourceIps: ['0.0.0.0/0', '::/0'],
		description: 'HTTP/3 ingress'
	},
	{
		direction: 'in',
		protocol: 'tcp',
		port: '22',
		sourceIps: config.sshAllowedCidrs,
		description: 'Deployment SSH'
	},
	{
		direction: 'in',
		protocol: 'icmp',
		sourceIps: ['0.0.0.0/0', '::/0'],
		description: 'Diagnostics'
	}
]

function createHost({ resource, deploymentId, appRoot, serverType, volumeSize }) {
	const labels = {
		application: resource,
		deployment: deploymentId,
		environment: config.environment
	}
	const hostKey = new tls.PrivateKey(`${resource}-host-key`, { algorithm: 'ED25519' }, replaceable)
	const adminKey = new tls.PrivateKey(
		`${resource}-admin-key`,
		{ algorithm: 'ED25519' },
		replaceable
	)
	const deployKey = new tls.PrivateKey(
		`${resource}-deploy-key`,
		{ algorithm: 'ED25519' },
		replaceable
	)
	const observeKey = new tls.PrivateKey(
		`${resource}-observe-key`,
		{ algorithm: 'ED25519' },
		replaceable
	)
	const tunnelKey = new tls.PrivateKey(
		`${resource}-tunnel-key`,
		{ algorithm: 'ED25519' },
		replaceable
	)
	const registeredDeployKey = new hcloud.SshKey(
		`${resource}-deploy-key-registration`,
		{
			name: `${deploymentId}-deploy`,
			publicKey: deployKey.publicKeyOpenssh,
			labels
		},
		{ ...replaceable, provider: computeProvider, deleteBeforeReplace: true }
	)
	const firewall = new hcloud.Firewall(
		`${resource}-firewall`,
		{ name: `${deploymentId}-firewall`, labels, rules: firewallRules },
		{ ...replaceable, provider: computeProvider }
	)
	const volume = new hcloud.Volume(
		`${resource}-data`,
		{
			name: `${deploymentId}-data`,
			location: config.location,
			size: volumeSize,
			format: 'ext4',
			deleteProtection: !teardown,
			labels
		},
		{
			...protect,
			...keepExistingDuringTeardown('name', 'location', 'size', 'format', 'labels'),
			provider: computeProvider
		}
	)
	const cloudInit = pulumi
		.all([
			volume.linuxDevice,
			hostKey.privateKeyOpenssh,
			hostKey.publicKeyOpenssh,
			adminKey.publicKeyOpenssh,
			deployKey.publicKeyOpenssh,
			observeKey.publicKeyOpenssh,
			tunnelKey.publicKeyOpenssh
		])
		.apply(
			([
				volumeDevice,
				sshHostPrivateKey,
				sshHostPublicKey,
				adminPublicKey,
				deployPublicKey,
				observePublicKey,
				tunnelPublicKey
			]) =>
				renderCloudInit({
					deployUser: config.deployUser,
					adminPublicKey,
					deployPublicKey,
					observePublicKey,
					tunnelPublicKey,
					sshAllowedCidrs: config.sshAllowedCidrs,
					volumeDevice,
					appRoot,
					sshHostPrivateKey,
					sshHostPublicKey
				})
		)
	const server = new hcloud.Server(
		`${resource}-server`,
		{
			name: `${deploymentId}-server`,
			location: config.location,
			serverType: selectedServerType(serverType),
			image: config.osImage,
			backups: false,
			deleteProtection: false,
			rebuildProtection: false,
			keepDisk: false,
			firewallIds: [firewall.id.apply(Number)],
			sshKeys: [registeredDeployKey.id],
			publicNets: [{ ipv4Enabled: true, ipv6Enabled: true }],
			userData: pulumi.secret(cloudInit),
			labels
		},
		{
			...replaceable,
			deleteBeforeReplace: true,
			...keepExistingDuringTeardown(
				'name',
				'location',
				'serverType',
				'image',
				'backups',
				'firewallIds',
				'sshKeys',
				'publicNets',
				'userData',
				'labels'
			),
			provider: computeProvider
		}
	)
	const attachment = new hcloud.VolumeAttachment(
		`${resource}-data-attachment`,
		{ serverId: server.id.apply(Number), volumeId: volume.id.apply(Number), automount: false },
		{
			...replaceable,
			provider: computeProvider,
			dependsOn: [server, volume],
			deleteBeforeReplace: true
		}
	)
	return {
		server,
		firewall,
		volume,
		attachment,
		hostKey,
		adminKey,
		deployKey,
		observeKey,
		tunnelKey
	}
}

const identity =
	config.target === 'identity'
		? createHost({
				resource: 'identity',
				deploymentId: config.identityDeploymentId,
				appRoot: '/opt/aven/identity',
				serverType: config.serverType,
				volumeSize: config.volumeSize
			})
		: undefined
const platform =
	config.target === 'platform'
		? createHost({
				resource: 'platform',
				deploymentId: config.platformDeploymentId,
				appRoot: '/opt/aven/platform',
				serverType: config.serverType,
				volumeSize: config.volumeSize
			})
		: undefined

const createDnsRecords = (records, dependsOn) =>
	records.map(
		(record) =>
			new hcloud.ZoneRrset(
				record.resourceName,
				{
					zone: record.zone,
					name: record.name,
					type: record.type,
					ttl: record.ttl,
					changeProtection: !teardown,
					records: [{ value: record.value }]
				},
				{
					...protect,
					...keepExistingDuringTeardown('zone', 'name', 'type', 'ttl', 'records'),
					provider: dnsProvider,
					dependsOn
				}
			)
	)

const platformDns = platform
	? createDnsRecords(
			platformRecordSpecs({
				zone: config.platformDnsZone,
				hostnames: config.platformHostnames,
				ipv4: platform.server.ipv4Address,
				ipv6: platform.server.ipv6Address
			}),
			[platform.server]
		)
	: []

const password = (name, length = 48) =>
	new random.RandomPassword(name, { length, special: false }, replaceable).result

const identitySecrets = identity
	? {
			postgres: pulumi.secret(password('identity-postgres-password')),
			auth: pulumi.secret(password('identity-auth-password')),
			accounts: pulumi.secret(password('identity-accounts-password')),
			authorization: pulumi.secret(password('identity-authorization-password')),
			migrator: pulumi.secret(password('identity-migrator-password')),
			backup: pulumi.secret(password('identity-backup-password')),
			betterAuth: pulumi.secret(password('identity-better-auth-secret', 64))
		}
	: {}

const platformSecrets = platform
	? {
			postgres: pulumi.secret(password('platform-postgres-password')),
			backup: pulumi.secret(password('platform-backup-password')),
			identityProvisioning: pulumi.secret(password('platform-identity-provisioning-secret', 64)),
			checkoutRuntime: pulumi.secret(password('checkout-runtime-password')),
			checkoutWebhook: pulumi.secret(password('checkout-webhook-password')),
			checkoutMigrator: pulumi.secret(password('checkout-migrator-password')),
			checkoutEmail: pulumi.secret(password('checkout-email-password')),
			checkoutPlatformEvents: pulumi.secret(password('checkout-platform-events-password')),
			apiHosting: pulumi.secret(password('api-hosting-password')),
			apiAuthorization: pulumi.secret(password('api-authorization-password')),
			apiEntitlements: pulumi.secret(password('api-entitlements-password')),
			apiReconciler: pulumi.secret(password('api-reconciler-password')),
			apiMigrator: pulumi.secret(password('api-migrator-password')),
			customerProvisioner: pulumi.secret(password('customer-provisioner-password')),
			artifactStoreProvisionerDb: pulumi.secret(password('artifact-store-provisioner-db-password')),
			intentDatabaseCredentialRoot: pulumi.secret(password('intent-database-credential-root', 64)),
			artifactApiDatabaseCredentialRoot: pulumi.secret(
				password('artifact-api-database-credential-root', 64)
			),
			actorApiDatabaseCredentialRoot: pulumi.secret(
				password('actor-api-database-credential-root', 64)
			),
			actorWorkerDatabaseCredentialRoot: pulumi.secret(
				password('actor-worker-database-credential-root', 64)
			),
			customerEntitlementToken: pulumi.secret(password('customer-entitlement-token', 64)),
			intentServiceToken: pulumi.secret(password('intent-service-token', 64)),
			actorRunnerServiceToken: pulumi.secret(password('actor-runner-service-token', 64)),
			artifactStoreServiceToken: pulumi.secret(password('artifact-store-service-token', 64)),
			actorRunnerArtifactStoreToken: pulumi.secret(
				password('actor-runner-artifact-store-token', 64)
			),
			actorRunnerLlmGatewayToken: pulumi.secret(password('actor-runner-llm-gateway-token', 64)),
			artifactStoreProvisionerToken: pulumi.secret(
				password('artifact-store-provisioner-token', 64)
			),
			siteHostDirectoryToken: pulumi.secret(password('site-host-directory-token', 64)),
			checkoutFacadeToken: pulumi.secret(password('checkout-facade-token', 64)),
			checkoutEmailEncryptionKey: pulumi.secret(
				new random.RandomBytes('checkout-email-encryption-key', { length: 32 }, protect).base64
			)
		}
	: {}

const tenantGrantKey = platform
	? new tls.PrivateKey('tenant-grant-signing-key', { algorithm: 'ED25519' }, replaceable)
	: undefined

export const deployUser = config.deployUser
export const deploymentTarget = config.target
export const deploymentEnvironment = config.environment
export const identityHostname = identity ? config.identityHostname : undefined
export const platformApexHostname = platform ? config.platformHostnames.apex : undefined
export const platformApiHostname = platform ? config.platformHostnames.api : undefined
export const platformCheckoutHostname = platform ? config.platformHostnames.checkout : undefined
export const identityIpv4Address = identity?.server.ipv4Address
export const identityIpv6Address = identity?.server.ipv6Address
export const identityDnsRecords = identity
	? pulumi
			.all([identity.server.ipv4Address, identity.server.ipv6Address])
			.apply(([ipv4, ipv6]) =>
				manualIdentityRecordSpecs({ hostname: config.identityHostname, ipv4, ipv6 })
			)
	: undefined
export const platformIpv4Address = platform?.server.ipv4Address
export const platformIpv6Address = platform?.server.ipv6Address
export const identityHostPublicKey = identity?.hostKey.publicKeyOpenssh
export const platformHostPublicKey = platform?.hostKey.publicKeyOpenssh
export const identityAdminPrivateKey = identity
	? pulumi.secret(identity.adminKey.privateKeyOpenssh)
	: undefined
export const platformAdminPrivateKey = platform
	? pulumi.secret(platform.adminKey.privateKeyOpenssh)
	: undefined
export const identityDeployPrivateKey = identity
	? pulumi.secret(identity.deployKey.privateKeyOpenssh)
	: undefined
export const identityObservePrivateKey = identity
	? pulumi.secret(identity.observeKey.privateKeyOpenssh)
	: undefined
export const identityTunnelPrivateKey = identity
	? pulumi.secret(identity.tunnelKey.privateKeyOpenssh)
	: undefined
export const platformDeployPrivateKey = platform
	? pulumi.secret(platform.deployKey.privateKeyOpenssh)
	: undefined
export const platformObservePrivateKey = platform
	? pulumi.secret(platform.observeKey.privateKeyOpenssh)
	: undefined
export const platformTunnelPrivateKey = platform
	? pulumi.secret(platform.tunnelKey.privateKeyOpenssh)
	: undefined
export const identityPostgresPassword = identitySecrets.postgres
export const identityAuthPassword = identitySecrets.auth
export const identityAccountsPassword = identitySecrets.accounts
export const identityAuthorizationPassword = identitySecrets.authorization
export const identityMigratorPassword = identitySecrets.migrator
export const identityBackupPassword = identitySecrets.backup
export const identityBetterAuthSecret = identitySecrets.betterAuth
export const platformPostgresPassword = platformSecrets.postgres
export const platformBackupPassword = platformSecrets.backup
export const platformIdentityProvisioningSecret = platformSecrets.identityProvisioning
export const checkoutRuntimePassword = platformSecrets.checkoutRuntime
export const checkoutWebhookPassword = platformSecrets.checkoutWebhook
export const checkoutMigratorPassword = platformSecrets.checkoutMigrator
export const checkoutEmailPassword = platformSecrets.checkoutEmail
export const checkoutPlatformEventsPassword = platformSecrets.checkoutPlatformEvents
export const apiHostingPassword = platformSecrets.apiHosting
export const apiAuthorizationPassword = platformSecrets.apiAuthorization
export const apiEntitlementsPassword = platformSecrets.apiEntitlements
export const apiReconcilerPassword = platformSecrets.apiReconciler
export const apiMigratorPassword = platformSecrets.apiMigrator
export const customerProvisionerPassword = platformSecrets.customerProvisioner
export const artifactStoreProvisionerDbPassword = platformSecrets.artifactStoreProvisionerDb
export const intentDatabaseCredentialRoot = platformSecrets.intentDatabaseCredentialRoot
export const artifactApiDatabaseCredentialRoot = platformSecrets.artifactApiDatabaseCredentialRoot
export const actorApiDatabaseCredentialRoot = platformSecrets.actorApiDatabaseCredentialRoot
export const actorWorkerDatabaseCredentialRoot = platformSecrets.actorWorkerDatabaseCredentialRoot
export const customerEntitlementToken = platformSecrets.customerEntitlementToken
export const intentServiceToken = platformSecrets.intentServiceToken
export const actorRunnerServiceToken = platformSecrets.actorRunnerServiceToken
export const artifactStoreServiceToken = platformSecrets.artifactStoreServiceToken
export const actorRunnerArtifactStoreToken = platformSecrets.actorRunnerArtifactStoreToken
export const actorRunnerLlmGatewayToken = platformSecrets.actorRunnerLlmGatewayToken
export const artifactStoreProvisionerToken = platformSecrets.artifactStoreProvisionerToken
export const tenantGrantPrivateKey = tenantGrantKey
	? pulumi.secret(tenantGrantKey.privateKeyPem)
	: undefined
export const tenantGrantPublicKey = tenantGrantKey?.publicKeyPem
export const siteHostDirectoryToken = platformSecrets.siteHostDirectoryToken
export const checkoutFacadeToken = platformSecrets.checkoutFacadeToken
export const checkoutEmailEncryptionKey = platformSecrets.checkoutEmailEncryptionKey
export const dnsRecordIds = platformDns.map((record) => record.id)
