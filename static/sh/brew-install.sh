#!/bin/zsh
# String coloring program
if [[ -t 1 ]]; then
  tty_escape() { printf "\033[%sm" "$1"; }
else
  tty_escape() { :; }
fi
tty_universal() { tty_escape "0;$1"; } # Normal display
tty_blue="$(tty_universal 34)" # Blue
tty_red="$(tty_universal 31)" # Red
tty_green="$(tty_universal 32)" # Green
tty_yellow="$(tty_universal 33)" # Yellow
tty_bold="$(tty_universal 39)" # Bold
tty_cyan="$(tty_universal 36)" # Cyan
tty_reset="$(tty_escape 0)" # Remove color
hasBrew=$(which brew)
if ! [[ "$hasBrew" == "brew not found" ]]; then
    echo -n "${tty_green}
    Detected that brew is already installed, the installation script will exit automatically${tty_reset}"
    echo "FlyEnv-Homebrew installation finished"
    exit 0
fi

echo "
              ${tty_green} Starting Homebrew installation program ${tty_reset}
"
# Choose a brew download source
echo -n "${tty_green}
Please select a brew installation script
1. Official brew script, installs from GitHub, not recommended if GitHub is inaccessible or slow
2. Domestic brew installation script, allows selecting a brew software source, can be used if the official script fails ${tty_reset}"
echo -n "
${tty_blue}Enter the number: "
read MY_DOWN_NUM
echo "${tty_reset}"
case $MY_DOWN_NUM in
"1")
    echo "
    You selected the official brew script
    "
;;
"2")
    echo "
    Domestic brew installation script
    "
;;
*)
  echo "
  Domestic brew installation script
  "
  MY_DOWN_NUM="2"
;;
esac
echo -n "${tty_green}
-> Start executing the script now? (N/Y) "
read MY_Del_Old
echo "${tty_reset}"
case $MY_Del_Old in
"y")
echo "--> Script execution started"
;;
"Y")
echo "--> Script execution started"
;;
*)
echo "You entered $MY_Del_Old, installation exited. To continue running the script, you should enter Y or y
"
echo "FlyEnv-Homebrew installation finished"
exit 0
;;
esac

sudo echo 'Starting execution'
case $MY_DOWN_NUM in
"1")
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
;;
"2")
  /bin/zsh -c "$(curl -fsSL https://gitee.com/cunkai/HomebrewCN/raw/master/Homebrew.sh)"
;;
esac
echo "FlyEnv-Homebrew installation finished"
