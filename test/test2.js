const { spawn } = require('child_process')

// 方法 1：强制使用绝对路径（避免 PATH 问题）
const powershellPath =
  process.env.SystemRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

const powershell = spawn(
  'powershell', // 使用绝对路径
  ['-NoExit', '-Command', 'Write-Host "Hello, World!"'],
  {
    detached: true,
    shell: true, // 强制使用系统 shell（关键！）
    stdio: 'ignore' // 显示窗口（替代 'ignore'）
  }
)

powershell.unref() // 避免阻塞父进程
