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
      <ul v-if="path" class="info-wapper">
        <li>
          <span>file size: </span>
          <span v-text="info.size_str"></span>
          <span v-text="info.size"></span>
        </li>
        <li>
          <span>create time: </span>
          <span v-text="info.btime_str"></span>
          <span v-text="info.btime"></span>
        </li>
        <li>
          <span>change time: </span>
          <span v-text="info.ctime_str"></span>
          <span v-text="info.ctime"></span>
        </li>
        <li>
          <span>access time: </span>
          <span v-text="info.atime_str"></span>
          <span v-text="info.atime"></span>
        </li>
        <li>
          <span>modify time: </span>
          <span v-text="info.mtime_str"></span>
          <span v-text="info.mtime"></span>
        </li>
        <li>
          <span>MD5: </span>
          <span v-text="info.md5"></span>
        </li>
        <li>
          <span>SHA-1: </span>
          <span v-text="info.sha1"></span>
        </li>
        <li>
          <span>SHA-256: </span>
          <span v-text="info.sha256"></span>
        </li>
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
    sha256: ''
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
      await Promise.all([getHashValue('md5'), getHashValue('sha1'), getHashValue('sha256')])

      // Scroll to bottom
      const container = document.querySelector('.main-wapper')
      if (container) {
        scrollToBottom(container)
      }
    } catch (error) {
      console.error('Error getting file info:', error)
    }
  }

  const getHashValue = async (hashType: 'md5' | 'sha1' | 'sha256') => {
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
