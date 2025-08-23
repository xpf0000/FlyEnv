var Node = {
  child: require('child_process'),
  crypto: require('crypto'),
  fs: require('fs'),
  os: require('os'),
  path: require('path'),
  process: process,
};

class SudoPromptError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SudoPromptError';
  }
}

function Attempt(instance, end) {
  var platform = Node.process.platform;
  if (platform === 'darwin') return Mac(instance, end);
  if (platform === 'linux') return Linux(instance, end);
  if (platform === 'win32') return Windows(instance, end);
  end(new SudoPromptError('Platform not yet supported.'));
}

function EscapeDoubleQuotes(string) {
  if (typeof string !== 'string') throw new SudoPromptError('Expected a string.');
  return string.replace(/"/g, '\\"');
}

function Exec() {
  if (arguments.length < 1 || arguments.length > 3) {
    throw new SudoPromptError('Wrong number of arguments.');
  }
  var command = arguments[0];
  var options = {};
  var end = function() {};
  if (typeof command !== 'string') {
    throw new SudoPromptError('Command should be a string.');
  }
  if (arguments.length === 2) {
    if (arguments[1] && typeof arguments[1] === 'object') {
      options = arguments[1];
    } else if (typeof arguments[1] === 'function') {
      end = arguments[1];
    } else {
      throw new SudoPromptError('Expected options or callback.');
    }
  } else if (arguments.length === 3) {
    if (arguments[1] && typeof arguments[1] === 'object') {
      options = arguments[1];
    } else {
      throw new SudoPromptError('Expected options to be an object.');
    }
    if (typeof arguments[2] === 'function') {
      end = arguments[2];
    } else {
      throw new SudoPromptError('Expected callback to be a function.');
    }
  }
  if (/^sudo/i.test(command)) {
    return end(new SudoPromptError('Command should not be prefixed with "sudo".'));
  }
  if (typeof options.name === 'undefined') {
    var title = Node.process.title;
    if (ValidName(title)) {
      options.name = title;
    } else {
      return end(new SudoPromptError('process.title cannot be used as a valid name.'));
    }
  } else if (!ValidName(options.name)) {
    var error = '';
    error += 'options.name must be alphanumeric only ';
    error += '(spaces are allowed) and <= 70 characters.';
    return end(new SudoPromptError(error));
  }
  if (typeof options.icns !== 'undefined') {
    if (typeof options.icns !== 'string') {
      return end(new SudoPromptError('options.icns must be a string if provided.'));
    } else if (options.icns.trim().length === 0) {
      return end(new SudoPromptError('options.icns must not be empty if provided.'));
    }
  }
  if (typeof options.env !== 'undefined') {
    if (typeof options.env !== 'object') {
      return end(new SudoPromptError('options.env must be an object if provided.'));
    } else if (Object.keys(options.env).length === 0) {
      return end(new SudoPromptError('options.env must not be empty if provided.'));
    } else {
      for (var key in options.env) {
        var value = options.env[key];
        if (typeof key !== 'string' || typeof value !== 'string') {
          return end(
            new SudoPromptError('options.env environment variables must be strings.')
          );
        }
        // "Environment variable names used by the utilities in the Shell and
        // Utilities volume of IEEE Std 1003.1-2001 consist solely of uppercase
        // letters, digits, and the '_' (underscore) from the characters defined
        // in Portable Character Set and do not begin with a digit. Other
        // characters may be permitted by an implementation; applications shall
        // tolerate the presence of such names."
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          return end(
            new SudoPromptError(
              'options.env has an invalid environment variable name: ' +
              JSON.stringify(key)
            )
          );
        }
        if (/[\r\n]/.test(value)) {
          return end(
            new SudoPromptError(
              'options.env has an invalid environment variable value: ' +
              JSON.stringify(value)
            )
          );
        }
      }
    }
  }
  var platform = Node.process.platform;
  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
    return end(new SudoPromptError('Platform not yet supported.'));
  }
  var instance = {
    command: command,
    options: options,
    uuid: undefined,
    path: undefined
  };
  Attempt(instance, end);
}

