<template>
  <div class="vue-tour-header">
    <span>{{ currentItem?.title }}</span>
    <div class="vue-tour-close" @click.stop="end">
      <svg version="1.1" class="yb-icon" viewBox="0 0 1024 1024">
        <g>
          <path
            d="M521.694 449.297L111.41 39.014a51.2 51.2 0 1 0-72.43 72.363l410.282 410.317L38.98 932.01a51.2 51.2 0 1 0 72.397 72.396l410.317-410.282 410.317 410.282a51.2 51.2 0 1 0 72.396-72.362L594.125 521.694l410.282-410.283a51.2 51.2 0 1 0-72.396-72.397L521.728 449.297z"
          ></path>
        </g>
      </svg>
    </div>
  </div>
  <div class="vue-tour-content">
    <template v-if="typeof component === 'string'">
      <span>{{ component }}</span>
    </template>
    <template v-else>
      <component :is="component"></component>
    </template>
  </div>
  <div class="vue-tour-tool">
    <div class="vue-tour-sliders">
      <template v-for="i in groupItemCount" :key="i">
        <div
          class="vue-tour-slider"
          :class="{ 'vue-tour-slider-active': i - 1 === groupItemIndex }"
        ></div>
      </template>
    </div>
    <div class="vue-tour-buttons">
      <template v-if="showPre">
        <div class="vue-tour-button vue-tour-button-outline" @click.stop="pre">上一步</div>
      </template>
      <template v-if="showNext">
        <div class="vue-tour-button" @click.stop="next">下一步</div>
      </template>
      <template v-if="showEnd">
        <div class="vue-tour-button" @click.stop="end">结束</div>
      </template>
    </div>
  </div>
  <span class="vue-tour-popper-arrow" :class="arrowRect.class" :style="arrowRect.style"></span>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, reactive, watch } from 'vue'
  import { TourCenter } from './index'

  const arrowRect = reactive({
    style: '',
    class: 'vue-tour-popper-arrow-top'
  })
  const group = computed(() => {
    return TourCenter.currentGroup
  })
  const groupItemCount = computed(() => {
    return group?.value?.count ?? 0
  })
  const groupItemIndex = computed(() => {
    return group?.value?.index ?? -1
  })
  const currentItem = computed(() => {
    const value = group?.value
    return value?.item?.[value?.index]
  })
  const component = computed(() => {
    return currentItem?.value?.component
  })
  const showPre = computed(() => {
    return groupItemIndex.value > 0
  })
  const showEnd = computed(() => {
    return groupItemIndex.value === groupItemCount.value - 1
  })
  const showNext = computed(() => {
    return groupItemIndex.value < groupItemCount.value - 1
  })
  const pre = () => {
    group?.value?.pre()
  }
  const next = () => {
    group?.value?.next()
  }
  const end = () => {
    group?.value?.end()
  }

  const updateRect = () => {
    const el: HTMLElement = currentItem?.value?.$el as HTMLElement
    if (!el) {
      return
    }
    const elRect = el.getBoundingClientRect()
    TourCenter.rect = elRect
    const wapper: HTMLElement = TourCenter.poper!
    const wapperRect = wapper.getBoundingClientRect()

    let top = 0
    let left = 0

    const position = currentItem?.value?.position ?? 'bottom'

    const computedBottomTop = () => {
      left = elRect.left + elRect.width * 0.5 - wapperRect.width * 0.5
      left = left < 0 ? 0 : left
      const right = left + wapperRect.width
      if (right > window.innerWidth) {
        left -= right - window.innerWidth
      }
      let arrowLeft = elRect.left + elRect.width * 0.5 - left - 5
      arrowLeft = Math.max(5, Math.min(wapperRect.width - 5, arrowLeft))
      arrowRect.style = `left: ${arrowLeft}px`
    }

    const computedRightLeft = () => {
      top = elRect.top + elRect.height * 0.5 - wapperRect.height * 0.5
      top = top < 0 ? 0 : top
      const bottom = top + wapperRect.height
      if (bottom > window.innerHeight) {
        top -= bottom - window.innerHeight
      }
      let arrowTop = elRect.top + elRect.height * 0.5 - top - 5
      arrowTop = Math.max(5, Math.min(wapperRect.height - 5, arrowTop))
      arrowRect.style = `top: ${arrowTop}px`
    }

    const getWapperRect = (position: 'bottom' | 'top' | 'left' | 'right', reTry = true) => {
      switch (position) {
        case 'bottom':
          top = elRect.bottom + 25
          if (top + wapperRect.height > window.innerHeight && reTry) {
            getWapperRect('top', false)
            return
          }
          computedBottomTop()
          arrowRect.class = 'vue-tour-popper-arrow-top'
          break
        case 'top':
          top = elRect.top - wapperRect.height - 25
          if (top < 0 && reTry) {
            getWapperRect('bottom', false)
            return
          }
          computedBottomTop()
          arrowRect.class = 'vue-tour-popper-arrow-bottom'
          break
        case 'right':
          left = elRect.right + 25
          if (left + wapperRect.width > window.innerWidth && reTry) {
            getWapperRect('left', false)
            return
          }
          computedRightLeft()
          arrowRect.class = 'vue-tour-popper-arrow-left'
          break
        case 'left':
          left = elRect.left - wapperRect.width - 25
          if (left < 0 && reTry) {
            getWapperRect('right', false)
            return
          }
          computedRightLeft()
          arrowRect.class = 'vue-tour-popper-arrow-right'
          break
      }
    }
    getWapperRect(position)
    wapper.style.display = 'flex'
    wapper.style.top = `${top}px`
    wapper.style.left = `${left}px`
  }

  onMounted(() => {
    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateRect)
    window.removeEventListener('scroll', updateRect)
    removeElEvent()
  })

  const madeElEvent = () => {
    lastEl?.addEventListener('webkitAnimationEnd', updateRect)
    lastEl?.addEventListener('webkitTransitionEnd', updateRect)

    if (lastEl) {
      const config = { attributes: true, childList: true, subtree: true }
      lastObserver = new MutationObserver(updateRect)
      lastObserver.observe(lastEl, config)
    }
  }
  const removeElEvent = () => {
    lastEl?.removeEventListener('webkitAnimationEnd', updateRect)
    lastEl?.removeEventListener('webkitTransitionEnd', updateRect)
    lastObserver?.disconnect()
  }

  let lastEl: HTMLElement
  let lastObserver: MutationObserver
  watch(
    currentItem,
    () => {
      const value = currentItem?.value
      if (!value) {
        return
      }
      removeElEvent()
      lastEl = currentItem?.value?.$el
      madeElEvent()
      value?.onShow && value.onShow(currentItem.value)
      nextTick().then(() => {
        updateRect()
      })
    },
    {
      immediate: true
    }
  )

  TourCenter.updateRect = updateRect
