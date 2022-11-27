<template>
  <ul class="tour-content-step">
    <li>应用本身不包含任何软件, 全部依托brew管理</li>
    <li>如果没安装brew, 这里会进行安装</li>
    <li>已安装过brew的, 建议保持brew的更新</li>
    <li
      >电脑MacOS系统太老, 或者brew版本太老, 使用brew安装软件可能会有问题, 这是brew本身机制导致的,
      基本无解</li
    >
    <li>在这里添加卸载软件, 最终调用的还是brew install/uninstall xxx</li>
    <li>也可以在终端中, 自行使用brew命令安装卸载软件, 这里点击刷新, 即可显示新安装/卸载的软件</li>
  </ul>
</template>

<script lang="ts" setup></script>
