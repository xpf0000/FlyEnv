# --- Configuration ---
BUILD_DIR="./dist"
APP_NAME="flyenv-helper"
MAIN_PACKAGE="./main.go" # Or "." if your main.go is in the current directory and you're building the module

# Define target platforms: GOOS GOARCH GOAMD64_SETTING
# GOAMD64_SETTING is specifically for amd64 builds, empty for others
declare -a TARGETS=(
    "darwin amd64"        # macOS Intel
    "darwin arm64"        # macOS Apple Silicon
    "linux amd64 v1"      # Linux Intel/AMD, v1 for maximum compatibility
    "linux arm64"         # Linux ARM (e.g., Raspberry Pi, newer servers)
)

# --- Build Process ---

echo "--- Starting Go Cross-Compilation for ${APP_NAME} ---"

# 1. Clean previous builds
echo "Cleaning previous builds in ${BUILD_DIR}..."
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}" || { echo "Error: Failed to create build directory ${BUILD_DIR}"; exit 1; }

# 2. Iterate and build for each target
for TARGET in "${TARGETS[@]}"; do
    read -r GOOS_VAL GOARCH_VAL GOAMD64_VAL <<< "$TARGET" # Parse target string

    OUTPUT_FILENAME="${APP_NAME}-${GOOS_VAL}-${GOARCH_VAL}"
    if [[ -n "$GOAMD64_VAL" ]]; then
        OUTPUT_FILENAME="${OUTPUT_FILENAME}-${GOAMD64_VAL}"
    fi
    if [[ "$GOOS_VAL" == "windows" ]]; then # Add .exe extension for Windows
        OUTPUT_FILENAME="${OUTPUT_FILENAME}.exe"
    fi

    echo "Building for ${GOOS_VAL} ${GOARCH_VAL} (GOAMD64=${GOAMD64_VAL:-default})..."

    # Set environment variables for cross-compilation
    # CGO_ENABLED=0 is crucial for static linking and avoiding C dependencies
    # GOAMD64 is only set if it's explicitly defined for the target (e.g., for linux amd64)
    if [[ -n "$GOAMD64_VAL" ]]; then
        GOOS=${GOOS_VAL} GOARCH=${GOARCH_VAL} GOAMD64=${GOAMD64_VAL} CGO_ENABLED=0 go build -o "${BUILD_DIR}/${OUTPUT_FILENAME}" "${MAIN_PACKAGE}" || { echo "Error: Build failed for ${GOOS_VAL}/${GOARCH_VAL}"; exit 1; }
    else
        GOOS=${GOOS_VAL} GOARCH=${GOARCH_VAL} CGO_ENABLED=0 go build -o "${BUILD_DIR}/${OUTPUT_FILENAME}" "${MAIN_PACKAGE}" || { echo "Error: Build failed for ${GOOS_VAL}/${GOARCH_VAL}"; exit 1; }
    fi

    # For macOS binaries, ensure they are executable (usually default, but good practice)
    if [[ "$GOOS_VAL" == "darwin" ]]; then
        chmod +x "${BUILD_DIR}/${OUTPUT_FILENAME}"
    fi

done

echo "--- All builds complete! ---"
ls -lh "${BUILD_DIR}/"

echo "Remember to set execute permissions (chmod +x) on Linux binaries after copying."
