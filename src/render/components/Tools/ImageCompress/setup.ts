import { reactiveBind } from '@/util/Index'
import type {
  BatchImageInfoItem,
  BatchImageResultItem,
  SharpConfig,
  TextureOptions,
  WatermarkConfig
} from '../../../../fork/module/Image/imageCompress.type'
import type { FitEnum, FormatEnum, KernelEnum } from 'sharp'
import { dialog, fs, shell } from '@/util/NodeFn'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import IPC from '@/util/IPC'
import { reactive } from 'vue'
import localForage from 'localforage'
import { SetupStore } from '@/components/Setup/store'
import { ElMessageBox } from 'element-plus'

class ImageCompressSetup implements SharpConfig {
  // 基本配置
  width?: number
  height?: number
  fit: keyof FitEnum = 'cover'
  position: number | string = 'centre'
  kernel: keyof KernelEnum = 'cubic'
  withoutEnlargement: boolean = true
  withoutReduction: boolean = false
  fastShrinkOnLoad: boolean = true
  format: 'none' | keyof FormatEnum = 'none'
  compressOpen: boolean = true
  // 裁剪配置
  trim?: boolean

  // 水印配置
  watermark: WatermarkConfig = {
    type: 'text',
    enabled: false,
    content: {
      text: '水印',
      fontSize: 44,
      color: 'rgb(128, 128, 128)',
      opacity: 0.6
    },
    position: {
      horizontal: 'center',
      vertical: 'middle',
      offsetX: 20,
      offsetY: 20
    },
    repeat: 'single',
    spacing: 100
  }

  // 纹理配置
  texture: TextureOptions = {
    enabled: false,
    type: 'grid',
    color: 'rgba(128,128,128,0.4)',
    size: 20,
    lineWidth: 1,
    dotSize: 3,
    intensity: 0.05,
    blendMode: 'over',
    opacity: 0.3,
    angle: 0,
    scale: 1
  }

  // 图片格式配置
  jpeg: {
    quality?: number
    progressive?: boolean
    chromaSubsampling?: '4:2:0' | '4:4:4' | '4:2:2'
    optimiseCoding?: boolean
    mozjpeg?: boolean
    trellisQuantisation?: boolean
    optimiseScans?: boolean
  } = {
    quality: 80,
    progressive: true,
    chromaSubsampling: '4:2:0',
    optimiseCoding: true,
    mozjpeg: true,
    trellisQuantisation: false,
    optimiseScans: false
  }

  png: {
    quality?: number
    progressive?: boolean
    compressionLevel?: number
    adaptiveFiltering?: boolean
    palette?: boolean
    colours?: number
    dither?: number
  } = {
    quality: 80,
    progressive: false,
    compressionLevel: 6,
    adaptiveFiltering: true,
    palette: false,
    colours: 256
  }

  webp: {
    quality?: number
    alphaQuality?: number
    lossless?: boolean
    nearLossless?: boolean
    smartSubsample?: boolean
    effort?: number
  } = {
    quality: 80,
    alphaQuality: 100,
    lossless: false,
    nearLossless: false,
    smartSubsample: true,
    effort: 4
  }

  avif: {
    quality?: number
    lossless?: boolean
    effort?: number
    chromaSubsampling?: '4:2:0' | '4:4:4'
  } = {
    quality: 50,
    lossless: false,
    effort: 4,
    chromaSubsampling: '4:2:0'
  }

  gif: {
    pageHeight?: number
    loop?: number
    delay?: number[]
    effort?: number
  } = {
    pageHeight: 0,
    loop: 0,
    delay: [100],
    effort: 7
  }

  tiff: {
    quality?: number
    compression?: 'jpeg' | 'deflate' | 'ccittfax4' | 'lzw' | 'packbits' | 'webp' | 'zstd'
    predictor?: 'none' | 'horizontal' | 'float'
    pyramid?: boolean
    tile?: boolean
    tileWidth?: number
    tileHeight?: number
    xres?: number
    yres?: number
  } = {
    quality: 80,
    compression: 'jpeg',
    predictor: 'horizontal',
    pyramid: false,
    tile: false,
    tileWidth: 256,
    tileHeight: 256,
    xres: 1.0,
    yres: 1.0
  }

