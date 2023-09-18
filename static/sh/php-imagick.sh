#!/bin/bash
cachedir=$1
phpdir=$2
extendv=$3
arch=$4
cd $cachedir
curl -C - -O -L -s http://pecl.php.net/get/imagick-$extendv.tgz
if [ -d "imagick-$extendv" ]; then
 rm -rf "imagick-$extendv"
fi
if [ -f "imagick-$extendv.tgz" ]; then
  tar -zxf imagick-$extendv.tgz
else
  exit 1
fi
export HOMEBREW_NO_AUTO_UPDATE=1
arch $arch brew install pkg-config autoconf automake libtool
arch $arch brew install ImageMagick
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
lib=$prefix/opt/imagemagick
cd "imagick-$extendv"
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config --with-imagick=$lib
make
make install
