import { createSocket } from 'node:dgram'

const address = [192, 0, 2, 10]

function questionEnd(message: Buffer): number {
	let offset = 12
	while (offset < message.length && message[offset] !== 0) offset += (message[offset] as number) + 1
	if (offset + 5 > message.length) throw new Error('invalid DNS question')
	return offset + 5
}

function questionName(message: Buffer): string {
	const labels: string[] = []
	let offset = 12
	while (offset < message.length) {
		const length = message[offset] as number
		if (length === 0) return labels.join('.').toLowerCase()
		offset += 1
		if (offset + length > message.length) throw new Error('invalid DNS name')
		labels.push(message.subarray(offset, offset + length).toString('ascii'))
		offset += length
	}
	throw new Error('unterminated DNS name')
}

function answer(message: Buffer): Buffer {
	const end = questionEnd(message)
	const type = message.readUInt16BE(end - 4)
	const matches = questionName(message) === 'aven.ceo' && type === 1
	const header = Buffer.alloc(12)
	message.copy(header, 0, 0, 2)
	header.writeUInt16BE(0x8180, 2)
	header.writeUInt16BE(1, 4)
	header.writeUInt16BE(matches ? 1 : 0, 6)
	if (!matches) return Buffer.concat([header, message.subarray(12, end)])
	const record = Buffer.alloc(16)
	record.writeUInt16BE(0xc00c, 0)
	record.writeUInt16BE(1, 2)
	record.writeUInt16BE(1, 4)
	record.writeUInt32BE(30, 6)
	record.writeUInt16BE(4, 10)
	Buffer.from(address).copy(record, 12)
	return Buffer.concat([header, message.subarray(12, end), record])
}

const server = createSocket('udp4')
server.on('message', (message, remote) => {
	try {
		server.send(answer(message), remote.port, remote.address)
	} catch {
		// Malformed fixture traffic gets no response.
	}
})
export const ready = new Promise<void>((resolve, reject) => {
	server.once('error', reject)
	server.bind(5353, '127.0.0.1', () => resolve())
})
