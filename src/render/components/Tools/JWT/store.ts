import { reactive } from 'vue'
import { enc, HmacSHA256, HmacSHA384, HmacSHA512 } from 'crypto-js'

type JwtAlgorithm = 'none' | 'HS256' | 'HS384' | 'HS512'

type JwtPart = Record<string, any>

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const jwtAlgorithms: JwtAlgorithm[] = ['none', 'HS256', 'HS384', 'HS512']

const hmacAlgorithms: Partial<Record<JwtAlgorithm, (value: string, secret: string) => string>> = {
  HS256: (value, secret) => HmacSHA256(value, secret).toString(enc.Base64),
  HS384: (value, secret) => HmacSHA384(value, secret).toString(enc.Base64),
  HS512: (value, secret) => HmacSHA512(value, secret).toString(enc.Base64)
}

const isSignableAlgorithm = (algorithm: JwtAlgorithm) =>
  algorithm === 'none' || !!hmacAlgorithms[algorithm]

const isJwtAlgorithm = (value: string): value is JwtAlgorithm => {
  return jwtAlgorithms.includes(value as JwtAlgorithm)
}

const base64UrlEncode = (value: string) => {
  const bytes = encoder.encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return decoder.decode(bytes)
}

const parseJson = (value: string): JwtPart => {
  const data = JSON.parse(value)
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new Error('Invalid JSON object')
  }
  return data
}

const formatJson = (value: JwtPart) => JSON.stringify(value, null, 2)

const normalizeHeader = (header: JwtPart, algorithm: JwtAlgorithm) => {
  return {
    ...header,
    alg: algorithm,
    typ: header.typ || 'JWT'
  }
}

const sign = (header: string, payload: string, secret: string, algorithm: JwtAlgorithm) => {
  const encodedHeader = base64UrlEncode(header)
  const encodedPayload = base64UrlEncode(payload)
  if (algorithm === 'none') {
    return `${encodedHeader}.${encodedPayload}.`
  }
  const signer = hmacAlgorithms[algorithm]
  if (!signer) {
    throw new Error(`${algorithm} signing is not supported locally`)
  }
  const signature = signer(`${encodedHeader}.${encodedPayload}`, secret)
  return `${encodedHeader}.${encodedPayload}.${signature.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`
}

const defaultHeader = formatJson({
  alg: 'HS256',
  typ: 'JWT'
})

const defaultPayload = formatJson({
  sub: '1234567890',
  name: 'FlyEnv',
  iat: 1516239022
})

const defaultSecret = 'your-256-bit-secret'

const store = reactive({
  algorithms: jwtAlgorithms,
  algorithm: 'HS256' as JwtAlgorithm,
  secret: defaultSecret,
  header: defaultHeader,
  payload: defaultPayload,
  token: '',
  decodedToken: '',
  decodedHeader: '',
  decodedPayload: '',
  decodeSecret: defaultSecret,
  decodeAlgorithm: 'HS256' as JwtAlgorithm,
  encodeError: '',
  decodeError: '',
  signatureValid: false,
  isSignableAlgorithm,
  onAlgorithmChange() {
    this.encodeError = ''
    try {
      const header = normalizeHeader(parseJson(this.header), this.algorithm)
      this.header = formatJson(header)
      this.createToken()
    } catch (error: any) {
      this.encodeError = error?.message ?? 'Invalid JSON'
    }
  },
  createToken() {
    this.encodeError = ''
    try {
      if (!isSignableAlgorithm(this.algorithm)) {
        throw new Error(`${this.algorithm} signing is not supported locally`)
      }
      const header = normalizeHeader(parseJson(this.header), this.algorithm)
      parseJson(this.payload)
      this.token = sign(formatJson(header), this.payload, this.secret, this.algorithm)
    } catch (error: any) {
      this.encodeError = error?.message ?? 'Invalid JSON'
    }
  },
  decode() {
    this.decodeError = ''
    this.signatureValid = false
    try {
      const parts = this.decodedToken.trim().split('.')
      if (parts.length !== 3) {
        throw new Error('JWT must contain header, payload and signature')
      }
      const header = base64UrlDecode(parts[0])
      const payload = base64UrlDecode(parts[1])
      const headerJson = parseJson(header)
      const payloadJson = parseJson(payload)
      this.decodedHeader = formatJson(headerJson)
      this.decodedPayload = formatJson(payloadJson)
      const tokenAlgorithm = String(headerJson.alg || this.decodeAlgorithm)
      if (!isJwtAlgorithm(tokenAlgorithm)) {
        throw new Error(`${String(headerJson.alg)} is not supported`)
      }
      this.decodeAlgorithm = tokenAlgorithm
      if (!isSignableAlgorithm(this.decodeAlgorithm)) {
        throw new Error(`${this.decodeAlgorithm} verification is not supported locally`)
      }
      const expected = sign(header, payload, this.decodeSecret, this.decodeAlgorithm).split('.')[2]
      this.signatureValid = expected === parts[2]
    } catch (error: any) {
      this.decodeError = error?.message ?? 'Invalid JWT'
      this.decodedHeader = ''
      this.decodedPayload = ''
    }
  },
  useCreatedToken() {
    this.decodedToken = this.token
    this.decodeSecret = this.secret
    this.decode()
  }
})

store.createToken()
store.useCreatedToken()

export default store
