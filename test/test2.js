const path = require('path')
const { execSync } = require('child_process')

function isNTFS(fileOrDirPath) {
  try {
    const driveLetter = path.parse(fileOrDirPath).root.replace(/[:\\]/g, '')
    const jsonResult = execSync(
      `powershell -command "Get-Volume -DriveLetter ${driveLetter} | ConvertTo-Json"`,
      { encoding: 'utf-8' }
    )
    console.log('jsonResult: ', jsonResult)
    const { FileSystem, FileSystemType } = JSON.parse(jsonResult)
    return FileSystem === 'NTFS' || FileSystemType === 'NTFS'
  } catch (error) {
    console.error('PowerShell 检查失败:', error)
    return false
  }
}

// 示例用法
;(async () => {
  console.log(await isNTFS('C:\\PerfLogs')) // 检查文件
  console.log(await isNTFS('D:\\LaoMaoTao')) // 检查文件夹
  console.log(await isNTFS('E:\\scoopApp')) // 检查符号链接
})()