</script>

<style lang="scss">
  .vue-tour-wapper {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 3000;
    background: #fff;
    padding: 1em;
    display: flex;
    flex-direction: column;
    width: 520px;
    text-align: start;
    text-decoration: none;
    border-radius: 8px;
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 3%), 0 1px 6px -1px rgb(0 0 0 / 2%),
      0 2px 4px 0 rgb(0 0 0 / 2%);
    border: none;
    background-clip: padding-box;
    max-width: 100vw;

    .vue-tour-header {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 24px;
      margin-bottom: 1.2em;
      font-size: 14px;
      color: #000;

      .vue-tour-close {
        width: 22px;
        height: 22px;
        color: rgba(0, 0, 0, 0.45);
        transition: background-color 0.2s, color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        border-radius: 4px;

        > svg {
          width: 10px;
          height: 10px;
        }

        &:hover {
          color: rgba(0, 0, 0, 0.88);
          background-color: rgba(0, 0, 0, 0.06);
        }
      }
    }

    .vue-tour-tool {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 1.2em;
    }

    .vue-tour-sliders {
      display: flex;

      .vue-tour-slider {
        width: 6px;
        height: 6px;
        display: inline-block;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.15);
        margin-inline-end: 6px;

        &.vue-tour-slider-active {
          background: #1677ff;
        }
      }
    }

    .vue-tour-buttons {
      display: flex;
      align-items: center;
    }

    .vue-tour-button {
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
      user-select: none;
      touch-action: manipulation;
      color: #fff;
      background-color: #1677ff;
      box-shadow: 0 2px 0 rgb(5 145 255 / 10%);
      font-size: 12px;
      height: 24px;
      padding: 2px 14px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 0.8em;

      &:hover {
        color: #fff;
        background-color: #4096ff;
      }

      &.vue-tour-button-outline {
        background-color: #fff;
        box-shadow: 0 2px 0 rgb(0 0 0 / 2%);
        color: rgba(0, 0, 0, 0.88);
        border: 1px solid #d9d9d9;

        &:hover {
          color: #4096ff;
          border-color: #4096ff;
        }
      }
    }

    .vue-tour-popper-arrow {
      position: absolute;
      left: calc(50% - 5px);
      top: -5px;
      width: 10px;
      height: 10px;
      z-index: -1;

      &:before {
        position: absolute;
        width: 10px;
        height: 10px;
        z-index: -1;
        content: ' ';
        transform: rotate(45deg);
        background: #fff;
        box-sizing: border-box;
        border: 1px solid var(--el-border-color-light);
        right: 0;
      }

      &.vue-tour-popper-arrow-top:before {
        border-bottom-color: transparent !important;
        border-right-color: transparent !important;
        border-top-left-radius: 2px;
      }

      &.vue-tour-popper-arrow-bottom {
        top: unset;
        bottom: -5px;

        &:before {
          border-top-color: transparent !important;
          border-left-color: transparent !important;
          border-bottom-right-radius: 2px;
        }
      }

      &.vue-tour-popper-arrow-left {
        top: unset;
        left: -5px;

        &:before {
          border-top-color: transparent !important;
          border-right-color: transparent !important;
          border-bottom-left-radius: 2px;
        }
      }

      &.vue-tour-popper-arrow-right {
        left: unset;
        right: -5px;

        &:before {
          border-left-color: transparent !important;
          border-bottom-color: transparent !important;
          border-top-right-radius: 2px;
        }
      }
    }
  }
</style>
