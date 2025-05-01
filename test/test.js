const { exec } = require('child-process-promise')

const psName = 'start.ps1'

// exec(
//   `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath './${psName}'; & './${psName}'"`,
//   {
//     cwd: `C:\\Users\\x\\Desktop\\Git Hub\\FlyEnv\\data\\server\\apache`
//   }
// )
//   .then((res) => {
//     console.log('res: ', res)
//   })
//   .catch((e) => {
//     console.log('e: ', e)
//   })

const fn = async () => {
  console.log('fn !!!')
  const res = await exec(
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath './${psName}'; & './${psName}'"`,
    {
      cwd: `C:\\Users\\x\\Desktop\\Git Hub\\FlyEnv\\data\\server\\apache`
    }
  )
  console.log('res: ', res.stdout, res.stderr)
}

fn().then().catch()
