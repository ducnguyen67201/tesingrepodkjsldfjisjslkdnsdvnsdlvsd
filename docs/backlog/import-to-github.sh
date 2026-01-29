#!/bin/bash

# Ducsigr - Import Issues to GitHub from JSON
# Prerequisites: gh cli installed and authenticated (gh auth login), jq installed
# Usage: ./import-to-github.sh <tickets.json>

set -e

REPO="Ducsigr/Ducsigr"

# Check if filename argument provided
if [ -z "$1" ]; then
    echo "Usage: ./import-to-github.sh <tickets.json>"
    echo "Example: ./import-to-github.sh nov_29_tickets.json"
    exit 1
fi

JSON_FILE="$1"

# Check if file exists
if [ ! -f "$JSON_FILE" ]; then
    echo "Error: File '$JSON_FILE' not found"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed"
    echo "Install with: brew install jq"
    exit 1
fi

# Check if gh is authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: gh cli not authenticated"
    echo "Run: gh auth login"
    exit 1
fi

echo "Importing issues from: $JSON_FILE"
echo "Target repo: $REPO"
echo ""

# Create labels from JSON
LABEL_COUNT=$(jq '.labels | length' "$JSON_FILE")
if [ "$LABEL_COUNT" -gt 0 ]; then
    echo "Creating $LABEL_COUNT labels..."

    for i in $(seq 0 $((LABEL_COUNT - 1))); do
        NAME=$(jq -r ".labels[$i].name" "$JSON_FILE")
        COLOR=$(jq -r ".labels[$i].color" "$JSON_FILE")
        DESC=$(jq -r ".labels[$i].description" "$JSON_FILE")

        gh label create "$NAME" --color "$COLOR" --description "$DESC" --repo "$REPO" 2>/dev/null || echo "  Label '$NAME' already exists"
    done
    echo "Labels created!"
    echo ""
fi

# Create issues from JSON
ISSUE_COUNT=$(jq '.issues | length' "$JSON_FILE")
echo "Creating $ISSUE_COUNT issues..."
echo ""

for i in $(seq 0 $((ISSUE_COUNT - 1))); do
    TITLE=$(jq -r ".issues[$i].title" "$JSON_FILE")
    BODY=$(jq -r ".issues[$i].body" "$JSON_FILE")
    LABELS=$(jq -r ".issues[$i].labels | join(\",\")" "$JSON_FILE")

    echo "Creating issue: $TITLE"

    if [ -n "$LABELS" ]; then
        gh issue create --title "$TITLE" --body "$BODY" --label "$LABELS" --repo "$REPO"
    else
        gh issue create --title "$TITLE" --body "$BODY" --repo "$REPO"
    fi

    echo ""
done

echo "✅ Done! Created $ISSUE_COUNT issues in GitHub."
echo ""
echo "View issues at: https://github.com/$REPO/issues"
