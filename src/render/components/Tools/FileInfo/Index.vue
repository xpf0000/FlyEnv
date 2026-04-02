<template>
  <div class="host-edit tools tools-file-info">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('util.toolFileInfo') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div id="FileInfoDroper" class="main-wapper">
      <div class="select-dir-wapper">
        <div id="selectDir" @click.stop="choosePath">
          <yb-icon :svg="import('@/svg/upload.svg?raw')" class="icon" />
          <span>{{ I18nT('base.fileInfoTips') }}</span>
        </div>
      </div>
      <ul v-if="path" class="info-wapper select-text">
        <el-descriptions border :title="path" :column="2" :direction="'vertical'">
          <el-descriptions-item label="file size">
            {{ info.size_str }}
          </el-descriptions-item>
          <el-descriptions-item label="">
            {{ info.size }}
          </el-descriptions-item>
          <el-descriptions-item label="create time">
            {{ info.btime_str }}
          </el-descriptions-item>
          <el-descriptions-item label="">
            {{ info.btime }}
          </el-descriptions-item>
          <el-descriptions-item label="change time">
            {{ info.ctime_str }}
          </el-descriptions-item>
          <el-descriptions-item label="">
            {{ info.ctime }}
          </el-descriptions-item>
          <el-descriptions-item label="access time">
            {{ info.atime_str }}
          </el-descriptions-item>
          <el-descriptions-item label="">
            {{ info.atime }}
          </el-descriptions-item>
          <el-descriptions-item label="modify time">
            {{ info.mtime_str }}
          </el-descriptions-item>
          <el-descriptions-item label="">
            {{ info.mtime }}
          </el-descriptions-item>
          <el-descriptions-item label="MD5" :span="2">
            {{ info.md5 }}
          </el-descriptions-item>
          <el-descriptions-item label="SHA-1" :span="2">
            {{ info.sha1 }}
          </el-descriptions-item>
          <el-descriptions-item label="SHA-256" :span="2">
            {{ info.sha256 }}
          </el-descriptions-item>
          <el-descriptions-item class-name="w-full overflow-hidden" label="SHA-512" :span="2">
            <div class="w-full overflow-hidden break-all whitespace-pre-wrap">{{
              info.sha512
            }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="SHA-512-Base64" :span="2">
            {{ info.sha512Base64 }}
          </el-descriptions-item>
        </el-descriptions>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, watch, onMounted, onUnmounted } from 'vue'
  import { formatBytes } from '@/util/Index'
  import { formatISO } from 'date-fns'
  import { dialog, fs } from '@/util/NodeFn'
  import { I18nT } from '@lang/index'

  interface FileInfo {
    size_str: string
    size: number
    atime_str: string
    atime: number
    mtime_str: string
    mtime: number
    ctime_str: string
    ctime: number
    btime_str: string
    btime: number
    md5: string
    sha1: string
    sha256: string
    sha512: string
    sha512Base64: string
  }

  const path = ref('')
  const info = ref<FileInfo>({
    size_str: '',
    size: 0,
    atime_str: '',
    atime: 0,
    mtime_str: '',
    mtime: 0,
    ctime_str: '',
    ctime: 0,
    btime_str: '',
    btime: 0,
    md5: '',
    sha1: '',
    sha256: '',
    sha512: '',
    sha512Base64: ''
  })
  const timer = ref<number | null>(null)

  const choosePath = async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile']
    })

    if (canceled || filePaths.length === 0) return
    path.value = filePaths[0]
  }

  const getInfo = async () => {
    try {
      const stats = await fs.stat(path.value)
      info.value = {
        ...info.value,
        size: stats.size,
        size_str: formatBytes(stats.size),
        atime: stats.atimeMs,
        atime_str: formatISO(stats.atimeMs),
        btime: stats.birthtimeMs,
        btime_str: formatISO(stats.birthtimeMs),
        ctime: stats.ctimeMs,
        ctime_str: formatISO(stats.ctimeMs),
        mtime: stats.mtimeMs,
        mtime_str: formatISO(stats.mtimeMs)
      }

      // Get hash values in parallel
      await Promise.all([
        getHashValue('md5'),
        getHashValue('sha1'),
        getHashValue('sha256'),
        getHashValue('sha512'),
        getHashValue('sha512Base64')
      ])

      // Scroll to bottom
      const container = document.querySelector('.main-wapper')
      if (container) {
        scrollToBottom(container)
      }
    } catch (error) {
      console.error('Error getting file info:', error)
    }
  }

  const getHashValue = async (hashType: 'md5' | 'sha1' | 'sha256' | 'sha512' | 'sha512Base64') => {
    try {
      const value = await fs.getFileHash(path.value, hashType)
      info.value = { ...info.value, [hashType]: value }
    } catch {
      info.value = { ...info.value, [hashType]: '' }
    }
  }

  const scrollToBottom = (container: Element) => {
    const scroll = () => {
      if (Math.floor(container.scrollHeight - container.scrollTop - container.clientHeight) === 0) {
        if (timer.value) {
          cancelAnimationFrame(timer.value)
          timer.value = null
        }
        return
      }
      container.scrollTop += 60
      timer.value = requestAnimationFrame(scroll)
    }
    timer.value = requestAnimationFrame(scroll)
  }

  const setupDragAndDrop = () => {
    const selector = document.getElementById('FileInfoDroper')
    if (!selector) return

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer?.files.length) {
        path.value = window.FlyEnvNodeAPI.showFilePath(e.dataTransfer.files[0])
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    selector.addEventListener('drop', handleDrop)
    selector.addEventListener('dragover', handleDragOver)

    return () => {
      selector.removeEventListener('drop', handleDrop)
      selector.removeEventListener('dragover', handleDragOver)
    }
  }

  // Watch for path changes
  watch(path, (newPath) => {
    if (newPath) {
      getInfo()
    }
  })

  // Setup drag and drop on mount
  onMounted(() => {
    const cleanup = setupDragAndDrop()
    onUnmounted(() => {
      cleanup?.()
      if (timer.value) {
        cancelAnimationFrame(timer.value)
      }
    })
  })
</script>
