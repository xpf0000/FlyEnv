#!/bin/bash
sudo apt-get install imagemagick

mkdir -p build/icons

if ! command -v convert &> /dev/null
then
    echo "ImageMagick (convert command) 未安装。请先安装 ImageMagick。"
    echo "例如，在 Debian/Ubuntu 上: sudo apt-get install imagemagick"
    echo "在 Fedora/CentOS 上: sudo dnf install ImageMagick"
    exit 1
fi

SOURCE_ICON="static/512x512.png"

if [ ! -f "$SOURCE_ICON" ]; then
    echo "源图标文件 '$SOURCE_ICON' 不存在。请确保文件路径正确。"
    exit 1
fi

echo "正在生成 16x16.png..."
convert "$SOURCE_ICON" -resize 16x16 build/icons/16x16.png

echo "正在生成 16x16@2x.png (32x32)..."
convert "$SOURCE_ICON" -resize 32x32 build/icons/16x16@2x.png

echo "正在生成 32x32.png..."
convert "$SOURCE_ICON" -resize 32x32 build/icons/32x32.png

echo "正在生成 32x32@2x.png (64x64)..."
convert "$SOURCE_ICON" -resize 64x64 build/icons/32x32@2x.png

echo "正在生成 128x128.png..."
convert "$SOURCE_ICON" -resize 128x128 build/icons/128x128.png

echo "正在生成 128x128@2x.png (256x256)..."
convert "$SOURCE_ICON" -resize 256x256 build/icons/128x128@2x.png

echo "正在生成 256x256.png..."
convert "$SOURCE_ICON" -resize 256x256 build/icons/256x256.png

echo "正在生成 256x256@2x.png (512x512)..."
convert "$SOURCE_ICON" -resize 512x512 build/icons/256x256@2x.png

echo "正在生成 512x512.png..."
convert "$SOURCE_ICON" -resize 512x512 build/icons/512x512.png

echo "所有图标已生成到 build/icons 目录。"
