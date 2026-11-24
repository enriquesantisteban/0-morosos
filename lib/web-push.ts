import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from 'node:crypto'

const base64url = (value: Buffer | string) => Buffer.from(value).toString('base64url')
const fromBase64url = (value: string) => Buffer.from(value, 'base64url')

function hmac(key: Buffer, value: Buffer) {
  return createHmac('sha256', key).update(value).digest()
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number) {
  let output = Buffer.alloc(0)
  let previous = Buffer.alloc(0)
  for (let counter = 1; output.length < length; counter += 1) {
    previous = hmac(prk, Buffer.concat([previous, info, Buffer.from([counter])]))
    output = Buffer.concat([output, previous])
  }
  return output.subarray(0, length)
}

function vapidKeys() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) throw new Error('Faltan las claves VAPID.')
  const publicBytes = fromBase64url(publicKey)
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new Error('La clave pública VAPID no es válida.')
  const privateBytes = fromBase64url(privateKey)
  if (privateBytes.length !== 32) throw new Error('La clave privada VAPID no es válida.')
  const signingKey = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: base64url(publicBytes.subarray(1, 33)), y: base64url(publicBytes.subarray(33, 65)), d: base64url(privateBytes) },
    format: 'jwk',
  })
  return { publicKey, signingKey }
}

function createVapidToken(audience: string) {
  const { publicKey, signingKey } = vapidKeys()
  const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const claims = base64url(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 3600, sub: 'mailto:notifications@0morosos.es' }))
  const content = `${header}.${claims}`
  const signature = sign('sha256', Buffer.from(content), { key: signingKey, dsaEncoding: 'ieee-p1363' })
  return { token: `${content}.${base64url(signature)}`, publicKey }
}

function encryptPayload(payload: string, p256dh: string, auth: string) {
  const clientPublicKey = fromBase64url(p256dh)
  const authSecret = fromBase64url(auth)
  if (clientPublicKey.length !== 65 || clientPublicKey[0] !== 4 || authSecret.length < 16) throw new Error('La suscripción push no es válida.')

  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const serverPublicKey = ecdh.getPublicKey()
  const sharedSecret = ecdh.computeSecret(clientPublicKey)
  const keyPrk = hmac(authSecret, sharedSecret)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), clientPublicKey, serverPublicKey])
  const inputKeyMaterial = hkdfExpand(keyPrk, keyInfo, 32)
  const salt = randomBytes(16)
  const contentPrk = hmac(salt, inputKeyMaterial)
  const contentKey = hkdfExpand(contentPrk, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdfExpand(contentPrk, Buffer.from('Content-Encoding: nonce\0'), 12)
  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce)
  const ciphertext = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const recordSize = Buffer.alloc(4)
  recordSize.writeUInt32BE(4096)
  return Buffer.concat([salt, recordSize, Buffer.from([serverPublicKey.length]), serverPublicKey, ciphertext])
}

export async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: string) {
  const endpoint = new URL(subscription.endpoint)
  if (endpoint.protocol !== 'https:') throw new Error('El destino de la notificación no es válido.')
  const encrypted = encryptPayload(payload, subscription.p256dh, subscription.auth)
  const { token, publicKey } = createVapidToken(endpoint.origin)
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${token}, k=${publicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
      Urgency: 'normal',
    },
    body: encrypted,
  })
}
