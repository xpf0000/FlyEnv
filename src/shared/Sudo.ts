export interface SudoConfig {
  name?: string
  icns?: string
  dir?: string
  debug?: boolean
  env?: any
}

export interface Sudo {
  command: string
  options: SudoConfig
  uuid?: string
  path?: string
  pathElevate?: string
  pathExecute?: string
  pathCommand?: string
  pathStdout?: string
  pathStderr?: string
  pathStatus?: string
}

const NodeSudo = {
  child: require('child_process'),
  crypto: require('crypto'),
  fs: require('fs'),
  os: require('os'),
  path: require('path'),
  process: process,
  util: require('util')
}

function Attempt(instance: Sudo, end: Function) {
  const platform = NodeSudo.process.platform
  if (platform === 'darwin') return Mac(instance, end)
  end(new Error('Platform not yet supported.'))
}

function EscapeDoubleQuotes(string: string) {
  if (typeof string !== 'string') throw new Error('Expected a string.')
  return string.replace(/"/g, '\\"')
}

function Exec(...args: any) {
  if (arguments.length < 1 || arguments.length > 3) {
    throw new Error('Wrong number of arguments.')
  }
  const command = args[0]
  let options: SudoConfig = {}
  let end: Function = function () {}
  if (typeof command !== 'string') {
    throw new Error('Command should be a string.')
  }
  if (arguments.length === 2) {
    if (NodeSudo.util.isObject(args[1])) {
      options = args[1]
    } else if (NodeSudo.util.isFunction(args[1])) {
      end = args[1]
    } else {
      throw new Error('Expected options or callback.')
    }
  } else if (arguments.length === 3) {
    if (NodeSudo.util.isObject(args[1])) {
      options = args[1]
    } else {
      throw new Error('Expected options to be an object.')
    }
    if (NodeSudo.util.isFunction(args[2])) {
      end = args[2]
    } else {
      throw new Error('Expected callback to be a function.')
    }
  }
  if (/^sudo/i.test(command)) {
    return end(new Error('Command should not be prefixed with "sudo".'))
  }
  if (typeof options.name === 'undefined') {
    const title = NodeSudo.process.title
    if (ValidName(title)) {
      options.name = title
    } else {
      return end(new Error('process.title cannot be used as a valid name.'))
    }
  } else if (!ValidName(options.name)) {
    let error = ''
    error += 'options.name must be alphanumeric only '
    error += '(spaces are allowed) and <= 70 characters.'
    return end(new Error(error))
  }
  if (typeof options.icns !== 'undefined') {
    if (typeof options.icns !== 'string') {
      return end(new Error('options.icns must be a string if provided.'))
    } else if (options.icns.trim().length === 0) {
      return end(new Error('options.icns must not be empty if provided.'))
    }
  }
  if (typeof options.env !== 'undefined') {
    if (typeof options.env !== 'object') {
      return end(new Error('options.env must be an object if provided.'))
    } else if (Object.keys(options.env).length === 0) {
      return end(new Error('options.env must not be empty if provided.'))
    } else {
      for (const key in options.env) {
        const value = options.env[key]
        if (typeof key !== 'string' || typeof value !== 'string') {
          return end(new Error('options.env environment variables must be strings.'))
        }
        // "Environment variable names used by the utilities in the Shell and
        // Utilities volume of IEEE Std 1003.1-2001 consist solely of uppercase
        // letters, digits, and the '_' (underscore) from the characters defined
        // in Portable Character Set and do not begin with a digit. Other
        // characters may be permitted by an implementation; applications shall
        // tolerate the presence of such names."
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          return end(
            new Error(
              'options.env has an invalid environment variable name: ' + JSON.stringify(key)
            )
          )
        }
        if (/[\r\n]/.test(value)) {
          return end(
            new Error(
              'options.env has an invalid environment variable value: ' + JSON.stringify(value)
            )
          )
        }
      }
    }
  }
  const platform = NodeSudo.process.platform
  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
    return end(new Error('Platform not yet supported.'))
  }
  const instance = {
    command: command,
    options: options,
    uuid: undefined,
    path: undefined
  }
  Attempt(instance, end)
}

