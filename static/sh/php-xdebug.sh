#!/bin/bash
password=$1
echo "$password" | sudo -S -v
cachedir=$2
phpdir=$3
extendV=$4
cd $cachedir
curl -C - -O -s https://xdebug.org/files/xdebug-$extendV.tgz
if [ ! -f "xdebug-$extendV.tgz" ]; then
  exit 1
fi
cd "$phpdir/bin/"
sudo $phpdir/bin/pecl uninstall xdebug
fileEnv=$(file "$phpdir/bin/php")
echo $fileEnv
if [[ $fileEnv =~ "x86_64" ]]
then
    arch -x86_64 sudo $phpdir/bin/pecl install $cachedir/xdebug-$extendV.tgz
else
    arch -arm64 sudo $phpdir/bin/pecl install $cachedir/xdebug-$extendV.tgz
fi
