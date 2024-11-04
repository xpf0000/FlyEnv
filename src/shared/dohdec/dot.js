import * as crypto from 'crypto'
import * as packet from 'dns-packet'
import * as tls from 'tls'
import { Buffer } from 'buffer'
import { default as DNSutils } from './dnsUtils.js'
import { default as NoFilter } from 'nofilter'
import { Writable } from 'stream'
import util from 'util'

const randomBytes = util.promisify(crypto.randomBytes)

const DEFAULT_SERVER = '1.1.1.1'

/**
 * Options for doing DOT lookups.
 *
 * @typedef {object} DOT_LookupOptions
 * @property {string} [name] The DNS name to look up.
 * @property {string} [rrtype='A'] The Resource Record type
 *   to retrive.
 * @property {number} [id] 2-byte ID for the DNS packet.  Defaults to random.
 * @property {boolean} [decode=true] Decode the response, either into JSON
 *   or an object representing the DNS format result.
 * @property {boolean} [dnssec=false] Request DNSSec records.  Currently
 *   requires `json: false`.
 */

/**
 * @callback pendingResolve
 * @param {Buffer|object} results The results of the DNS query.
 */

/**
 * @callback pendingError
 * @param {Error} error The error that occurred.
 */

/**
 * @typedef {object} Pending
 * @property {pendingResolve} resolve Callback for success.
 * @property {pendingError} reject Callback for error.
 * @property {DOT_LookupOptions} opts The original options for the request.
 */

/**
 * A class that manages a connection to a DNS-over-TLS server.  The first time
 * [lookup]{@link DNSoverTLS#lookup} is called, a connection will be created.
 * If that connection is timed out by the server, a new connection will be
 * created as needed.
 *
 * If you want to do certificate pinning, make sure that the `hash` and
 * `hashAlg` options are set correctly to a hash of the DER-encoded
 * certificate that the server will offer.
 */
export class DNSoverTLS extends DNSutils {
  /**
   * Construct a new DNSoverTLS.
   *
   * @param {object} opts Options.
   * @param {string} [opts.host='1.1.1.1'] Server to connect to.
   * @param {number} [opts.port=853] TCP port number for server.
   * @param {string} [opts.hash] Hex-encoded hash of the DER-encoded cert
   *   expected from the server.  If not specified, no pinning checks are
   *   performed.
   * @param {string} [opts.hashAlg='sha256'] Hash algorithm for cert pinning.
   * @param {boolean} [opts.rejectUnauthorized=true] Should the server
   *   certificate even be checked using the normal TLS approach?
   * @param {number} [opts.verbose=0] How verbose do you want your logging?
   * @param {Writable} [opts.verboseStream=process.stderr] Where to write
   *   verbose output.
   */
  constructor(opts = {}) {
    const { verbose, verboseStream, ...rest } = opts

    super({ verbose, verboseStream })
    this.opts = {
      host: DNSoverTLS.server,
      port: 853,
      hashAlg: 'sha256',
      rejectUnauthorized: true,
      checkServerIdentity: this._checkServerIdentity.bind(this),
      ...rest
    }
    this.verbose(1, 'DNSoverTLS options:', this.opts)
    this._reset()
  }

  _reset() {
    this.size = -1

    /** @type {tls.TLSSocket} */
    this.socket = null

    /** @type {Object.<number, Pending>} */ // eslint-disable-line jsdoc/check-types, max-len
    this.pending = {}

    /** @type {NoFilter} */
    this.nof = null

    /** @type {Buffer[]} */
    this.bufs = []
  }

  /**
   * @returns {Promise<void>}
   * @private
   */
  _connect() {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        resolve()
        return
      }

      /**
       * Fired right before connection is attempted.
       *
       * @event DNSoverTLS#connect
       * @property {object} cert [lookup]{@link DNSoverTLS#lookup} options.
       */
      this.emit('connect', this.opts)
      this.verbose(1, 'CONNECT:', this.opts)

