#!/usr/bin/bash
# 字符串染色程序
if [[ -t 1 ]]; then
  tty_escape() { printf "\033[%sm" "$1"; }
else
  tty_escape() { :; }
fi
tty_universal() { tty_escape "0;$1"; } #正常显示
tty_blue="$(tty_universal 34)" #蓝色
tty_red="$(tty_universal 31)" #红色
tty_green="$(tty_universal 32)" #绿色
tty_yellow="$(tty_universal 33)" #黄色
tty_bold="$(tty_universal 39)" #加黑
tty_cyan="$(tty_universal 36)" #青色
tty_reset="$(tty_escape 0)" #去除颜色
hasBrew=$(which brew)
if ! [[ "$hasBrew" == "brew not found" ]]; then
    echo -n "${tty_green}
    检测到brew已安装, 安装脚本自动退出${tty_reset}"
    echo "PhpWebStudy-Brew安装结束"
    exit 0
fi

password=$1
echo "$password" | sudo -S -v
echo "
              ${tty_green} 开始执行Brew安装程序 ${tty_reset}
"
#选择一个brew下载源
echo -n "${tty_green}
请选择brew安装脚本
1. brew官方脚本, 从github安装, 无法访问github或github访问慢的不建议选择
2. brew国内安装脚本, 可选brew软件源, brew官方脚本无法安装时可选用 ${tty_reset}"
echo -n "
${tty_blue}请输入序号: "
read MY_DOWN_NUM
echo "${tty_reset}"
case $MY_DOWN_NUM in
"1")
    echo "
    你选择了brew官方脚本
    "
;;
"2")
    echo "
    brew国内安装脚本
    "
;;
*)
  echo "
  brew国内安装脚本
  "
  MY_DOWN_NUM="2"
;;
esac
echo -n "${tty_green}
->是否现在开始执行脚本（N/Y） "
read MY_Del_Old
echo "${tty_reset}"
case $MY_Del_Old in
"y")
echo "--> 脚本开始执行"
;;
"Y")
echo "--> 脚本开始执行"
;;
*)
echo "你输入了 $MY_Del_Old ，安装退出, 如果继续运行脚本应该输入Y或者y
"
echo "PhpWebStudy-Brew安装结束"
exit 0
;;
esac

sudo echo '开始执行'
case $MY_DOWN_NUM in
"1")
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
;;
"2")
  /bin/bash -c "$(curl -fsSL https://gitee.com/cunkai/HomebrewCN/raw/master/Homebrew.sh)"
;;
esac
echo "PhpWebStudy-Brew安装结束"
