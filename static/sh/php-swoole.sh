#!/bin/bash
cachedir=$1
phpdir=$2
extendV=$3
arch=$4
cd $cachedir
curl -C - -O -s http://pecl.php.net/get/swoole-$extendV.tgz
if [ -d "swoole-$extendV" ]; then
 rm -rf "swoole-$extendV"
fi
if [ -f "swoole-$extendV.tgz" ]; then
  tar -zxf swoole-$extendV.tgz
else
  exit 1
fi
export HOMEBREW_NO_AUTO_UPDATE=1
arch $arch brew install pkg-config autoconf automake libtool
arch $arch brew install openssl
arch $arch brew install pcre2
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
lib=$prefix/opt/openssl
if ! [ -f "$phpdir/include/php/ext/pcre/pcre2.h" ]; then
ln -s $prefix/include/pcre2.h $phpdir/include/php/ext/pcre/pcre2.h
fi
cd "swoole-$extendV"
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config --enable-openssl
make
make install
