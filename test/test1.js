const content = `[[ -e ~/.phpbrew/bashrc ]] && source ~/.phpbrew/bashrc

command -v fnm &> /dev/null && eval "$(fnm env --use-on-cd)"

#export NVM_DIR="/Users/x/.nvm"
#[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"  # This loads nvm
#[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
#PHPWEBSTUDY-PATH-SET-BEGIN#
export PATH="/Users/x/Library/PhpWebStudy/env/maven:/Users/x/Library/PhpWebStudy/env/php:$PATH"
set -gx PATH /Users/x/Library/PhpWebStudy/env/maven /Users/x/Library/PhpWebStudy/env/php $PATH
export JAVA_HOME="/opt/homebrew/Cellar/openjdk/23.0.1/libexec/openjdk.jdk/Contents/Home"
___MY_VMOPTIONS_SHELL_FILE="\${HOME}/.jetbrains.vmoptions.sh"; if [ -f "\${___MY_VMOPTIONS_SHELL_FILE}" ]; then . "\${___MY_VMOPTIONS_SHELL_FILE}"; fi
`
const appDir = `/Users/x/Library/PhpWebStudy`
// const regex = new RegExp(
//   `^(?!\\s*#)\\s*export\\s*PATH\\s*=\\s*"?(.*?)(${appDir})(.*?)\\$PATH"?`,
//   'gmu'
// )
// const regex = new RegExp(`^(?!\\s*#)\\s*set\\s*-gx\\s*PATH\\s*(.*?)(${appDir})(.*?)\\$PATH`, 'gmu')
const regex = new RegExp(`^(?!\\s*#)\\s*export\\s*JAVA_HOME\\s*=\\s*"(.*?)"`, 'gmu')
let m
while ((m = regex.exec(content)) !== null) {
  if (m && m.length > 0) {
    console.log(m)
  }
}

regex.lastIndex = 0
console.log(regex.test(content))
regex.lastIndex = 0
console.log(content.match(regex))
