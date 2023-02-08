<style>
  .yb-icon {
    display: inline-block;
    fill: currentColor;
  }
</style>

<script>
  import { createElementBlock, normalizeStyle } from 'vue'
  import { getExtractedSVG } from 'svg-inline-loader'
  const config = {
    removeTags: true,
    removingTags: ['p-id', 'id', 'class', 'title', 'desc', 'defs', 'style'],
    removingTagAttrs: [
      'fill',
      't',
      'version',
      'p-id',
      'id',
      'class',
      'title',
      'desc',
      'defs',
      'style',
      'width',
      'height',
      'xmlns',
      'xmlns:xlink'
    ]
  }
  const icons = {}
  export default {
    props: {
      svg: {
        type: [String, Promise],
        default: ''
      },
      width: {
        type: [Number, String],
        default: undefined
      },
      height: {
        type: [Number, String],
        default: undefined
      },
      backgroundImage: Boolean,
      color: String
    },
    data() {
      return {
        iconHash: ''
      }
    },
    computed: {
      icon() {
        if (this.iconHash) {
          return icons[this.iconHash]
        }
        return null
      },
      box() {
        if (this.icon) {
          return `${this.icon.x || 0} ${this.icon.y || 0} ${this.icon.width} ${this.icon.height}`
        }
        return '0 0 1024 1024'
      },
      style: function () {
        let width = this.fixSize(this.width)
        let height = this.fixSize(this.height)
        if (this.backgroundImage) {
          let content = ''
          if (this.icon && this.icon.raw) {
            //eslint-disable-next-line
            content += `${this.raw.replace(/"/g, "'")}`
          }
          let code = {
            '%': '%25',
            '!': '%21',
            '@': '%40',
            '&': '%26',
            '#': '%23'
          }
          let svg = `<svg viewBox='${this.box}' fill='${this.color}' version='1.1' xmlns='http://www.w3.org/2000/svg'>${content}</svg>`
          for (let k in code) {
            svg = svg.replace(new RegExp(k, 'g'), code[k])
          }
          let css = {
            'background-image': `url("data:image/svg+xml,${svg}")`,
            width: width,
            height: height
          }
          return css
        }
        return { color: this.color, width: width, height: height }
      },
      raw() {
        // generate unique id for each icon's SVG element with ID
        if (!this.icon || !this.icon.raw) {
          return null
        }
        let raw = this.icon.raw
        let ids = {}
        raw = raw.replace(/\s(?:xml:)?id=(["']?)([^"')\s]+)\1/g, (match, quote, id) => {
          let uniqueId = getId()
          ids[id] = uniqueId
          return ` id="${uniqueId}"`
        })
        raw = raw.replace(
          /#(?:([^'")\s]+)|xpointer\(id\((['"]?)([^')]+)\2\)\))/g,
          (match, rawId, _, pointerId) => {
            let id = rawId || pointerId
            if (!id || !ids[id]) {
              return match
            }

            return `#${ids[id]}`
          }
        )
        return raw
      }
    },
    watch: {
      svg: {
        handler(nv) {
          if (nv) {
            if (typeof nv === 'string') {
              this.initFromContent(getExtractedSVG(nv, config))
            } else {
              nv.then((res) => {
                this.initFromContent(getExtractedSVG(res.default, config))
              })
            }
          }
        },
        immediate: true
      }
    },
    created() {},
    mounted() {},
    methods: {
      hashCode(str) {
        str = str.toLowerCase()
        let hash = 1315423911
        let i
        let ch
        for (i = str.length - 1; i >= 0; i--) {
          ch = str.charCodeAt(i)
          hash ^= (hash << 5) + ch + (hash >> 2)
        }
        return hash & 0x7fffffff
      },
      initFromContent(nv) {
        let hash = this.hashCode(nv)
        this.iconHash = hash
        if (!icons[hash]) {
          let content = nv
          let viewBoxReg = new RegExp('viewBox="(.*?) (.*?) (.*?) (.*?)"')
          let viewBox = content.match(viewBoxReg)
          if (!viewBox || viewBox.length < 5) {
            return
          }
          let x = viewBox[1]
          let y = viewBox[2]
          let width = viewBox[3]
          let height = viewBox[4]
          let rawReg = new RegExp('<svg.*?>(.*?)</svg>')
          let raw = content.match(rawReg)[1]
          icons[hash] = {
            x: x,
            y: y,
            width: width,
            height: height,
            raw: raw
          }
        }
      },
      fixSize(val) {
        let res = val
        if (typeof res === 'number') {
          res += 'px'
        } else if (typeof res === 'string') {
          if (res.indexOf('px') < 0 && res.indexOf('em') < 0 && res.indexOf('%') < 0) {
            res += 'px'
          }
        }
        return res
      }
    },
    render() {
      return createElementBlock(
        'svg',
        {
          version: '1.1',
          class: 'yb-icon',
          viewBox: this.box,
          style: normalizeStyle(this.style),
          innerHTML: !this.backgroundImage && this.icon && this.icon.raw ? this.raw : ''
        },
        null,
        12 /* STYLE, PROPS */,
        ['viewBox', 'innerHTML']
      )
    }
  }

  let cursor = 0xd4937
  function getId() {
    return `fa-${(cursor++).toString(16)}`
  }
</script>
