import { generateKeyPairSync, randomBytes } from 'node:crypto'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const publicJwk = publicKey.export({ format: 'jwk' })
const privateJwk = privateKey.export({ format: 'jwk' })
const publicBytes = Buffer.concat([Buffer.from([4]), Buffer.from(publicJwk.x, 'base64url'), Buffer.from(publicJwk.y, 'base64url')])

console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicBytes.toString('base64url')}`)
console.log(`VAPID_PRIVATE_KEY=${privateJwk.d}`)
console.log(`CRON_SECRET=${randomBytes(32).toString('base64url')}`)
