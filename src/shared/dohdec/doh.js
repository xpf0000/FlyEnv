import * as packet from 'dns-packet'
import * as tls from 'tls'
import DNSutils from './dnsUtils.js'
import { Writable } from 'stream'
import cryptoRandomString from 'crypto-random-string'
import fs from 'fs'
import got from 'got'

const pkg = {
  name: 'dohdec',
  version: '5.0.3'
}

const PAD_SIZE = 128
const WF_DNS = 'application/dns-message'
const WF_JSON = 'application/dns-json'
const CLOUDFLARE_API = 'https://cloudflare-dns.com/dns-query'
const USER_AGENT = `${pkg.name} v${pkg.version}`

/**
 * Options for doing DOH lookups.
 *
 * @typedef {object} DOH_LookupOptions
 * @property {string} [name] The DNS name to look up.
 * @property {string} [rrtype='A'] The Resource Record type
 *   to retrive.
 * @property {boolean} [json=true] Retrieve a JSON response.  If false,
 *   retrieve using DNS format.
 * @property {boolean} [decode=true] Decode the response, either into JSON
 *   or an object representing the DNS format result.
 * @property {boolean} [preferPost=true] For DNS format requests, should
 *   the HTTP POST verb be used?  If false, uses GET.
 * @property {boolean} [dnssec=false] Request DNSSec records.  Currently
 *   requires `json: false`.
 * @property {string} [url=CLOUDFLARE_API] What DoH endpoint should be
 *   used?
 */

/**
 * Request DNS information over HTTPS.  The [lookup]{@link DNSoverHTTPS#lookup}
 * function provides the easiest-to-use defaults.
 */
export class DNSoverHTTPS extends DNSutils {
  /**
   * Create a DNSoverHTTPS instance.
   *
   * @param {object} opts Options for all requests.
   * @param {string} [opts.userAgent="packageName version"] User Agent for
   *   HTTP request.
   * @param {string} [opts.url="https://cloudflare-dns.com/dns-query"] Base URL
   *   for all HTTP requests.
   * @param {boolean} [opts.preferPost=true] Should POST be preferred to Get
   *   for DNS-format queries?
   * @param {string} [opts.contentType="application/dns-udpwireformat"]
   *   MIME type for POST.
   * @param {number} [opts.verbose=0] How verbose do you want your logging?
   * @param {Writable} [opts.verboseStream=process.stderr] Where to write
   *   verbose output.
   * @param {boolean} [opts.http2=false] Use http/2 if it is available.
   */
  constructor(opts = {}) {
    const { verbose, verboseStream, ...rest } = opts
    super({ verbose, verboseStream })
    this.opts = {
      userAgent: DNSoverHTTPS.userAgent,
      url: DNSoverHTTPS.defaultURL,
      preferPost: true,
      contentType: WF_DNS,
      http2: false,
      ...rest
    }

    this.hooks =
      this._verbose > 0
        ? {
            beforeRequest: [
              (options) => {
                this.verbose(1, `HTTP ${options.method} headers:`, options.headers)
                this.verbose(1, `HTTP ${options.method} URL: ${options.url.toString()}`)
              }
            ]
          }
        : undefined

    this.verbose(1, 'DNSoverHTTPS options:', this.opts)
  }

  /**
   * @private
   * @ignore
   */
  _checkServerIdentity() {
    return {
      // This doesn't fire in nock tests.
      checkServerIdentity: (host, cert) => {
        this.verbose(3, 'CERTIFICATE:', () => DNSutils.buffersToB64(cert))
        return tls.checkServerIdentity(host, cert)
      }
    }
  }

  /**
   * Get a DNS-format response.
   *
   * @param {DOH_LookupOptions} opts Options for the request.
   * @returns {Promise<Buffer|object>} DNS result.
   */
  async getDNS(opts) {
    this.verbose(1, 'DNSoverHTTPS.getDNS options:', opts)

    const pkt = DNSutils.makePacket(opts)
    let url = opts.url || this.opts.url
    let body = pkt

    this.verbose(1, 'REQUEST:', () => packet.decode(pkt))
    this.hexDump(2, pkt)

    if (!this.opts.preferPost) {
      url += `?dns=${DNSutils.base64urlEncode(pkt)}`
      body = undefined
    }
    const response = await got(url, {
      method: this.opts.preferPost ? 'POST' : 'GET',
      headers: {
        'Content-Type': this.opts.contentType,
        'User-Agent': this.opts.userAgent,
        Accept: this.opts.contentType
      },
      body,
      https: this._checkServerIdentity(),
      http2: this.opts.http2,
      hooks: this.hooks,
      retry: {
        limit: 0
      }
    }).buffer()
    this.hexDump(2, response)
    this.verbose(1, 'RESPONSE:', () => packet.decode(response))

    return opts.decode ? packet.decode(response) : response
  }

  /**
   * Make a HTTPS GET request for JSON DNS.
   *
   * @param {object} opts Options for the request.
   * @param {string} [opts.name] The name to look up.
   * @param {string} [opts.rrtype="A"] The record type to look up.
   * @param {boolean} [opts.decode=true] Parse the returned JSON?
   * @param {boolean} [opts.dnssec=false] Request DNSSEC records.
   * @returns {Promise<string|object>} DNS result.
   */
  getJSON(opts) {
    this.verbose(1, 'DNSoverHTTPS.getJSON options: ', opts)

    const rrtype = opts.rrtype || 'A'
    let req = `${this.opts.url}?name=${opts.name}&type=${rrtype}`
    if (opts.dnssec) {
      req += '&do=1'
    }
    req += '&random_padding='
    req += cryptoRandomString({
      length: Math.ceil(req.length / PAD_SIZE) * PAD_SIZE - req.length,
      type: 'url-safe'
    })
    this.verbose(1, 'REQUEST:', req)

    const r = got(req, {
      headers: {
        'User-Agent': this.opts.userAgent,
        Accept: WF_JSON
      },
      https: this._checkServerIdentity(),
      http2: this.opts.http2,
      hooks: this.hooks,
      retry: {
        limit: 0
      }
    })

    const decode = Object.prototype.hasOwnProperty.call(opts, 'decode') ? opts.decode : true
    return decode ? r.json() : r.text()
  }

  /**
   * Look up a DNS entry using DNS-over-HTTPS (DoH).
   *
   * @param {string|DOH_LookupOptions} name The DNS name to look up, or opts
   *   if this is an object.
   * @param {DOH_LookupOptions|string} [opts={}] Options for the
   *   request.  If a string is given, it will be used as the rrtype.
   * @returns {Promise<Buffer|string|object>} DNS result.
   */
  lookup(name, opts = {}) {
    const nopts = DNSutils.normalizeArgs(name, opts, {
      rrtype: 'A',
      json: true,
      decode: true,
      dnssec: false
    })
    this.verbose(1, 'DNSoverHTTPS.lookup options:', nopts)

    return nopts.json ? this.getJSON(nopts) : this.getDNS(nopts)
  }

  // eslint-disable-next-line class-methods-use-this
  close() {
    // No-op for now
  }
}

function setStatic(c) {
  // Hide these from typescript
  c.userAgent = USER_AGENT
  c.defaultURL = CLOUDFLARE_API
}

/** @type {string} */
DNSoverHTTPS.version = pkg.version
DNSoverHTTPS.userAgent = ''
DNSoverHTTPS.defaultURL = ''
setStatic(DNSoverHTTPS)

export default DNSoverHTTPS