function Linux(instance, end) {
  LinuxBinary(instance,
    function(error, binary) {
      if (error) return end(error);
      var command = [];
      // Preserve current working directory:
      command.push('cd "' + EscapeDoubleQuotes(Node.process.cwd()) + '";');
      // Export environment variables:
      for (var key in instance.options.env) {
        var value = instance.options.env[key];
        command.push('export ' + key + '="' + EscapeDoubleQuotes(value) + '";');
      }
      command.push('"' + EscapeDoubleQuotes(binary) + '"');
      if (/kdesudo/i.test(binary)) {
        command.push(
          '--comment',
          '"' + instance.options.name + ' wants to make changes. ' +
          'Enter your password to allow this."'
        );
        command.push('-d'); // Do not show the command to be run in the dialog.
        command.push('--');
      } else if (/pkexec/i.test(binary)) {
        command.push('--disable-internal-agent');
      }
      var magic = 'SUDOPROMPT\n';
      command.push(
        '/bin/bash -c "echo ' + EscapeDoubleQuotes(magic.trim()) + '; ' +
        EscapeDoubleQuotes(instance.command) +
        '"'
      );
      command = command.join(' ');
      Node.child.exec(command, { encoding: 'utf-8', maxBuffer: MAX_BUFFER },
        function(error, stdout, stderr) {
          // ISSUE 88:
          // We must distinguish between elevation errors and command errors.
          //
          // KDESUDO:
          // kdesudo provides no way to do this. We add a magic marker to know
          // if elevation succeeded. Any error thereafter is a command error.
          //
          // PKEXEC:
          // "Upon successful completion, the return value is the return value of
          // PROGRAM. If the calling process is not authorized or an
          // authorization could not be obtained through authentication or an
          // error occured, pkexec exits with a return value of 127. If the
          // authorization could not be obtained because the user dismissed the
          // authentication dialog, pkexec exits with a return value of 126."
          //
          // However, we do not rely on pkexec's return of 127 since our magic
          // marker is more reliable, and we already use it for kdesudo.
          var elevated = stdout && stdout.slice(0, magic.length) === magic;
          if (elevated) stdout = stdout.slice(magic.length);
          // Only normalize the error if it is definitely not a command error:
          // In other words, if we know that the command was never elevated.
          // We do not inspect error messages beyond NO_POLKIT_AGENT.
          // We cannot rely on English errors because of internationalization.
          if (error && !elevated) {
            if (/No authentication agent found/.test(stderr)) {
              error = new SudoPromptError(NO_POLKIT_AGENT);
            } else {
              error = new SudoPromptError(PERMISSION_DENIED);
            }
          }
          end(error, stdout, stderr);
        }
      );
    }
  );
}

function LinuxBinary(instance, end) {
  var index = 0;
  // We used to prefer gksudo over pkexec since it enabled a better prompt.
  // However, gksudo cannot run multiple commands concurrently.
  var paths = ['/usr/bin/kdesudo', '/usr/bin/pkexec'];
  function test() {
    if (index === paths.length) {
      return end(new SudoPromptError('Unable to find pkexec or kdesudo.'));
    }
    var path = paths[index++];
    Node.fs.stat(path,
      function(error) {
        if (error) {
          if (error.code === 'ENOTDIR') return test();
          if (error.code === 'ENOENT') return test();
          end(error);
        } else {
          end(undefined, path);
        }
      }
    );
  }
  test();
}

