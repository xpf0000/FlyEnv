const input = '##FlyEnv-Process-ID7789FlyEnv-Process-ID##'
const regex = /FlyEnv-Process-ID(\d+)FlyEnv-Process-ID/
const match = regex.exec(input)

if (match) {
  const processId = match[1] // 捕获组 (\d+) 的内容
  console.log(processId) // 输出: "7789"
} else {
  console.log('未匹配到 Process ID')
}
