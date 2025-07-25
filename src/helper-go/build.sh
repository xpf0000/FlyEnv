#!/bin/zsh
# Create a directory for your builds
mkdir -p ./dist

echo "Building for macOS x64 (AMD64)..."
GOOS=darwin GOARCH=amd64 go build -o ./dist/flyenv-helper-darwin-amd64 ./main.go

echo "Building for macOS ARM (ARM64)..."
GOOS=darwin GOARCH=arm64 go build -o ./dist/flyenv-helper-darwin-arm64 ./main.go

echo "Building for Linux x64 (AMD64)..."
GOOS=linux GOARCH=amd64 go build -o ./dist/flyenv-helper-linux-amd64 ./main.go

echo "Building for Linux ARM (ARM64)..."
GOOS=linux GOARCH=arm64 go build -o ./dist/flyenv-helper-linux-arm64 ./main.go

echo "All builds complete!"
ls -lh ./dist/
