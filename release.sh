#!/bin/bash

# This script automates the process of packaging, uploading, and publishing
# a new version of the Chrome extension to the Web Store.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
# IMPORTANT: Do NOT commit your secrets to version control.
# It is much safer to load these from environment variables or a local, untracked file.
# For example:
# export CWS_CLIENT_ID="your_client_id"
# export CWS_CLIENT_SECRET="your_client_secret"
# export CWS_REFRESH_TOKEN="your_refresh_token"

# You can get these values by following this guide:
# https://developer.chrome.com/docs/webstore/using_webstore_api/
CLIENT_ID="${CWS_CLIENT_ID}"
CLIENT_SECRET="${CWS_CLIENT_SECRET}"
REFRESH_TOKEN="${CWS_REFRESH_TOKEN}"

# The ID of your extension from the Chrome Web Store developer dashboard.
EXTENSION_ID="gldplpjgfplbokbenglnfjfeaccdpjda" 

# --- Main Script ---

# Create a temporary directory for the build artifacts
# The `trap` command ensures this directory is removed on script exit (even on error)
TEMP_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEMP_DIR"' EXIT

ZIP_FILE="$TEMP_DIR/tabgroup_auto_hide.zip"

echo "Starting new release for the Chrome Web Store..."

# 1. Get the version from the manifest
VERSION=$(grep '"version":' manifest.json | sed 's/.*"version": "\(.*\)",/\1/')
echo "Found version: $VERSION"

# 2. Check for required credentials
if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ] || [ -z "$REFRESH_TOKEN" ]; then
    echo "Error: CWS_CLIENT_ID, CWS_CLIENT_SECRET, and CWS_REFRESH_TOKEN environment variables must be set."
    echo "Please refer to the Chrome Web Store API documentation to get these values."
    exit 1
fi

if [ "$EXTENSION_ID" = "YOUR_EXTENSION_ID_HERE" ]; then
    echo "Error: Please update the EXTENSION_ID in this script with your extension's ID."
    exit 1
fi

# 3. Create a clean zip file for the extension in the temporary directory
echo "Packaging the extension into $ZIP_FILE..."

# This command zips the current directory, excluding development files/directories.
# The `zip` command may need to be installed on your system (e.g., `sudo apt-get install zip`).
zip -r "$ZIP_FILE" . -x "*.git*" "release.sh" "node_modules/*" "*.zip"

# 4. Upload and publish the extension
# This step uses `chrome-webstore-upload-cli`.
# Ensure it's installed with: npm install -g chrome-webstore-upload-cli
echo "Uploading and publishing version $VERSION..."

chrome-webstore-upload upload --source "$ZIP_FILE" --extension-id "$EXTENSION_ID" --client-id "$CLIENT_ID" --client-secret "$CLIENT_SECRET" --refresh-token "$REFRESH_TOKEN"

echo ""
echo "Successfully uploaded version $VERSION. It may take some time to be reviewed and published."
echo "Done."

# The temporary directory will be cleaned up automatically by the 'trap' command.
