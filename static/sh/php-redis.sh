#!/bin/bash
cachedir=$1
phpdir=$2
redisv=$3
arch=$4
cd $cachedir
echo "downloading redis-$redisv.tgz from http://pecl.php.net/get/redis-$redisv.tgz"
curl -C - -O -L http://pecl.php.net/get/redis-$redisv.tgz
if [ -d "redis-$redisv" ]; then
 rm -rf "redis-$redisv"
fi
if [ -f "redis-$redisv.tgz" ]; then
  tar -zxf redis-$redisv.tgz
else
  exit 1
fi
echo "download success. start install"
export HOMEBREW_NO_AUTO_UPDATE=1
brew install pkg-config autoconf automake libtool
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
cd "redis-$redisv"
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config
make
make install
