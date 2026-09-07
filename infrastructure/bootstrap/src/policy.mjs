const arn = (projectId, accessKey) => `arn:aws:iam:::user/p${projectId}:${accessKey}`
const resources = (bucket) => [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`]

export function bucketPolicy({
	bucket,
	projectId,
	bootstrapAccessKey,
	deploymentAccessKey,
	observerAccessKey
}) {
	const allowed = [
		bootstrapAccessKey,
		deploymentAccessKey,
		...(observerAccessKey ? [observerAccessKey] : [])
	].map((key) => arn(projectId, key))
	const statements = [
		{
			Sid: 'DenyEveryCredentialOutsideThisTarget',
			Effect: 'Deny',
			Action: 's3:*',
			Resource: resources(bucket),
			NotPrincipal: { AWS: allowed }
		}
	]
	if (observerAccessKey) {
		statements.push({
			Sid: 'KeepObserverReadOnly',
			Effect: 'Deny',
			NotAction: [
				's3:GetObject',
				's3:GetObjectVersion',
				's3:ListBucket',
				's3:GetBucketLocation',
				's3:GetBucketVersioning'
			],
			Resource: resources(bucket),
			Principal: { AWS: arn(projectId, observerAccessKey) }
		})
	}
	return JSON.stringify({ Version: '2012-10-17', Statement: statements })
}
