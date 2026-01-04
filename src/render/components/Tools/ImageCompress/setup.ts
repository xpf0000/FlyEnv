import { reactiveBind } from '@/util/Index'
import type {
  SharpConfig,
  TextureOptions,
  WatermarkConfig
} from '../../../../fork/module/Image/imageCompress.type'
import type { FitEnum, FormatEnum, KernelEnum } from 'sharp'

class ImageCompressSetup implements SharpConfig {
  // 基本配置
  path: string = ''
  width?: number
  height?: number
  fit: keyof FitEnum = 'cover'
  position: number | string = 'centre'
  kernel: keyof KernelEnum = 'lanczos3'
  withoutEnlargement: boolean = true
  withoutReduction: boolean = false
  fastShrinkOnLoad: boolean = true
  format: keyof FormatEnum = 'png'

  // 裁剪配置
  trim?: boolean

  // 水印配置
  watermark: WatermarkConfig | WatermarkConfig[] = {
    type: 'text',
    enabled: false,
    content: {
      text: '水印',
      fontSize: 24,
      color: '#FFFFFF',
      opacity: 0.8
    },
    position: {
      horizontal: 'right',
      vertical: 'bottom',
      offsetX: 20,
      offsetY: 20
    },
    repeat: 'single',
    spacing: 100,
    globalOpacity: 1
  }

  // 纹理配置
  texture: TextureOptions = {
    enabled: false,
    type: 'grid',
    color: 'rgba(255,255,255,0.1)',
    size: 20,
    lineWidth: 1,
    dotSize: 2,
    intensity: 0.05,
    blendMode: 'overlay',
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
    overshootDeringing?: boolean
    optimiseScans?: boolean
    quantisationTable?: number
  } = {
    quality: 80,
    progressive: true,
    chromaSubsampling: '4:2:0',
    optimiseCoding: true,
    mozjpeg: false,
    trellisQuantisation: false,
    overshootDeringing: false,
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
    adaptiveFiltering: false,
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
    m1?: number
    m2?: number
    x1?: number
    y2?: number
    y3?: number
  } = {
    sigma: 1,
    m1: 0,
    m2: 3,
    x1: 3,
    y2: 3,
    y3: 0
  }
  gamma: number = 2.2
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
  linear: { a: number; b: number } = {
    a: 1,
    b: 0
  }
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
  threshold: number = 128
  toColorspace: 'srgb' | 'rgb' | 'cmyk' | 'lab' | 'b-w' = 'srgb'
  removeAlpha: boolean = false
  ensureAlpha: number = 1.0
  tint: { r: number; g: number; b: number } = {
    r: 255,
    g: 255,
    b: 255
  }
  extend: {
    top?: number
    bottom?: number
    left?: number
    right?: number
    background?: string
  } = {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    background: '#000000'
  }
  extract: {
    left: number
    top: number
    width: number
    height: number
  } = {
    left: 0,
    top: 0,
    width: 100,
    height: 100
  }
}
export default reactiveBind(new ImageCompressSetup())
