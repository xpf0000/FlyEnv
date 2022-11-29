#!/bin/zsh
srcFlag=$1
brewHome=$2
case $srcFlag in
"default")
echo "
    你选择了默认源
    "
    #HomeBrew基础框架
    USER_BREW_GIT=https://github.com/Homebrew/brew.git
    #HomeBrew Core
    USER_CORE_GIT=https://github.com/Homebrew/homebrew-core.git
    #HomeBrew Cask
    USER_CASK_GIT=https://github.com/Homebrew/homebrew-cask.git
;;
"tsinghua")
echo "
    你选择了清华大学国内源
    "
       USER_HOMEBREW_BOTTLE_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/
       #HomeBrew基础框架
       USER_BREW_GIT=https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/brew.git
       #HomeBrew Core
       USER_CORE_GIT=https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/homebrew-core.git
       #HomeBrew Cask
       USER_CASK_GIT=https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/homebrew-cask.git
;;
"bfsu")
    echo "
    北京外国语大学brew本体下载源
    "
    USER_HOMEBREW_BOTTLE_DOMAIN=https://mirrors.bfsu.edu.cn/homebrew-bottles
    #HomeBrew基础框架
    USER_BREW_GIT=https://mirrors.bfsu.edu.cn/git/homebrew/brew.git
    #HomeBrew Core
    USER_CORE_GIT=https://mirrors.bfsu.edu.cn/git/homebrew/homebrew-core.git
    #HomeBrew Cask
    USER_CASK_GIT=https://mirrors.bfsu.edu.cn/git/homebrew/homebrew-cask.git
;;
"tencent")
    echo "
    你选择了腾讯brew本体下载源
    "
    USER_HOMEBREW_BOTTLE_DOMAIN=https://mirrors.cloud.tencent.com/homebrew-bottles
    #HomeBrew基础框架
    USER_BREW_GIT=https://mirrors.cloud.tencent.com/homebrew/brew.git
    #HomeBrew Core
    USER_CORE_GIT=https://mirrors.cloud.tencent.com/homebrew/homebrew-core.git
    #HomeBrew Cask
    USER_CASK_GIT=https://mirrors.cloud.tencent.com/homebrew/homebrew-cask.git
;;
"aliyun")
    echo "
    你选择了阿里巴巴brew本体下载源
    "
    USER_HOMEBREW_BOTTLE_DOMAIN=https://mirrors.aliyun.com/homebrew/homebrew-bottles
    #HomeBrew基础框架
    USER_BREW_GIT=https://mirrors.aliyun.com/homebrew/brew.git
    #HomeBrew Core
    USER_CORE_GIT=https://mirrors.aliyun.com/homebrew/homebrew-core.git
    #HomeBrew Cask
    USER_CASK_GIT=https://mirrors.aliyun.com/homebrew/homebrew-cask.git
;;
"ustc")
  echo "
  你选择了中国科学技术大学brew本体下载源
  "
  #HomeBrew 下载源 install
  USER_HOMEBREW_BOTTLE_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles
  #HomeBrew基础框架
  USER_BREW_GIT=https://mirrors.ustc.edu.cn/brew.git
  #HomeBrew Core
  USER_CORE_GIT=https://mirrors.ustc.edu.cn/homebrew-core.git
  #HomeBrew Cask
  USER_CASK_GIT=https://mirrors.ustc.edu.cn/homebrew-cask.git
;;
esac
sed -i "" '/export HOMEBREW_BOTTLE_DOMAIN/d' ~/.zshrc
sed -i "" '/export HOMEBREW_BOTTLE_DOMAIN/d' ~/.bash_profile
if [ $srcFlag != "default" ]; then
  echo "export HOMEBREW_BOTTLE_DOMAIN=$USER_HOMEBREW_BOTTLE_DOMAIN" >> ~/.zshrc
  source ~/.zshrc
  echo "export HOMEBREW_BOTTLE_DOMAIN=$USER_HOMEBREW_BOTTLE_DOMAIN" >> ~/.bash_profile
  source ~/.bash_profile
fi

if cd "$brewHome"; then
 git remote set-url origin $USER_BREW_GIT
fi

if cd "$brewHome/Library/Taps/homebrew/homebrew-core"; then
 git remote set-url origin $USER_CORE_GIT
fi

if cd "$brewHome/Library/Taps/homebrew/homebrew-cask"; then
 git remote set-url origin $USER_CASK_GIT
fi

echo "brew源更新成功"
