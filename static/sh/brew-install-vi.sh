#!/bin/zsh
# 字符串染色程序
if [[ -t 1 ]]; then
  tty_escape() { printf "\033[%sm" "$1"; }
else
  tty_escape() { :; }
fi
tty_universal() { tty_escape "0;$1"; } #正常显示
tty_green="$(tty_universal 32)" #绿色
tty_reset="$(tty_escape 0)" #去除颜色
hasBrew=$(which brew)
if ! [[ "$hasBrew" == "brew not found" ]]; then
    echo -n "${tty_green}
    Phát hiện brew đã được cài đặt và tập lệnh trình cài đặt tự động thoát ra.${tty_reset}"
    echo "Flyenv-end of Homebrew cài đặt"
    exit 0
fi

echo "
              ${tty_green} Bắt đầu trình cài đặt homebrew ${tty_reset}
"
echo -n "${tty_green}
->Có bắt đầu thực thi tập lệnh ngay bây giờ（Y/N） "
read MY_Del_Old
echo "${tty_reset}"
case $MY_Del_Old in
"y")
echo "--> Thực thi tập lệnh bắt đầu"
;;
"Y")
echo "--> Thực thi tập lệnh bắt đầu"
;;
*)
echo "Bạn đã gõ $MY_Del_Old và cài đặt đã thoát ra. Nếu bạn tiếp tục chạy tập lệnh, bạn nên nhập y hoặc y"
echo "Flyenv-end of Homebrew cài đặt"
exit 0
;;
esac

/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
echo "Flyenv-end of Homebrew cài đặt"