  heif: {
    quality?: number
    compression?: 'av1' | 'hevc'
    lossless?: boolean
    effort?: number
    chromaSubsampling?: '4:2:0' | '4:4:4'
  } = {
    quality: 50,
    compression: 'hevc',
    lossless: false,
    effort: 4,
    chromaSubsampling: '4:2:0'
  }

  // 超时和元数据配置
  timeoutSeconds: number = 30
  withMetadata: boolean = false
  withIccProfile: string = 'srgb'

  // 图片处理配置
  rotate: number = 0
  flip: boolean = false
  flop: boolean = false
  blur: number = 0
  sharpen: {
    sigma: number
  } = {
    sigma: 0
  }
  gamma: number = 1
  grayscale: boolean = false
  normalise: boolean = false
  clahe: {
    width: number
    height: number
    maxSlope?: number
  } = {
    width: 8,
    height: 8,
    maxSlope: 3
  }
  negate: boolean = false
  median: number = 0
  modulate: {
    brightness?: number
    saturation?: number
    hue?: number
    lightness?: number
  } = {
    brightness: 1,
    saturation: 1,
    hue: 0,
    lightness: 0
  }
  threshold: {
    enabled: boolean
    value: number
  } = {
    enabled: false,
    value: 128
  }
  toColorspace: 'srgb' | 'rgb' | 'cmyk' | 'lab' | 'b-w' = 'srgb'
  removeAlpha: boolean = false
  ensureAlpha: number = 1.0
  opacity: number = 1

  download(base64: string) {
    let ext = 'png'
    const mimeToExt: any = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/avif': 'avif'
    }
    for (const key in mimeToExt) {
      if (base64.includes(key)) {
        ext = mimeToExt[key]
      }
    }
    dialog
      .showSaveDialog({
        properties: ['createDirectory', 'showOverwriteConfirmation'],
        defaultPath: `flyenv-compress-test.${ext}`
      })
      .then(({ canceled, filePath }: any) => {
        if (canceled || !filePath) {
          return
        }
        const data = base64.replace(/^data:image\/\w+;base64,/, '')
        fs.writeBufferBase64(filePath, data)
          .then(() => {
            shell.showItemInFolder(filePath).catch()
          })
          .catch(() => {
            MessageError(I18nT('base.fail'))
          })
      })
  }
}
const setup = reactiveBind(new ImageCompressSetup())
export default setup

class ImageBatchProcess {
  saveDir: string = ''
  backupDir: string = ''
  rewrite: boolean = false
  trialStartTime: number = 0
  dirs: string[] = []
  images: Array<BatchImageInfoItem> = []

  wordWidths: Record<string, number> = {}

  processing = false

  private storeKey = 'flyenv-tools-imagecompress'
  private inited: boolean = false

  init() {
    return new Promise((resolve) => {
      if (this.inited) {
        resolve(true)
        return
      }
      localForage
        .getItem(this.storeKey)
        .then((res: any) => {
          if (res && res?.config) {
            Object.assign(setup, res?.config)
          }
          if (res && res?.trialStartTime) {
            this.trialStartTime = res.trialStartTime
          }
        })
        .catch()
        .finally(() => {
          this.inited = true
          resolve(true)
        })
    })
  }

  save() {
    localForage
      .setItem(
        this.storeKey,
        JSON.parse(
          JSON.stringify({
            config: setup,
            trialStartTime: this.trialStartTime
          })
        )
      )
      .then()
      .catch()
  }

  getWordWidths(word: string) {
    const arr = Array.from(new Set([...word.split(''), '.']))
    for (const word of arr) {
      if (this.wordWidths[word]) {
        continue
      }
      let dom: HTMLElement | null = document.createElement('span')
      dom.innerHTML = word
      dom.style.opacity = '0'
      dom.style.pointerEvents = 'none'
      document.body.appendChild(dom)
      const rect = dom.getBoundingClientRect()
      this.wordWidths[word] = rect.width
      dom.remove()
      dom = null
    }
    console.log('getWordWidths: ', word, this.wordWidths)
  }

