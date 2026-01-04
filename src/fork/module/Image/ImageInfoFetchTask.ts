import type { TaskItem } from '@shared/TaskQueue'
import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'

export class ImageInfoFetchTask implements TaskItem {
  /**
   * 本地图片路径
   */
  path = ''
  /**
   * 前端显示名字
   */
  name = ''
  /**
   * 文件大小
   */
  size: number = 0
  /**
   * 格式化后的文件大小字符串
   */
  sizeFormatted: string = ''
  /**
   * 图片宽度
   */
  width: number = 0
  /**
   * 图片高度
   */
  height: number = 0
  /**
   * 图片格式 jpeg png gif webp等
   */
  ext = ''
  /**
   * 文件状态
   */
  hasError: boolean = false
  /**
   * 错误信息
   */
  errorMessage: string = ''

  constructor(path: string, name: string) {
    this.path = path
    this.name = name
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const k = 1024
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`
  }

  /**
   * 检查文件是否存在且可读
   */
  private async checkFileAccessibility(): Promise<boolean> {
    try {
      await fs.access(this.path, fs.constants.R_OK)
      return true
    } catch (error: any) {
      this.errorMessage = `文件不存在或不可读: ${error.message}`
      this.hasError = true
      return false
    }
  }

  /**
   * 获取文件大小
   */
  private async getFileSize(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.path)
      this.size = stats.size
      this.sizeFormatted = this.formatFileSize(stats.size)
      return true
    } catch (error: any) {
      this.errorMessage = `获取文件大小失败: ${error.message}`
      this.hasError = true
      return false
    }
  }

  /**
   * 获取图片元数据
   */
  private async getImageMetadata(): Promise<boolean> {
    try {
      const metadata = await sharp(this.path).metadata()

      this.width = metadata.width || 0
      this.height = metadata.height || 0

      // 从元数据获取格式，如果获取不到则从文件扩展名获取
      if (metadata.format) {
        this.ext = metadata.format.toLowerCase()
      } else {
        const fileExt = path.extname(this.path).toLowerCase().replace('.', '')
        this.ext = fileExt || 'unknown'
      }

      return true
    } catch (error: any) {
      // 如果不是图片文件，尝试从扩展名判断
      const fileExt = path.extname(this.path).toLowerCase().replace('.', '')
      const imageExtensions = [
        'jpg',
        'jpeg',
        'png',
        'gif',
        'webp',
        'bmp',
        'tiff',
        'svg',
        'heic',
        'avif'
      ]

      if (imageExtensions.includes(fileExt)) {
        this.errorMessage = `读取图片元数据失败: ${error.message}`
        this.hasError = true
        return false
      } else {
        this.errorMessage = '文件不是支持的图片格式'
        this.hasError = true
        return false
      }
    }
  }

  /**
   * 根据图片路径，获取文件大小，图片宽高，格式信息
   * 信息获取成功返回true
   * 信息获取失败返回失败原因
   */
  async run(): Promise<boolean> {
    try {
      // 重置状态
      this.hasError = false
      this.errorMessage = ''

      // 1. 检查文件可访问性
      if (!(await this.checkFileAccessibility())) {
        return false
      }

      // 2. 获取文件大小
      if (!(await this.getFileSize())) {
        return false
      }

      // 3. 获取图片元数据
      if (!(await this.getImageMetadata())) {
        return false
      }

      // 4. 验证获取到的数据
      if (this.width === 0 || this.height === 0) {
        this.errorMessage = '无法获取有效的图片尺寸'
        this.hasError = true
        return false
      }

      if (!this.ext) {
        this.errorMessage = '无法确定图片格式'
        this.hasError = true
        return false
      }

      return true
    } catch (error: any) {
      this.errorMessage = `处理图片时发生未知错误: ${error.message}`
      this.hasError = true
      return false
    }
  }

  /**
   * 获取任务结果摘要
   */
  getSummary(): {
    success: boolean
    message: string
    data?: {
      path: string
      size: number
      sizeFormatted: string
      width: number
      height: number
      ext: string
    }
  } {
    if (this.hasError) {
      return {
        success: false,
        message: this.errorMessage
      }
    }

    return {
      success: true,
      message: '图片信息获取成功',
      data: {
        path: this.path,
        size: this.size,
        sizeFormatted: this.sizeFormatted,
        width: this.width,
        height: this.height,
        ext: this.ext
      }
    }
  }

  /**
   * 获取基础信息（用于调试）
   */
  toString(): string {
    if (this.hasError) {
      return `ImageInfoFetchTask: ${this.path} - 错误: ${this.errorMessage}`
    }
    return `ImageInfoFetchTask: ${this.path} - ${this.width}x${this.height} ${this.ext} ${this.sizeFormatted}`
  }
}
