#!/bin/bash
FILE="src/index.js"

echo "🔍 ببحث عن أي نصوص عربية جوه $FILE فيها احتمال مشكلة مع علامات التنصيص..."
grep -nE "[\"'].*[اأإآء-ي]+.*$" $FILE | while read -r line ; do
    echo "⚠️ احتمال خطأ عند: $line"
done
