import { ToolArgs } from "./types"

export function getManageTabsDescription(args: ToolArgs): string | undefined {
	return `## manage_tabs
Description: Request to manage VSCode editor tabs. This tool allows you to open files in tabs or close specific tabs.

Parameters:
- action: (required) The tab operation to perform. Options:
  - "open" - Open file(s) in new tabs, optionally at a specific line
  - "close" - Close a specific tab by file path
- file: (optional) Single file path for individual operations (required for close, optional for open). Supports hash notation for line numbers: "file.js#45"
- files: (optional) JSON array of file paths for bulk open operations ["file1.js", "file2.ts"]. Each file can optionally include line numbers using hash notation: ["file1.js#10", "file2.ts#25"]

Usage Examples:

Open single file:
<manage_tabs>
<action>open</action>
<file>src/components/Header.tsx</file>
</manage_tabs>

Open file at specific line (using hash notation):
<manage_tabs>
<action>open</action>
<file>src/utils/helpers.ts#45</file>
</manage_tabs>

Open multiple files with line numbers:
<manage_tabs>
<action>open</action>
<files>["src/App.tsx#50", "src/types.ts#190", "package.json#3"]</files>
</manage_tabs>

Open multiple files (mixed with and without line numbers):
<manage_tabs>
<action>open</action>
<files>["src/App.tsx", "src/types.ts#100", "package.json"]</files>
</manage_tabs>

Close specific tab:
<manage_tabs>
<action>close</action>
<file>src/temp.js</file>
</manage_tabs>`
}
