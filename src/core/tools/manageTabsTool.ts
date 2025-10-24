import { formatResponse } from "../prompts/responses"
import { Task } from "../task/Task"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import * as vscode from "vscode"
import * as path from "path"
import { t } from "../../i18n"

// kilocode_change start: Add manage_tabs tool
export async function manageTabsTool(
	task: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const action = block.params.action
	const file = block.params.file
	const files = block.params.files

	try {
		if (block.partial) {
			await task.ask("command", removeClosingTag("action", action), block.partial).catch(() => {})
			return
		}

		// MVP Validation
		if (!action || !["open", "close"].includes(action)) {
			task.consecutiveMistakeCount++
			task.recordToolError("manage_tabs")
			pushToolResult(await task.sayAndCreateMissingParamError("manage_tabs", "action"))
			return
		}

		if (action === "open" && !file && !files) {
			task.consecutiveMistakeCount++
			task.recordToolError("manage_tabs")
			pushToolResult(t("kilocode:manageTabs.errors.openRequiresFile"))
			return
		}

		if (action === "close" && !file) {
			task.consecutiveMistakeCount++
			task.recordToolError("manage_tabs")
			pushToolResult(await task.sayAndCreateMissingParamError("manage_tabs", "file"))
			return
		}

		task.consecutiveMistakeCount = 0

		// Handle actions
		switch (action) {
			case "open":
				await handleOpenAction(task, file, files, askApproval, pushToolResult)
				break
			case "close":
				await handleCloseAction(task, file!, pushToolResult)
				break
		}
	} catch (error) {
		await handleError("managing tabs", error)
	}
}

async function handleOpenAction(
	task: Task,
	file: string | undefined,
	files: string | undefined,
	askApproval: AskApproval,
	pushToolResult: PushToolResult,
) {
	let filesToOpen: Array<{ path: string; line?: number }> = []

	if (file) {
		const parsed = parseFileWithLine(file)
		filesToOpen = [parsed]
	} else if (files) {
		try {
			const parsedFiles: string[] = JSON.parse(files)
			filesToOpen = parsedFiles.map(parseFileWithLine)
		} catch (error) {
			pushToolResult(t("kilocode:manageTabs.errors.invalidJsonFiles", { error: error.message }))
			return
		}
	}

	// Get approval for bulk operations (though tool is auto-approved now)
	if (filesToOpen.length > 2) {
		const didApprove = await askApproval(
			"command",
			t("kilocode:manageTabs.success.bulkOpenApproval", {
				count: filesToOpen.length,
				fileList: filesToOpen.map((f) => (f.line ? `${f.path}#${f.line}` : f.path)).join(", "),
			}),
		)
		if (!didApprove) {
			return
		}
	}

	const results: string[] = []
	const errors: string[] = []

	for (const fileInfo of filesToOpen) {
		try {
			const resolvedPath = path.isAbsolute(fileInfo.path) ? fileInfo.path : path.resolve(task.cwd, fileInfo.path)

			// Check if file exists
			await vscode.workspace.fs.stat(vscode.Uri.file(resolvedPath))

			// Open the file
			const document = await vscode.workspace.openTextDocument(vscode.Uri.file(resolvedPath))
			const options: vscode.TextDocumentShowOptions = {
				preview: false,
				preserveFocus: false,
			}

			// Add line selection if specified
			if (fileInfo.line) {
				if (fileInfo.line < 1 || fileInfo.line > document.lineCount) {
					pushToolResult(
						t("kilocode:manageTabs.errors.lineOutOfRange", {
							lineNumber: fileInfo.line,
							filePath: fileInfo.path,
							maxLines: document.lineCount,
						}),
					)
					return
				}
				options.selection = new vscode.Range(fileInfo.line - 1, 0, fileInfo.line - 1, 0)
			}

			await vscode.window.showTextDocument(document, options)
			results.push(
				fileInfo.line
					? t("kilocode:manageTabs.success.openedFileWithLine", {
							filePath: fileInfo.path,
							lineNumber: fileInfo.line,
						})
					: t("kilocode:manageTabs.success.openedFile", { filePath: fileInfo.path }),
			)
		} catch (error) {
			errors.push(t("kilocode:manageTabs.errors.fileNotFound", { filePath: fileInfo.path }))
		}
	}

	const output = [...results, ...errors].join("\n")
	pushToolResult(formatResponse.toolResult(output))
}

export function parseFileWithLine(filePath: string): { path: string; line?: number } {
	const hashIndex = filePath.lastIndexOf("#")
	if (hashIndex === -1) {
		return { path: filePath }
	}

	const pathPart = filePath.substring(0, hashIndex)
	const linePart = filePath.substring(hashIndex + 1)
	const lineNumber = parseInt(linePart)

	if (isNaN(lineNumber) || lineNumber < 1) {
		// If line part is not a valid number, treat the whole thing as a file path
		return { path: filePath }
	}

	return { path: pathPart, line: lineNumber }
}

async function handleCloseAction(task: Task, file: string, pushToolResult: PushToolResult) {
	// Find the tab to close
	const targetTab = vscode.window.tabGroups.all
		.flatMap((group) => group.tabs)
		.find((tab) => {
			if (tab.input instanceof vscode.TabInputText) {
				const tabPath = path.relative(task.cwd, tab.input.uri.fsPath)
				return tabPath === file || tab.label === file
			}
			return false
		})

	if (!targetTab) {
		pushToolResult(t("kilocode:manageTabs.errors.tabNotFound", { filePath: file }))
		return
	}

	try {
		await vscode.window.tabGroups.close(targetTab)
		pushToolResult(formatResponse.toolResult(t("kilocode:manageTabs.success.closedTab", { filePath: file })))
	} catch (error) {
		pushToolResult(`Failed to close tab '${file}': ${error.message}`)
	}
}
// kilocode_change end: Add manage_tabs tool
