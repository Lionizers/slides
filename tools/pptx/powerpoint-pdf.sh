#!/bin/sh
# Opens a .pptx in Microsoft PowerPoint (Mac) and saves it as PDF, for checks in the real thing.
# Usage: tools/powerpoint-pdf.sh in.pptx out.pdf
# PowerPoint is sandboxed: the files go through its container folder, so no access dialog appears.
set -e
BOX="$HOME/Library/Containers/com.microsoft.Powerpoint/Data/Documents/lz-check"
mkdir -p "$BOX"
NAME=$(basename "$1" .pptx)
cp "$1" "$BOX/$NAME.pptx"
rm -f "$BOX/$NAME.pdf"
osascript <<OSA
tell application "Microsoft PowerPoint"
  open POSIX file "$BOX/$NAME.pptx"
  set p to active presentation
  save p in POSIX file "$BOX/$NAME.pdf" as save as PDF
  close p saving no
end tell
OSA
cp "$BOX/$NAME.pdf" "$2"
echo "$2"
