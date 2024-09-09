const { exec, execFile, spawn } = require('child_process')

const cwd = "E:\\Github\\PhpWebStudy-Win 中文\\node_modules\\electron\\PhpWebStudy-Data\\app\\tomcat-10.1.28\\bin"

const cammand = `call version.bat`

const reg = /(Server version: Apache Tomcat\/)(.*?)(\r\n)/g

exec(cammand, {
    cwd
}, (err, stdout, stderr) => {
    console.log('err: ', err)
    console.log('stdout: ', stdout)
    console.log('stderr: ', stderr)
    reg.lastIndex = 0
    const v = reg?.exec(stdout)
    console.log(v)
})

exec(cammand, {
    cwd: "E:\\Github\\PhpWebStudy-Win 中文\\node_modules\\electron\\PhpWebStudy-Data\\app\\tomcat-9.0.93\\bin"
}, (err, stdout, stderr) => {
    console.log('err: ', err)
    console.log('stdout: ', stdout)
    console.log('stderr: ', stderr)
    reg.lastIndex = 0
    const v = reg?.exec(stdout)
    console.log(v)
})