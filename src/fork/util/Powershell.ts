import { execPromise } from '@shared/child-process'
import { ForkPromise } from '@shared/ForkPromise'

function escapeShellArg(arg: string) {
  // First check if argument needs wrapping
  if (!arg.match(/[ "'\r\n]/)) return arg
  // Escape double quotes by backslash-escaping them, then wrap in double quotes
  return `"${arg.replace(/"/g, '\\"')}"`
}

// Helper function to escape PowerShell arguments
export function escapePowershellArg(arg: string): string {
  // First check if argument needs wrapping
  if (!arg.match(/[ "'\r\n]/)) return arg
  // Escape single quotes by doubling them, then wrap in single quotes
  return `'${arg.replace(/'/g, "''")}'`
}

/*
 * Execute a Powershell command with proper escaping
 * This function executes a command in PowerShell and returns the output.
 * It uses proper PowerShell argument escaping for reliable command execution.
 * Usage:
 *   powershellCmd('Get-Process').then(output => console.log(output));
 *   powershellCmd('$env:NVM_HOME').then(output => console.log(output.trim()));
 */
export function powershellCmd(cmd: string, options: any = {}): ForkPromise<string> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      const escapedArg = escapeShellArg(cmd)
      const result: any = await (execPromise as any)(
        `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command ${escapedArg}`,
        options
      )
      resolve(result.stdout?.toString() || '')
    } catch (error) {
      reject(error)
    }
  })
}

/*
 * This function starts a process using PowerShell's Start-Process cmdlet and returns the process ID.
 * It allows passing arguments to the process and handles escaping of special characters.
 * Usage:
 *   powershellExecProcess('notepad.exe', ['file.txt']).then(pid => console.log(`Started process with PID: ${pid}`));
 */
export function powershellExecProcess(file: string, args: string[] = [], options: any = {}): ForkPromise<string> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      const escapedFile = escapePowershellArg(file)
      let cmd: string

      if (args.length > 0) {
        const escapedArgs = args.map(escapePowershellArg).join(',')
        cmd = `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Process ${escapedFile} -ArgumentList @(${escapedArgs}) -PassThru | Select-Object -ExpandProperty Id"`
      } else {
        cmd = `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Process ${escapedFile} -PassThru | Select-Object -ExpandProperty Id"`
      }

      const result: any = await (execPromise as any)(cmd, options)
      resolve(result.stdout?.toString() || '')
    } catch (error) {
      reject(error)
    }
  })
}

/*
 * This function executes a script with PowerShell, allowing for arguments and options.
 * It unblocks the script file before execution to ensure it runs without restrictions.
 * Usage:
 *   powershellExecScript('script.ps1', ['arg1', 'arg2']).then(output => console.log(output));
 */
export function powershellExecScript(file: string, args: string[] = [], options: any = {}): ForkPromise<string> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      const escapedFile = escapePowershellArg(file)
      let cmd: string

      if (args.length > 0) {
        const escapedArgs = args.map(escapePowershellArg).join(' ')
        cmd = `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath ${escapedFile}; & ${escapedFile} ${escapedArgs}"`
      } else {
        cmd = `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath ${escapedFile}; & ${escapedFile}"`
      }

      const result: any = await (execPromise as any)(cmd, options)
      resolve(result.stdout?.toString() || '')
    } catch (error) {
      reject(error)
    }
  })
}

/*
 * This function executes a file with PowerShell, allowing for arguments and options.
 * It uses the -File parameter to run the specified script file.
 * Usage:
 *   powershellExecFile('notepad.exe', ['file.txt']).then(output => console.log(output));
 */
export function powershellExecFile(file: string, args: string[] = [], options: any = {}): ForkPromise<string> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      const escapedFile = escapeShellArg(file)
      let cmd: string

      if (args.length > 0) {
        const escapedArgs = args.map(escapeShellArg).join(' ')
        cmd = `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ${escapedFile} ${escapedArgs}`
      } else {
        cmd = `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ${escapedFile}`
      }

      const result: any = await (execPromise as any)(cmd, options)
      resolve(result.stdout?.toString() || '')
    } catch (error) {
      reject(error)
    }
  })
}

/*
 * Execute a Powershell command with unblock file support
 * This function executes a command in PowerShell and returns the output.
 * It first unblocks the file to ensure it can be executed.
 * Usage:
 *   powershellExecWithUnblock('script.ps1').then(output => console.log(output));
 */
export function powershellExecWithUnblock(file: string, options: any = {}): ForkPromise<string> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      const escapedFile = escapePowershellArg(file)
      const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath ${escapedFile}; & ${escapedFile}"`
      const result: any = await (execPromise as any)(cmd, options)
      resolve(result.stdout?.toString() || '')
    } catch (error) {
      reject(error)
    }
  })
}
