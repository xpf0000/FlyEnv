#!/bin/bash
cachedir=$1
phpdir=$2
extendv=$3
arch=$4
cd $cachedir
curl -C - -O -s http://pecl.php.net/get/imagick-$extendv.tgz
if [ -d "imagick-$extendv" ]; then
 rm -rf "imagick-$extendv"
fi
if [ -f "imagick-$extendv.tgz" ]; then
  tar -zxf imagick-$extendv.tgz
else
  exit 1
fi
prefix=$(brew --prefix)
lib=$prefix/opt/imagemagick
if [ ! -d $lib ]; then
  arch $arch brew install ImageMagick
fi
cd "imagick-$extendv"
cellar=$(brew --Cellar)
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config --with-imagick=$lib
make
make install
