import type { Rectangle } from 'electron'
import { desktopCapturer, screen } from 'electron'

type WindowItem = {
  id: string
  name: string
  display_id: string
  display?: {
    bounds: Rectangle
    workArea: Rectangle
    scaleFactor: number
  }
}

export class Capturer {
  async getAllWindows(): Promise<WindowItem[]> {
    try {
      const displays = screen.getAllDisplays()
      console.log('getAllWindows displays', displays)
      const sources = await desktopCapturer.getSources({
        types: ['window']
      })

      const all = sources.map((source) => {
        console.log('getAllWindows source', source)
        // 根据display_id找到对应的显示器
        const display = displays.find((d) => d.id.toString() === source.display_id)
        return {
          id: source.id,
          name: source.name,
          display_id: source.display_id,
          display: display
            ? {
                bounds: display.bounds,
                workArea: display.workArea,
                scaleFactor: display.scaleFactor
              }
            : undefined
        }
      })
      console.log('getAllWindows all: ', all)
      return all
    } catch (error) {
      console.error('获取窗口位置失败:', error)
      return []
    }
  }
}
