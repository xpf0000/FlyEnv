#!/bin/bash
cachedir=$1
phpdir=$2
extendV=$3
arch=$4
cd $cachedir
echo "Downloading xdebug-$extendV.tgz from https://xdebug.org/files/xdebug-$extendV.tgz"
curl -C - -O -L https://xdebug.org/files/xdebug-$extendV.tgz
if [ ! -f "xdebug-$extendV.tgz" ]; then
  exit 1
fi
echo "Download complete. Now installing..."
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
