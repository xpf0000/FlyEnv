#!/bin/zsh
srcFlag=$1
brewHome=$2
case $srcFlag in
"default")
    echo "
    You have selected the default source
    "
    # HomeBrew base framework
    USER_BREW_GIT=https://github.com/Homebrew/brew.git
    # HomeBrew Core
    USER_CORE_GIT=https://github.com/Homebrew/homebrew-core.git
    # HomeBrew Cask
    USER_CASK_GIT=https://github.com/Homebrew/homebrew-cask.git
;;
"tsinghua")
    echo "
    You have selected Tsinghua University domestic source
    "
    USER_HOMEBREW_BOTTLE_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/
    # HomeBrew base framework
    USER_BREW_GIT=https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/brew.git
    # HomeBrew Core
    USER_CORE_GIT=https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/homebrew-core.git
    # HomeBrew Cask
    USER_CASK_GIT=https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/homebrew-cask.git
    HOMEBREW_API_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api
    HOMEBREW_PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple/
;;
"bfsu")
    echo "
    Beijing Foreign Studies University brew source
    "
    USER_HOMEBREW_BOTTLE_DOMAIN=https://mirrors.bfsu.edu.cn/homebrew-bottles
    # HomeBrew base framework
    USER_BREW_GIT=https://mirrors.bfsu.edu.cn/git/homebrew/brew.git
    # HomeBrew Core
    USER_CORE_GIT=https://mirrors.bfsu.edu.cn/git/homebrew/homebrew-core.git
    # HomeBrew Cask
    USER_CASK_GIT=https://mirrors.bfsu.edu.cn/git/homebrew/homebrew-cask.git
    HOMEBREW_API_DOMAIN=https://mirrors.bfsu.edu.cn/homebrew-bottles/api
    HOMEBREW_PIP_INDEX_URL=https://mirrors.bfsu.edu.cn/pypi/web/simple/
;;
"tencent")
    echo "
    You have selected Tencent brew source
    "
    USER_HOMEBREW_BOTTLE_DOMAIN=https://mirrors.cloud.tencent.com/homebrew-bottles
    # HomeBrew base framework
    USER_BREW_GIT=https://mirrors.cloud.tencent.com/homebrew/brew.git
    # HomeBrew Core
    USER_CORE_GIT=https://mirrors.cloud.tencent.com/homebrew/homebrew-core.git
    # HomeBrew Cask
    USER_CASK_GIT=https://mirrors.cloud.tencent.com/homebrew/homebrew-cask.git
    HOMEBREW_API_DOMAIN=https://mirrors.cloud.tencent.com/homebrew-bottles/api
    HOMEBREW_PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple/
;;
"aliyun")
    echo "
    You have selected Alibaba brew source
    "
    USER_HOMEBREW_BOTTLE_DOMAIN=https://mirrors.aliyun.com/homebrew/homebrew-bottles
    # HomeBrew base framework
    USER_BREW_GIT=https://mirrors.aliyun.com/homebrew/brew.git
    # HomeBrew Core
    USER_CORE_GIT=https://mirrors.aliyun.com/homebrew/homebrew-core.git
    # HomeBrew Cask
    USER_CASK_GIT=https://mirrors.aliyun.com/homebrew/homebrew-cask.git
    HOMEBREW_API_DOMAIN=https://mirrors.aliyun.com/homebrew-bottles/api
    HOMEBREW_PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
;;
"ustc")
    echo "
    You have selected University of Science and Technology of China brew source
    "
    # HomeBrew download source install
    USER_HOMEBREW_BOTTLE_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles
    # HomeBrew base framework
    USER_BREW_GIT=https://mirrors.ustc.edu.cn/brew.git
    # HomeBrew Core
    USER_CORE_GIT=https://mirrors.ustc.edu.cn/homebrew-core.git
    # HomeBrew Cask
    USER_CASK_GIT=https://mirrors.ustc.edu.cn/homebrew-cask.git
    HOMEBREW_API_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles/api
    HOMEBREW_PIP_INDEX_URL=https://mirrors.bfsu.edu.cn/pypi/web/simple/
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

sed -i "" '/export HOMEBREW_API_DOMAIN/d' ~/.zshrc
sed -i "" '/export HOMEBREW_API_DOMAIN/d' ~/.bash_profile
if [ $srcFlag != "default" ]; then
  echo "export HOMEBREW_API_DOMAIN=$HOMEBREW_API_DOMAIN" >> ~/.zshrc
  source ~/.zshrc
  echo "export HOMEBREW_API_DOMAIN=$HOMEBREW_API_DOMAIN" >> ~/.bash_profile
  source ~/.bash_profile
fi

sed -i "" '/export HOMEBREW_PIP_INDEX_URL/d' ~/.zshrc
sed -i "" '/export HOMEBREW_PIP_INDEX_URL/d' ~/.bash_profile
if [ $srcFlag != "default" ]; then
  echo "export HOMEBREW_PIP_INDEX_URL=$HOMEBREW_PIP_INDEX_URL" >> ~/.zshrc
  source ~/.zshrc
  echo "export HOMEBREW_PIP_INDEX_URL=$HOMEBREW_PIP_INDEX_URL" >> ~/.bash_profile
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

source ~/.bash_profile
source ~/.zshrc
echo "Brew source updated successfully"
