#!/bin/zsh
password=$1
echo "$password" | sudo -S -v
/bin/zsh -c "$(curl -fsSL https://gitee.com/cunkai/HomebrewCN/raw/master/Homebrew.sh)"
