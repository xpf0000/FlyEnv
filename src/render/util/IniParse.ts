export class IniParse {
  content = ''
  constructor(content: string) {
    this.content = content.replace(/\r\n/gm, '\n')
  }

  /**
   * 获取值
   * @param key
   */
  get(key: string) {
    const regex = new RegExp(`^[\\s\\n]?((?![#;])([\\s]*?))${key}(.*?)([^\\n])(\\n|$)`, 'gm')
    const matchs =
      this.content.match(regex)?.map((s) => {
        const sarr = s
          .trim()
          .split('=')
          .filter((s) => !!s.trim())
          .map((s) => s.trim())
        const k = sarr.shift()
        const v = sarr.join(' ').replace(';', '').replace('=', '').trim()
        return {
          k,
          v
        }
      }) ?? []
    const find = matchs?.find((m) => m.k === key)
    return find?.v
  }

  set(key: string, value: string, section?: string) {
    const regex = new RegExp(`^[\\s\\n#]?([\\s#]*?)${key}(.*?)([^\\n])(\\n|$)`, 'gm')
    if (regex.test(this.content)) {
      this.content = this.content.replace(regex, `${value}\n`)
    } else {
      if (!section) {
        this.content = `${value}\n` + this.content
      } else {
        const regex = new RegExp(`(.*?)\\[${section}\\](.*?)([^\\n])*(\\n|$)`, 'gm')
        const finds = this.content.match(regex)
        const find = finds?.find?.((m) => {
          const mt = m.trim()
          return !mt.startsWith('#') && !mt.startsWith(';')
        })
        if (find) {
          this.content = this.content.replace(find, `[${section}]\n${value}\n`)
        } else {
          this.content = this.content.trim() + `\n[${section}]\n${value}\n`
        }
      }
    }
    return this.content
  }

  remove(key: string) {
    const regex = new RegExp(`^[\\s\\n#]?([\\s#]*?)${key}(.*?)([^\\n])(\\n|$)`, 'gm')
    this.content = this.content.replace(regex, ``)
    return this.content
  }
}
