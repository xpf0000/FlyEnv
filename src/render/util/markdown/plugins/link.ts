// markdown-it plugin for:
// 1. adding target="_blank" to external links
// 2. normalize internal links to end with `.html`

import type MarkdownIt from 'markdown-it'
import { isExternal, treatAsHtml } from '../shared'

const indexRE = /(^|.*\/)index.md(#?.*)$/i

export const linkPlugin = (md: MarkdownIt, externalAttrs: Record<string, string>, base: string) => {
  md.renderer.rules.link_open = (tokens, idx, options, env: undefined, self) => {
    const token = tokens[idx]
    const hrefIndex = token.attrIndex('href')
    const targetIndex = token.attrIndex('target')
    const downloadIndex = token.attrIndex('download')
    if (hrefIndex >= 0 && targetIndex < 0 && downloadIndex < 0) {
      const hrefAttr = token.attrs![hrefIndex]
      const url = hrefAttr[1]
      if (isExternal(url)) {
        Object.entries(externalAttrs).forEach(([key, val]) => {
          token.attrSet(key, val)
        })
        // catch localhost links as dead link
        hrefAttr[1] = url
      } else {
        const { pathname, protocol } = new URL(url, 'http://a.com')

        if (
          // skip internal anchor links
          !url.startsWith('#') &&
          // skip mail/custom protocol links
          protocol.startsWith('http') &&
          // skip links to files (other than html/md)
          treatAsHtml(pathname)
        ) {
          normalizeHref(hrefAttr)
        } else if (url.startsWith('#')) {
          hrefAttr[1] = decodeURI(hrefAttr[1])
        }

        // append base to internal (non-relative) urls
        if (hrefAttr[1].startsWith('/')) {
          hrefAttr[1] = `${base}${hrefAttr[1]}`.replace(/\/+/g, '/')
        }
      }
    }
    return self.renderToken(tokens, idx, options)
  }

  function normalizeHref(hrefAttr: [string, string]) {
    let url = hrefAttr[1]

    const indexMatch = url.match(indexRE)
    if (indexMatch) {
      const [, path, hash] = indexMatch
      url = path + hash
    } else {
      const cleanUrl = url.replace(/[?#].*$/, '')
      const parsed = new URL(url, 'http://a.com')
      url = cleanUrl + parsed.search + parsed.hash
    }

    // ensure leading . for relative paths
    if (!url.startsWith('/') && !url.startsWith('./')) {
      url = './' + url
    }

    // markdown-it encodes the uri
    hrefAttr[1] = decodeURI(url)
  }
}
