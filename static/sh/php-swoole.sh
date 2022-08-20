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
prefix=$(brew --prefix)
lib=$prefix/opt/openssl
if [ ! -d $lib ]; then
  arch $arch brew install openssl
fi
cd "swoole-$extendV"
cellar=$(brew --Cellar)
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config
make
make install
