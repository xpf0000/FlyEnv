import { reactiveBind } from '@/util/Index'
import { reactive } from 'vue'

class Font {
  familys: string[] = []

  async init() {
    console.log('window?.queryLocalFonts: ', window?.queryLocalFonts)
    if (typeof window?.queryLocalFonts === 'function') {
      const fonts = await window.queryLocalFonts()
      console.log('fonts', fonts)
      const fontSet: Set<string> = new Set()
      fonts.forEach((font: any) => {
        console.log('font', font, font.family)
        fontSet.add(font.family)
      })
      this.familys = reactive(Array.from(fontSet).sort())
    } else {
      console.log('window no queryLocalFonts !!!!!!')
    }
  }
}

export default reactiveBind(new Font())
