class XMLParse {
  private xmlDecl = '<?xml version="1.0" encoding="UTF-8" ?>\n'
  private attr_prefix = '-'

  #addNode(hash: any, key: string, cnts: number, val: any) {
    if (cnts == 1) {
      // 1st sibling
      hash[key] = val
    } else if (cnts == 2) {
      // 2nd sibling
      hash[key] = [hash[key], val]
    } else {
      // 3rd sibling and more
      hash[key][hash[key].length] = val
    }
  }

  #parseElement(elem: HTMLElement) {
    //  COMMENT_NODE
    if (elem.nodeType == 7) {
      return
    }

    //  TEXT_NODE CDATA_SECTION_NODE
    if (elem.nodeType == 3 || elem.nodeType == 4) {
      const bool = elem?.nodeValue?.match(/[^\x00-\x20]/)
      if (!bool) return // ignore white spaces
      return elem.nodeValue
    }

    let retval
    const cnt: { [k: string]: number | undefined } = {}
    //  parse attributes
    if (elem.attributes && elem.attributes.length) {
      retval = {}
      for (let i = 0; i < elem.attributes.length; i++) {
        let key = elem?.attributes?.[i]?.nodeName
        if (!key) continue
        const val = elem.attributes[i].nodeValue
        if (!val) continue
        key = this.attr_prefix + key
        if (!cnt.hasOwnProperty(key)) {
          cnt[key] = 0
        }
        cnt[key]!++
        this.#addNode(retval, key, cnt[key]!, val)
      }
    }

    //  parse child nodes (recursive)
    if (elem.childNodes && elem.childNodes.length) {
      let textonly = true
      if (retval) textonly = false // some attributes exists
      for (let i = 0; i < elem.childNodes.length && textonly; i++) {
        const ntype = elem.childNodes[i].nodeType
        if (ntype == 3 || ntype == 4) continue
        textonly = false
      }
      if (textonly) {
        if (!retval) retval = ''
        for (let i = 0; i < elem.childNodes.length; i++) {
          retval += elem?.childNodes?.[i]?.nodeValue ?? ''
        }
      } else {
        if (!retval) retval = {}
        for (let i = 0; i < elem.childNodes.length; i++) {
          const key = elem?.childNodes?.[i]?.nodeName
          if (!key) continue
          const val = this.#parseElement(elem.childNodes[i] as any)
          if (!val) continue
          if (!cnt.hasOwnProperty(key)) {
            cnt[key] = 0
          }
          cnt[key]!++
          this.#addNode(retval, key, cnt[key]!, val)
        }
      }
    }
    return retval
  }

  #parseDOM(root: HTMLElement) {
    if (!root) return
    let json = this.#parseElement(root) // parse root node
    if (root.nodeType != 11) {
      // DOCUMENT_FRAGMENT_NODE
      const tmp: { [k: string]: any } = {}
      tmp[root.nodeName] = json // root nodeName
      json = tmp
    }
    return json
  }

  XMLToJSON(xml: string) {
    const xmldom = new DOMParser()
    const dom = xmldom.parseFromString(xml, 'application/xml')
    if (!dom) {
      throw new Error(`XML解析失败`)
    }
    const root = dom.documentElement
    if (!root) return
    const errDom = root.querySelector('parsererror')
    if (errDom) {
      const rootError = errDom?.innerHTML
      throw new Error(`XML格式错误: ${rootError}`)
    }
    return this.#parseDOM(root)
  }

  #xml_escape(text: string) {
    return (text + '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  #scalar_to_xml(name: any, text: any) {
    if (name == '#text') {
      return this.#xml_escape(text)
    } else {
      return '<' + name + '>' + this.#xml_escape(text) + '</' + name + '>\n'
    }
  }

  #array_to_xml(name: any, array: any): string {
    const out = []
    for (let i = 0; i < array.length; i++) {
      const val = array[i]
      if (typeof val == 'undefined' || val == null) {
        out[out.length] = '<' + name + ' />'
      } else if (typeof val == 'object' && val.constructor == Array) {
        out[out.length] = this.#array_to_xml(name, val)
      } else if (typeof val == 'object') {
        out[out.length] = this.#hash_to_xml(name, val)
      } else {
        out[out.length] = this.#scalar_to_xml(name, val)
      }
    }
    return out.join('')
  }

  #hash_to_xml(name: any, tree: any) {
    const elem = []
    const attr = []
    if (typeof tree === 'object' && tree.constructor === Array) {
      elem[elem.length] = this.#array_to_xml('e', tree)
    } else {
      for (const key in tree) {
        if (!tree.hasOwnProperty(key)) continue
        const val = tree[key]
        if (key.charAt(0) != this.attr_prefix) {
          if (typeof val == 'undefined' || val == null) {
            elem[elem.length] = '<' + key + ' />'
          } else if (typeof val == 'object' && val.constructor == Array) {
            elem[elem.length] = this.#array_to_xml(key, val)
          } else if (typeof val == 'object') {
            elem[elem.length] = this.#hash_to_xml(key, val)
          } else {
            elem[elem.length] = this.#scalar_to_xml(key, val)
          }
        } else {
          attr[attr.length] = ' ' + key.substring(1) + '="' + this.#xml_escape(val) + '"'
        }
      }
    }

    const jattr = attr.join('')
    let jelem: string = elem.join('')
    if (typeof name == 'undefined' || name == null) {
      // no tag
    } else if (elem.length > 0) {
      if (jelem.match(/\n/)) {
        jelem = '<' + name + jattr + '>\n' + jelem + '</' + name + '>\n'
      } else {
        jelem = '<' + name + jattr + '>' + jelem + '</' + name + '>\n'
      }
    } else {
      jelem = '<' + name + jattr + ' />\n'
    }
    return jelem
  }

  JSONToXML(tree: any) {
    let xml = ''
    if (typeof tree === 'object' && tree.constructor === Array) {
      xml = this.#hash_to_xml(null, tree)
      return this.xmlDecl + '<a>' + xml + '</a>'
    } else {
      xml = this.#hash_to_xml(null, tree)
      return this.xmlDecl + xml
    }
  }
}

export default new XMLParse()
