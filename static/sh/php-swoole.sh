#!/bin/bash
cachedir=$1
phpdir=$2
extendV=$3
arch=$4
cd $cachedir
echo "downloading swoole-$extendV.tgz from http://pecl.php.net/get/swoole-$extendV.tgz"
curl -C - -O -L http://pecl.php.net/get/swoole-$extendV.tgz
if [ -d "swoole-$extendV" ]; then
 rm -rf "swoole-$extendV"
fi
if [ -f "swoole-$extendV.tgz" ]; then
  tar -zxf swoole-$extendV.tgz
else
  exit 1
fi
echo "download success. start install"
export HOMEBREW_NO_AUTO_UPDATE=1
brew install pkg-config autoconf automake libtool
brew install openssl
brew install pcre2
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
lib=$prefix/opt/openssl
if ! [ -f "$phpdir/include/php/ext/pcre/pcre2.h" ]; then
ln -s $prefix/include/pcre2.h $phpdir/include/php/ext/pcre/pcre2.h
fi
cd "swoole-$extendV"
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config --enable-openssl --with-openssl-dir=$lib
make
make install
