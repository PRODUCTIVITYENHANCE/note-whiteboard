#!/usr/bin/env python3
"""
Script to split WhiteboardPanel.ts into separate files.
This extracts CSS, HTML template, and JavaScript into separate TypeScript files.
"""

import os
import re

# Read the original file
with open('/Users/panmacbookpro/Desktop/vscodecanva/src/WhiteboardPanel.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the _getHtmlContent method
match = re.search(r'private _getHtmlContent\(\): string \{\s*return `<!DOCTYPE html>', content)
if not match:
    print("Could not find _getHtmlContent start")
    exit(1)

html_start = match.start()

# Find the HTML content end (around line 4936)
html_end_match = re.search(r'</html>`;\s*\}\s*public dispose\(\)', content)
if not html_end_match:
    print("Could not find _getHtmlContent end")
    exit(1)

html_end = html_end_match.start() + len('</html>`;')

# Extract the HTML content
html_block = content[match.start() + len('private _getHtmlContent(): string {\n        return `'):html_end - 2]

# Find CSS (between <style> and </style>)
css_match = re.search(r'<style>(.*?)</style>', html_block, re.DOTALL)
if css_match:
    css_content = css_match.group(1).strip()
else:
    print("Could not find CSS")
    css_content = ""

# Find script content (between <script> and </script>)
script_match = re.search(r'<script>(.*?)</script>', html_block, re.DOTALL)
if script_match:
    script_content = script_match.group(1).strip()
else:
    print("Could not find script")
    script_content = ""

# HTML is the body content (between </head> and <script>)
body_match = re.search(r'</head>\s*<body>(.*?)<script>', html_block, re.DOTALL)
if body_match:
    body_content = body_match.group(1).strip()
else:
    print("Could not find body content")
    body_content = ""

# Create webview directory if not exists
os.makedirs('/Users/panmacbookpro/Desktop/vscodecanva/src/webview', exist_ok=True)

# Write CSS file
with open('/Users/panmacbookpro/Desktop/vscodecanva/src/webview/styles.ts', 'w', encoding='utf-8') as f:
    f.write('// Whiteboard Canvas CSS Styles\n')
    f.write('// Auto-extracted from WhiteboardPanel.ts\n\n')
    f.write('export const whiteboardStyles = `\n')
    f.write(css_content)
    f.write('\n`;\n')

# Write HTML template file
with open('/Users/panmacbookpro/Desktop/vscodecanva/src/webview/template.ts', 'w', encoding='utf-8') as f:
    f.write('// Whiteboard Canvas HTML Template\n')
    f.write('// Auto-extracted from WhiteboardPanel.ts\n\n')
    f.write('export const whiteboardTemplate = `\n')
    f.write(body_content)
    f.write('\n`;\n')

# Write JavaScript file
with open('/Users/panmacbookpro/Desktop/vscodecanva/src/webview/scripts.ts', 'w', encoding='utf-8') as f:
    f.write('// Whiteboard Canvas Frontend JavaScript\n')
    f.write('// Auto-extracted from WhiteboardPanel.ts\n\n')
    f.write('export const whiteboardScripts = `\n')
    f.write(script_content)
    f.write('\n`;\n')

print(f"CSS: {len(css_content)} characters extracted")
print(f"HTML: {len(body_content)} characters extracted")
print(f"JavaScript: {len(script_content)} characters extracted")
print("Files created in src/webview/")
