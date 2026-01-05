import type { SharpConfig } from './imageCompress.type'
import { ForkPromise } from '@shared/ForkPromise'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

/**
 * 压缩测试
 * 1. 对原始图片进行压缩
 * 2. 返回压缩前后的图片base64字符串和文件尺寸大小
 * @param base64OrFilepath  图片文件路径或图片base64字符串
 * @param config  压缩配置
 */
export function imageCompressTest(
  base64OrFilepath: string,
  config: SharpConfig,
  format: 'jpeg' | 'png' | 'webp' | 'avif'
) {
  return new ForkPromise(async (resolve, reject) => {
    try {
      // 验证输入
      if (!base64OrFilepath) {
        return reject(new Error('输入参数不能为空'))
      }

      let originalBuffer: Buffer
      let originalFormat: string

      // 判断输入类型并读取图片
      if (base64OrFilepath.includes('base64,')) {
        // base64字符串
        const base64Data = base64OrFilepath.split('base64,')[1]
        originalBuffer = Buffer.from(base64Data, 'base64')

        // 获取原始图片格式
        const metadata = await sharp(originalBuffer).metadata()
        originalFormat = metadata.format || 'unknown'
      } else {
        // 读取文件并获取格式
        originalBuffer = await readFile(base64OrFilepath)
        const metadata = await sharp(originalBuffer).metadata()
        originalFormat = metadata.format || 'unknown'
      }

      // 1. 获取原始图片信息
      const originalSize = originalBuffer.length
      const originalBase64 = `data:image/${originalFormat};base64,${originalBuffer.toString('base64')}`

      // 获取原始图片尺寸
      let originalDimensions = { width: 0, height: 0 }
      let metadata = await sharp(originalBuffer).metadata()
      originalDimensions = {
        width: metadata.width || 0,
        height: metadata.height || 0
      }

      // 进行JPEG压缩
      let compressedBuffer!: Buffer
      if (format === 'jpeg') {
        // 2. 根据压缩配置压缩图片
        const compressConfig = {
          ...config.jpeg,
          trellisQuantisation: true,
          overshootDeringing: true
        }
        compressedBuffer = await sharp(originalBuffer).jpeg(compressConfig).toBuffer()
      } else if (format === 'png') {
        compressedBuffer = await sharp(originalBuffer).png(config.png).toBuffer()
      } else if (format === 'webp') {
        compressedBuffer = await sharp(originalBuffer).webp(config.webp).toBuffer()
      } else if (format === 'avif') {
        compressedBuffer = await sharp(originalBuffer).avif(config.avif).toBuffer()
      }

      // 3. 获取压缩后的图片信息
      const compressedSize = compressedBuffer.length
      const compressedBase64 = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`

      // 获取压缩后图片尺寸
      let compressedDimensions = { width: 0, height: 0 }
      metadata = await sharp(compressedBuffer).metadata()
      compressedDimensions = {
        width: metadata.width || 0,
        height: metadata.height || 0
      }

      // 计算压缩率
      const compressionRatio =
        originalSize > 0 ? ((originalSize - compressedSize) / originalSize) * 100 : 0

      // 返回结果
      resolve({
        // 压缩前的原始图片
        original: {
          base64: originalBase64,
          size: {
            bytes: originalSize,
            kilobytes: parseFloat((originalSize / 1024).toFixed(2)),
            megabytes: parseFloat((originalSize / (1024 * 1024)).toFixed(4))
          },
          dimensions: originalDimensions,
          format: originalFormat
        },
        // 压缩后的图片
        compressed: {
          base64: compressedBase64,
          size: {
            bytes: compressedSize,
            kilobytes: parseFloat((compressedSize / 1024).toFixed(2)),
            megabytes: parseFloat((compressedSize / (1024 * 1024)).toFixed(4))
          },
          dimensions: compressedDimensions,
          format
        },
        // 压缩信息
        compression: {
          // 压缩比例
          ratio: parseFloat(compressionRatio.toFixed(2)),
          // 压缩减少的大小
          sizeReduced: {
            bytes: originalSize - compressedSize,
            kilobytes: parseFloat(((originalSize - compressedSize) / 1024).toFixed(2)),
            megabytes: parseFloat(((originalSize - compressedSize) / (1024 * 1024)).toFixed(4))
          },
          // 是否变小
          isReduced: compressedSize < originalSize
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}
