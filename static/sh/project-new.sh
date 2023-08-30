#!/bin/bash
cachedir=$1
projectdir=$2
frameworkname=$3
version=$4
if ! command -v composer &> /dev/null; then
    #command does not exist
    echo "composer does not exist"
    cd "$cachedir" || exit 1
    if [ -f "composer.phar" ]; then
      chmod 777 composer.phar
      ./composer.phar self-update
    else
      curl -sS https://getcomposer.org/installer | php
      chmod 777 composer.phar
    fi

    if [ ! -f "composer.phar" ]; then
      exit 1
    fi

    cd "$projectdir" || exit 1
    "$cachedir"/composer.phar create-project --prefer-dist "$frameworkname" "phpwebstudy-create-project" "$version"
else
    #command exists
    echo "composer exist"
    cd "$projectdir" || exit 1
    composer create-project --prefer-dist "$frameworkname" "phpwebstudy-create-project" "$version"
fi

cd phpwebstudy-create-project || exit 1
mv ./* ../
cd ../
rm -rf phpwebstudy-create-project