  selectDir() {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'openDirectory', 'showHiddenFiles', 'multiSelections'],
        filters: [
          {
            name: 'Image Files',
            extensions: ['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif']
          }
        ]
      })
      .then(({ canceled, filePaths }: { canceled: boolean; filePaths: string[] }) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const all = filePaths.filter((filePath: string) => !this.dirs.includes(filePath))
        if (!all.length) {
          return
        }
        this.dirs.push(...all)
        IPC.send('app-fork:image', 'fetchDirFile', all).then((key, res) => {
          if (res?.code === 0 || res?.code === 1) {
            IPC.off(key)
            return
          }
          const data:
            | {
                allFile?: BatchImageInfoItem[]
                successTask?: BatchImageInfoItem[]
                failTask?: BatchImageInfoItem[]
              }
            | undefined = res?.msg
          if (data) {
            const allFile = data?.allFile
            if (allFile) {
              const images: BatchImageInfoItem[] = reactive(
                allFile.map((m) => {
                  return {
                    path: m.path,
                    status: 'fetching'
                  }
                })
              ) as any
              this.images.push(...images)
              return
            }
            const successTask = data?.successTask ?? []
            const failTask = data?.failTask ?? []
            for (const task of [...successTask, ...failTask]) {
              const find = this.images.find((i) => i.path === task.path)
              if (find) {
                Object.assign(find, task, { status: 'fetched' })
              }
            }
          }
        })
      })
  }

  selectSaveDir(type: 'save' | 'backup') {
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'showHiddenFiles', 'createDirectory', 'promptToCreate']
      })
      .then(({ canceled, filePaths }: { canceled: boolean; filePaths: string[] }) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const path = filePaths[0]
        if (type === 'save') {
          this.saveDir = path
        } else {
          this.backupDir = path
        }
      })
  }

  doProcess() {
    const setupStore = SetupStore()
    if (!setupStore.isActive && this.trialStartTime === 0) {
      ElMessageBox.alert(I18nT('ai.noLiencesTips')).catch()
      this.trialStartTime = Math.round(new Date().getTime() / 1000)
      this.save()
    }
    if (this.processing) {
      return
    }
    if (this.rewrite) {
      if (!this.backupDir) {
        MessageError('源文件会自动覆盖, 为了您的数据安全, 请选择备份文件夹')
        return
      }
      this.saveDir = ''
    } else {
      if (!this.saveDir) {
        MessageError('请选择保存文件夹')
        return
      }
      this.backupDir = ''
    }
    this.processing = true
    this.dirs.splice(0)
    this.images.forEach((image) => {
      delete image?.result
      image.status = 'processing'
    })
    IPC.send(
      'app-fork:image',
      'doCompressTask',
      JSON.parse(JSON.stringify(this.images)),
      JSON.parse(JSON.stringify(setup)),
      this.saveDir,
      this.backupDir,
      this.trialStartTime
    ).then((key, res) => {
      if (res?.code === 0) {
        IPC.off(key)
        this.processing = false
        shell.openPath(this.saveDir || this.backupDir).catch()
        return
      }
      if (res?.code === 1) {
        IPC.off(key)
        this.processing = false
        MessageError(res?.msg ?? I18nT('base.fail'))
        return
      }
      const data:
        | {
            successTask: BatchImageResultItem[]
            failTask: BatchImageResultItem[]
          }
        | undefined = res?.msg
      if (data) {
        const successTask = data?.successTask ?? []
        const failTask = data?.failTask ?? []
        for (const task of [...successTask, ...failTask]) {
          const find = this.images.find((i) => i.path === task.image.path)
          if (find) {
            find.result = task
            find.status = 'processed'
          }
        }
      }
    })
  }
}

export const ImageBatch = reactiveBind(new ImageBatchProcess())
