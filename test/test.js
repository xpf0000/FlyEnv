const { exec } = require('child-process-promise')

const psName = 'start.ps1'

exec(
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath './${psName}'; & './${psName}'"`,
  {
    cwd: `C:\\Users\\x\\Desktop\\Git Hub\\FlyEnv\\data\\server\\apache`
  }
)
  .then((res) => {
    console.log('res: ', res)
  })
  .catch((e) => {
    console.log('e: ', e)
  })