      this.nof = new NoFilter()
      this.socket = tls.connect(this.opts, resolve)
      this.socket.on('data', this._data.bind(this))
      this.socket.on('error', reject)
      this.socket.on('end', this._disconnected.bind(this))
    })
  }

  _checkServerIdentity(host, cert) {
    // Same as cert.fingerprint256, but with hash agility
    const hash = DNSoverTLS.hashCert(cert, this.opts.hashAlg)

    /* eslint-disable max-len */
    /**
     * Fired on connection when the server sends a certificate.
     *
     * @event DNSoverTLS#certificate
     * @property {crypto.Certificate} cert
     *   A [crypto.Certificate]{@link https://nodejs.org/api/crypto.html#crypto_class_certificate}
     *   from the server.
     * @property {string} host The hostname the client thinks it is connecting to.
     * @property {string} hash The hash computed over the cert.
     */
    this.emit('certificate', cert, host, hash)
    /* eslint-enable max-len */

    this.verbose(2, 'CERTIFICATE:', () => DNSutils.buffersToB64(cert))
    const err = tls.checkServerIdentity(host, cert)
    if (!err) {
      if (this.opts.hash && this.opts.hash !== hash) {
        return new Error(`Invalid cert hash for ${this.opts.host}:${this.opts.port}.
Expected: "${this.opts.hash}"
Received: "${hash}"`)
      }
    } else if (this.opts.hash !== hash) {
      return err
    }
    return undefined
  }

  /**
   * Server socket was disconnected.  Clean up any pending requests.
   *
   * @private
   */
  _disconnected() {
    for (const { reject, opts } of Object.values(this.pending)) {
      reject(new Error(`Timeout looking up "${opts.name}":${opts.rrtype}`))
    }
    this._reset()

    /**
     * Server disconnected.  All pending requests will have failed.
     *
     * @event DNSoverTLS#disconnect
     */
    this.emit('disconnect')
    this.verbose(1, 'DISCONNECT')
  }

  /**
   * Parse data if enough is available.
   *
   * @param {Buffer} b Data read from socket.
   * @private
   */
  _data(b) {
    /**
     * A buffer of data has been received from the server.  Useful for
     * verbose logging, e.g.
     *
     * @event DNSoverTLS#receive
     */
    this.emit('receive', b)
    this.nof.write(b)

    // There might be multiple results in one read.
    while (this.nof.length > 0) {
      // No size read yet
      if (this.size === -1) {
        if (this.nof.length < 2) {
          return
        }

        this.size = this.nof.readUInt16BE()
      }
      if (this.nof.length < this.size) {
        return
      }
      const buf = this.nof.read(this.size)
      this.verbose(1, 'RECV:')
      this.hexDump(1, buf)

      this.size = -1
      const pkt = packet.decode(buf)
      const pend = this.pending[pkt.id]
      if (!pend) {
        // Something bad happened, like an injection attack or a corrupted
        // result. Abandon everything pending.
        this.close()
        return
      }
      pend.resolve(pend.opts.decode ? pkt : buf)
    }
  }

  /**
   * Generate a currently-unused random ID.
   *
   * @returns {Promise<number>} A random 2-byte ID number.
   * @private
   */
  async _id() {
    let id = null
    do {
      id = (await randomBytes(2)).readUInt16BE()
    } while (this.pending[id])
    return id
  }

  /**
   * Hash a certificate using the given algorithm.
   *
   * @param {Buffer|crypto.X509Certificate} cert The cert to hash.
   * @param {string} [hashAlg="sha256"] The hash algorithm to use.
   * @returns {string} Hex string.
   * @throws {Error} Unknown certificate type.
   */
  static hashCert(cert, hashAlg = 'sha256') {
    const hash = crypto.createHash(hashAlg)
    if (Buffer.isBuffer(cert)) {
      hash.update(cert)
    } else if (cert.raw) {
      hash.update(cert.raw)
    } else {
      throw new Error('Unknown certificate type')
    }

    return hash.digest('hex')
  }

  /**
   * Look up a name in the DNS, over TLS.
   *
   * @param {DOT_LookupOptions|string} name The DNS name to look up, or opts
   *   if this is an object.
   * @param {DOT_LookupOptions|string} [opts={}] Options for the
   *   request.  If a string is given, it will be used as the rrtype.
   * @returns {Promise<Buffer|object>} Response.
   */
  async lookup(name, opts = {}) {
    const nopts = DNSutils.normalizeArgs(name, opts, {
      rrtype: 'A',
      dnsssec: false,
      decode: true,
      stream: true
    })
    this.verbose(1, 'DNSoverTLS.lookup options:', nopts)

    await this._connect()
    if (!nopts.id) {
      // eslint-disable-next-line require-atomic-updates
      nopts.id = await this._id()
    }

    return new Promise((resolve, reject) => {
      const pkt = DNSutils.makePacket(nopts)

      this.verbose(1, 'REQUEST:')
      this.hexDump(2, pkt)
      this.verbose(
        1,
        'Length:',
        () => pkt.readUInt16BE(0),
        () => packet.decode(pkt, 2) // Skip length
      )

      this.pending[nopts.id] = { resolve, reject, opts: nopts }

      this.socket.write(pkt)

      /**
       * A buffer of data has been sent to the server.  Useful for
       * verbose logging, e.g.
       *
       * @event DNSoverTLS#send
       */
      this.emit('send', pkt)
      this.verbose(2, 'REQUEST:', pkt)
    })
  }

  /**
   * Close the socket.
   *
   * @returns {Promise<void>} Resolved on socket close.
   */
  close() {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        this.socket.end(null, () => {
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}
DNSoverTLS.server = DEFAULT_SERVER

export default DNSoverTLS