function Mac(instance: Sudo, callback: Function) {
  const temp = instance?.options?.dir ?? NodeSudo.os.tmpdir()
  if (!temp) return callback(new Error('os.tmpdir() not defined.'))
  const user = NodeSudo.process.env.USER // Applet shell scripts require $USER.
  if (!user) return callback(new Error(`env[\'USER\'] not defined.`))
  UUID(instance, function (error: any, uuid: string) {
    if (error) return callback(error)
    instance.uuid = uuid
    instance.path = NodeSudo.path.join(temp, instance.uuid, instance.options.name + '.app')
    function end(error: any, stdout?: string, stderr?: string) {
      if (instance?.options?.debug === true) {
        callback(undefined, stdout, stderr)
        return
      }
      Remove(NodeSudo.path.dirname(instance.path), function (errorRemove: any) {
        if (error) return callback(error)
        if (errorRemove) return callback(errorRemove)
        callback(undefined, stdout, stderr)
      })
    }
    MacApplet(instance, function (error: any, stdout: string, stderr: string) {
      if (error) return end(error, stdout, stderr)
      MacIcon(instance, function (error: any) {
        if (error) return end(error)
        MacPropertyList(instance, function (error: any, stdout: string, stderr: string) {
          if (error) return end(error, stdout, stderr)
          MacCommand(instance, function (error: any) {
            if (error) return end(error)
            MacOpen(instance, function (error: any, stdout: string, stderr: string) {
              if (error) return end(error, stdout, stderr)
              MacResult(instance, end)
            })
          })
        })
      })
    })
  })
}

function MacApplet(instance: Sudo, end: Function) {
  const parent = NodeSudo.path.dirname(instance.path)
  NodeSudo.fs.mkdir(parent, function (error: any) {
    if (error) return end(error)
    const zip = NodeSudo.path.join(parent, 'sudo-prompt-applet.zip')
    NodeSudo.fs.writeFile(zip, APPLET, 'base64', function (error: any) {
      if (error) return end(error)
      let command: any = []
      command.push('/usr/bin/unzip')
      command.push('-o') // Overwrite any existing applet.
      command.push('"' + EscapeDoubleQuotes(zip) + '"')
      command.push('-d "' + EscapeDoubleQuotes(instance.path!) + '"')
      command = command.join(' ')
      NodeSudo.child.exec(command, { encoding: 'utf-8' }, end)
    })
  })
}

function MacCommand(instance: Sudo, end: Function) {
  const path = NodeSudo.path.join(instance.path, 'Contents', 'MacOS', 'sudo-prompt-command')
  let script: any = []
  // Preserve current working directory:
  // We do this for commands that rely on relative paths.
  // This runs in a subshell and will not change the cwd of sudo-prompt-script.
  script.push('cd "' + EscapeDoubleQuotes(NodeSudo.process.cwd()) + '"')
  // Export environment variables:
  for (const key in instance.options.env) {
    const value = instance.options.env[key]
    script.push('export ' + key + '="' + EscapeDoubleQuotes(value) + '"')
  }
  script.push(instance.command)
  script = script.join('\n')
  NodeSudo.fs.writeFile(path, script, 'utf-8', end)
}

function MacIcon(instance: Sudo, end: Function) {
  if (!instance.options.icns) return end()
  NodeSudo.fs.readFile(instance.options.icns, function (error: any, buffer: any) {
    if (error) return end(error)
    const icns = NodeSudo.path.join(instance.path, 'Contents', 'Resources', 'applet.icns')
    NodeSudo.fs.writeFile(icns, buffer, end)
  })
}

function MacOpen(instance: Sudo, end: Function) {
  // We must run the binary directly so that the cwd will apply.
  const binary = NodeSudo.path.join(instance.path, 'Contents', 'MacOS', 'applet')
  // We must set the cwd so that the AppleScript can find the shell scripts.
  const options = {
    cwd: NodeSudo.path.dirname(binary),
    encoding: 'utf-8'
  }
  // We use the relative path rather than the absolute path. The instance.path
  // may contain spaces which the cwd can handle, but which exec() cannot.
  NodeSudo.child.exec('./' + NodeSudo.path.basename(binary), options, end)
}