function Mac(instance, callback) {
  var temp = Node.os.tmpdir();
  if (!temp) return callback(new SudoPromptError('os.tmpdir() not defined.'));
  var user = Node.process.env.USER; // Applet shell scripts require $USER.
  if (!user) return callback(new SudoPromptError('env[\'USER\'] not defined.'));
  UUID(instance,
    function(error, uuid) {
      if (error) return callback(error);
      instance.uuid = uuid;
      instance.path = Node.path.join(
        temp,
        instance.uuid,
        instance.options.name + '.app'
      );
      function end(error, stdout, stderr) {
        Remove(Node.path.dirname(instance.path),
          function(errorRemove) {
            if (error) return callback(error);
            if (errorRemove) return callback(errorRemove);
            callback(undefined, stdout, stderr);
          }
        );
      }
      MacApplet(instance,
        function(error, stdout, stderr) {
          if (error) return end(error, stdout, stderr);
          MacIcon(instance,
            function(error) {
              if (error) return end(error);
              MacPropertyList(instance,
                function(error, stdout, stderr) {
                  if (error) return end(error, stdout, stderr);
                  MacCommand(instance,
                    function(error) {
                      if (error) return end(error);
                      MacOpen(instance,
                        function(error, stdout, stderr) {
                          if (error) return end(error, stdout, stderr);
                          MacResult(instance, end);
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
}

function MacApplet(instance, end) {
  var parent = Node.path.dirname(instance.path);
  Node.fs.mkdir(parent,
    function(error) {
      if (error) return end(error);
      var zip = Node.path.join(parent, 'sudo-prompt-applet.zip');
      Node.fs.writeFile(zip, APPLET, 'base64',
        function(error) {
          if (error) return end(error);
          var command = [];
          command.push('/usr/bin/unzip');
          command.push('-o'); // Overwrite any existing applet.
          command.push('"' + EscapeDoubleQuotes(zip) + '"');
          command.push('-d "' + EscapeDoubleQuotes(instance.path) + '"');
          command = command.join(' ');
          Node.child.exec(command, { encoding: 'utf-8' }, end);
        }
      );
    }
  );
}

function MacCommand(instance, end) {
  var path = Node.path.join(
    instance.path,
    'Contents',
    'MacOS',
    'sudo-prompt-command'
  );
  var script = [];
  // Preserve current working directory:
  // We do this for commands that rely on relative paths.
  // This runs in a subshell and will not change the cwd of sudo-prompt-script.
  script.push('cd "' + EscapeDoubleQuotes(Node.process.cwd()) + '"');
  // Export environment variables:
  for (var key in instance.options.env) {
    var value = instance.options.env[key];
    script.push('export ' + key + '="' + EscapeDoubleQuotes(value) + '"');
  }
  script.push(instance.command);
  script = script.join('\n');
  Node.fs.writeFile(path, script, 'utf-8', end);
}

function MacIcon(instance, end) {
  if (!instance.options.icns) return end();
  Node.fs.readFile(instance.options.icns,
    function(error, buffer) {
      if (error) return end(error);
      var icns = Node.path.join(
        instance.path,
        'Contents',
        'Resources',
        'applet.icns'
      );
      Node.fs.writeFile(icns, buffer, end);
    }
  );
}

function MacOpen(instance, end) {
  // We must run the binary directly so that the cwd will apply.
  var binary = Node.path.join(instance.path, 'Contents', 'MacOS', 'applet');
  // We must set the cwd so that the AppleScript can find the shell scripts.
  var options = {
    cwd: Node.path.dirname(binary),
    encoding: 'utf-8'
  };
  // We use the relative path rather than the absolute path. The instance.path
  // may contain spaces which the cwd can handle, but which exec() cannot.
  Node.child.exec('./' + Node.path.basename(binary), options, end);
}

function MacPropertyList(instance, end) {
  // Value must be in single quotes (not double quotes) according to man entry.
  // e.g. defaults write com.companyname.appname "Default Color" '(255, 0, 0)'
  // The defaults command will be changed in an upcoming major release to only
  // operate on preferences domains. General plist manipulation utilities will
  // be folded into a different command-line program.
  var plist = Node.path.join(instance.path, 'Contents', 'Info.plist');
  var path = EscapeDoubleQuotes(plist);
  var key = EscapeDoubleQuotes('CFBundleName');
  var value = instance.options.name + ' Password Prompt';
  if (/'/.test(value)) {
    return end(new SudoPromptError('Value should not contain single quotes.'));
  }
  var command = [];
  command.push('/usr/bin/defaults');
  command.push('write');
  command.push('"' + path + '"');
  command.push('"' + key + '"');
  command.push("'" + value + "'"); // We must use single quotes for value.
  command = command.join(' ');
  Node.child.exec(command, { encoding: 'utf-8' }, end);
}

function MacResult(instance, end) {
  var cwd = Node.path.join(instance.path, 'Contents', 'MacOS');
  Node.fs.readFile(Node.path.join(cwd, 'code'), 'utf-8',
    function(error, code) {
      if (error) {
        if (error.code === 'ENOENT') return end(new SudoPromptError(PERMISSION_DENIED));
        end(error);
      } else {
        Node.fs.readFile(Node.path.join(cwd, 'stdout'), 'utf-8',
          function(error, stdout) {
            if (error) return end(error);
            Node.fs.readFile(Node.path.join(cwd, 'stderr'), 'utf-8',
              function(error, stderr) {
                if (error) return end(error);
                code = parseInt(code.trim(), 10); // Includes trailing newline.
                if (code === 0) {
                  end(undefined, stdout, stderr);
                } else {
                  error = new SudoPromptError(
                    'Command failed: ' + instance.command + '\n' + stderr
                  );
                  error.code = code;
                  end(error, stdout, stderr);
                }
              }
            );
          }
        );
      }
    }
  );
}

function Remove(path, end) {
  if (typeof path !== 'string' || !path.trim()) {
    return end(new SudoPromptError('Argument path not defined.'));
  }
  var command = [];
  if (Node.process.platform === 'win32') {
    if (/"/.test(path)) {
      return end(new SudoPromptError('Argument path cannot contain double-quotes.'));
    }
    command.push('rmdir /s /q "' + path + '"');
  } else {
    command.push('/bin/rm');
    command.push('-rf');
    command.push('"' + EscapeDoubleQuotes(Node.path.normalize(path)) + '"');
  }
  command = command.join(' ');
  Node.child.exec(command, { encoding: 'utf-8' }, end);
}

function UUID(instance, end) {
  Node.crypto.randomBytes(256,
    function(error, random) {
      if (error) random = Date.now() + '' + Math.random();
      var hash = Node.crypto.createHash('SHA256');
      hash.update('sudo-prompt-3');
      hash.update(instance.options.name);
      hash.update(instance.command);
      hash.update(random);
      var uuid = hash.digest('hex').slice(-32);
      if (!uuid || typeof uuid !== 'string' || uuid.length !== 32) {
        // This is critical to ensure we don't remove the wrong temp directory.
        return end(new SudoPromptError('Expected a valid UUID.'));
      }
      end(undefined, uuid);
    }
  );
}

function ValidName(string) {
  // We use 70 characters as a limit to side-step any issues with Unicode
  // normalization form causing a 255 character string to exceed the fs limit.
  if (!/^[a-z0-9 ]+$/i.test(string)) return false;
  if (string.trim().length === 0) return false;
  if (string.length > 70) return false;
  return true;
}

function Windows(instance, callback) {
  var temp = Node.os.tmpdir();
  if (!temp) return callback(new SudoPromptError('os.tmpdir() not defined.'));
  UUID(instance,
    function(error, uuid) {
      if (error) return callback(error);
      instance.uuid = uuid;
      instance.path = Node.path.join(temp, instance.uuid);
      if (/"/.test(instance.path)) {
        // We expect double quotes to be reserved on Windows.
        // Even so, we test for this and abort if they are present.
        return callback(
          new SudoPromptError('instance.path cannot contain double-quotes.')
        );
      }
      instance.pathElevate = Node.path.join(instance.path, 'elevate.vbs');
      instance.pathExecute = Node.path.join(instance.path, 'execute.bat');
      instance.pathCommand = Node.path.join(instance.path, 'command.bat');
      instance.pathStdout = Node.path.join(instance.path, 'stdout');
      instance.pathStderr = Node.path.join(instance.path, 'stderr');
      instance.pathStatus = Node.path.join(instance.path, 'status');
      Node.fs.mkdir(instance.path,
        function(error) {
          if (error) return callback(error);
          function end(error, stdout, stderr) {
            Remove(instance.path,
              function(errorRemove) {
                if (error) return callback(error);
                if (errorRemove) return callback(errorRemove);
                callback(undefined, stdout, stderr);
              }
            );
          }
          WindowsWriteExecuteScript(instance,
            function(error) {
              if (error) return end(error);
              WindowsWriteCommandScript(instance,
                function(error) {
                  if (error) return end(error);
                  WindowsElevate(instance,
                    function(error, stdout, stderr) {
                      if (error) return end(error, stdout, stderr);
                      WindowsWaitForStatus(instance,
                        function(error) {
                          if (error) return end(error);
                          WindowsResult(instance, end);
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
}

function WindowsElevate(instance, end) {
  // We used to use this for executing elevate.vbs:
  // var command = 'cscript.exe //NoLogo "' + instance.pathElevate + '"';
  var command = [];
  command.push('powershell.exe');
  command.push('Start-Process');
  command.push('-FilePath');
  // Escape characters for cmd using double quotes:
  // Escape characters for PowerShell using single quotes:
  // Escape single quotes for PowerShell using backtick:
  // See: https://ss64.com/ps/syntax-esc.html
  command.push('"\'' + instance.pathExecute.replace(/'/g, "`'") + '\'"');
  command.push('-WindowStyle hidden');
  command.push('-Verb runAs');
  command = command.join(' ');
  var child = Node.child.exec(command, { encoding: 'utf-8' },
    function(error, stdout, stderr) {
      // We used to return PERMISSION_DENIED only for error messages containing
      // the string 'canceled by the user'. However, Windows internationalizes
      // error messages (issue 96) so now we must assume all errors here are
      // permission errors. This seems reasonable, given that we already run the
      // user's command in a subshell.
      if (error) return end(new SudoPromptError(PERMISSION_DENIED), stdout, stderr);
      end();
    }
  );
  child.stdin.end(); // Otherwise PowerShell waits indefinitely on Windows 7.
}

function WindowsResult(instance, end) {
  Node.fs.readFile(instance.pathStatus, 'utf-8',
    function(error, code) {
      if (error) return end(error);
      Node.fs.readFile(instance.pathStdout, 'utf-8',
        function(error, stdout) {
          if (error) return end(error);
          Node.fs.readFile(instance.pathStderr, 'utf-8',
            function(error, stderr) {
              if (error) return end(error);
              code = parseInt(code.trim(), 10);
              if (code === 0) {
                end(undefined, stdout, stderr);
              } else {
                error = new SudoPromptError(
                  'Command failed: ' + instance.command + '\r\n' + stderr
                );
                error.code = code;
                end(error, stdout, stderr);
              }
            }
          );
        }
      );
    }
  );
}

function WindowsWaitForStatus(instance, end) {
  // VBScript cannot wait for the elevated process to finish so we have to poll.
  // VBScript cannot return error code if user does not grant permission.
  // PowerShell can be used to elevate and wait on Windows 10.
  // PowerShell can be used to elevate on Windows 7 but it cannot wait.
  // powershell.exe Start-Process cmd.exe -Verb runAs -Wait
  Node.fs.stat(instance.pathStatus,
    function(error, stats) {
      if ((error && error.code === 'ENOENT') || stats.size < 2) {
        // Retry if file does not exist or is not finished writing.
        // We expect a file size of 2. That should cover at least "0\r".
        // We use a 1 second timeout to keep a light footprint for long-lived
        // sudo-prompt processes.
        setTimeout(
          function() {
            // If administrator has no password and user clicks Yes, then
            // PowerShell returns no error and execute (and command) never runs.
            // We check that command output has been redirected to stdout file:
            Node.fs.stat(instance.pathStdout,
              function(error) {
                if (error) return end(new SudoPromptError(PERMISSION_DENIED));
                WindowsWaitForStatus(instance, end);
              }
            );
          },
          1000
        );
      } else if (error) {
        end(error);
      } else {
        end();
      }
    }
  );
}

function WindowsWriteCommandScript(instance, end) {
  var cwd = Node.process.cwd();
  if (/"/.test(cwd)) {
    // We expect double quotes to be reserved on Windows.
    // Even so, we test for this and abort if they are present.
    return end(new SudoPromptError('process.cwd() cannot contain double-quotes.'));
  }
  var script = [];
  script.push('@echo off');
  // Set code page to UTF-8:
  script.push('chcp 65001>nul');
  // Preserve current working directory:
  // We pass /d as an option in case the cwd is on another drive (issue 70).
  script.push('cd /d "' + cwd + '"');
  // Export environment variables:
  for (var key in instance.options.env) {
    // "The characters <, >, |, &, ^ are special command shell characters, and
    // they must be preceded by the escape character (^) or enclosed in
    // quotation marks. If you use quotation marks to enclose a string that
    // contains one of the special characters, the quotation marks are set as
    // part of the environment variable value."
    // In other words, Windows assigns everything that follows the equals sign
    // to the value of the variable, whereas Unix systems ignore double quotes.
    var value = instance.options.env[key];
    script.push('set ' + key + '=' + value.replace(/([<>\\|&^])/g, '^$1'));
  }
  script.push(instance.command);
  script = script.join('\r\n');
  Node.fs.writeFile(instance.pathCommand, script, 'utf-8', end);
}

function WindowsWriteElevateScript(instance, end) {
  // We do not use VBScript to elevate since it does not return an error if
  // the user does not grant permission. This is here for reference.
  // var script = [];
  // script.push('Set objShell = CreateObject("Shell.Application")');
  // script.push(
  // 'objShell.ShellExecute "' + instance.pathExecute + '", "", "", "runas", 0'
  // );
  // script = script.join('\r\n');
  // Node.fs.writeFile(instance.pathElevate, script, 'utf-8', end);
}

function WindowsWriteExecuteScript(instance, end) {
  var script = [];
  script.push('@echo off');
  script.push(
    'call "' + instance.pathCommand + '"' +
    ' > "' + instance.pathStdout + '" 2> "' + instance.pathStderr + '"'
  );
  script.push('(echo %ERRORLEVEL%) > "' + instance.pathStatus + '"');
  script = script.join('\r\n');
  Node.fs.writeFile(instance.pathExecute, script, 'utf-8', end);
}

module.exports.exec = Exec;

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
var APPLET = '';

var PERMISSION_DENIED = 'User did not grant permission.';
var NO_POLKIT_AGENT = 'No polkit authentication agent found.';

// See issue 66:
var MAX_BUFFER = 134217728;