function MacPropertyList(instance: Sudo, end: Function) {
  // Value must be in single quotes (not double quotes) according to man entry.
  // e.g. defaults write com.companyname.appname "Default Color" '(255, 0, 0)'
  // The defaults command will be changed in an upcoming major release to only
  // operate on preferences domains. General plist manipulation utilities will
  // be folded into a different command-line program.
  const plist = NodeSudo.path.join(instance.path, 'Contents', 'Info.plist')
  const path = EscapeDoubleQuotes(plist)
  const key = EscapeDoubleQuotes('CFBundleName')
  const value = instance.options.name + ' Password Prompt'
  if (/'/.test(value)) {
    return end(new Error('Value should not contain single quotes.'))
  }
  let command: any = []
  command.push('/usr/bin/defaults')
  command.push('write')
  command.push('"' + path + '"')
  command.push('"' + key + '"')
  command.push(`'` + value + `'`) // We must use single quotes for value.
  command = command.join(' ')
  NodeSudo.child.exec(command, { encoding: 'utf-8' }, end)
}

function MacResult(instance: Sudo, end: Function) {
  const cwd = NodeSudo.path.join(instance.path, 'Contents', 'MacOS')
  NodeSudo.fs.readFile(NodeSudo.path.join(cwd, 'code'), 'utf-8', function (error: any, code: any) {
    if (error) {
      if (error.code === 'ENOENT') return end(new Error(PERMISSION_DENIED))
      end(error)
    } else {
      NodeSudo.fs.readFile(
        NodeSudo.path.join(cwd, 'stdout'),
        'utf-8',
        function (error: any, stdout: string) {
          if (error) return end(error)
          NodeSudo.fs.readFile(
            NodeSudo.path.join(cwd, 'stderr'),
            'utf-8',
            function (error: any, stderr: string) {
              if (error) return end(error)
              code = parseInt(code.trim(), 10) // Includes trailing newline.
              if (code === 0) {
                end(undefined, stdout, stderr)
              } else {
                error = new Error('Command failed: ' + instance.command + '\n' + stderr)
                error.code = code
                end(error, stdout, stderr)
              }
            }
          )
        }
      )
    }
  })
}

function Remove(path: string, end: Function) {
  if (typeof path !== 'string' || !path.trim()) {
    return end(new Error('Argument path not defined.'))
  }
  let command: any = []
  command.push('/bin/rm')
  command.push('-rf')
  command.push('"' + EscapeDoubleQuotes(NodeSudo.path.normalize(path)) + '"')
  command = command.join(' ')
  NodeSudo.child.exec(command, { encoding: 'utf-8' }, end)
}

function UUID(instance: Sudo, end: Function) {
  NodeSudo.crypto.randomBytes(256, function (error: any, random: string) {
    if (error) random = Date.now() + '' + Math.random()
    const hash = NodeSudo.crypto.createHash('SHA256')
    hash.update('sudo-prompt-3')
    hash.update(instance.options.name)
    hash.update(instance.command)
    hash.update(random)
    const uuid = hash.digest('hex').slice(-32)
    if (!uuid || typeof uuid !== 'string' || uuid.length !== 32) {
      // This is critical to ensure we don't remove the wrong temp directory.
      return end(new Error('Expected a valid UUID.'))
    }
    end(undefined, uuid)
  })
}

function ValidName(string: string) {
  // We use 70 characters as a limit to side-step any issues with Unicode
  // normalization form causing a 255 character string to exceed the fs limit.
  if (!/^[a-z0-9 ]+$/i.test(string)) return false
  if (string.trim().length === 0) return false
  if (string.length > 70) return false
  return true
}

// We used to expect that applet.app would be included with this module.
// This could not be copied when sudo-prompt was packaged within an asar file.
// We now store applet.app as a zip file in base64 within index.js instead.
// To recreate: "zip -r ../applet.zip Contents" (with applet.app as CWD).
// The zip file must not include applet.app as the root directory so that we
// can extract it directly to the target app directory.
//
// To update the applet, follow these steps:
// * open main.scpt in macOS Script Editor and edit it as needed
// * select File | Export... (file format: Application)
// * replace the `applet` in `Contents/MacOS`
// * `zip -r ../applet.zip Contents`
// * base64 encode the zip file
// * replace the contents of the `APPLET` variable
const APPLET =
  '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'

const PERMISSION_DENIED = 'User did not grant permission.'

export default Exec
