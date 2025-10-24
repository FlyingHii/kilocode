import { describe, it, expect, beforeEach, vitest } from "vitest"
import { manageTabsTool } from "../manageTabsTool"
import { ToolUse } from "../../../shared/tools"
import { Task } from "../../task/Task"

describe("manageTabsTool", () => {
	let mockTask: Partial<Task>
	let mockToolUse: ToolUse
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any

	beforeEach(() => {
		// Set up mocks
		mockTask = {
			consecutiveMistakeCount: 0,
			recordToolError: vitest.fn(),
			sayAndCreateMissingParamError: vitest.fn(),
			ask: vitest.fn(),
			cwd: "/test/workspace",
		}

		mockToolUse = {
			type: "tool_use",
			name: "manage_tabs",
			params: {},
			partial: false,
		}

		mockAskApproval = vitest.fn().mockResolvedValue(true)
		mockHandleError = vitest.fn()
		mockPushToolResult = vitest.fn()
		mockRemoveClosingTag = vitest.fn((tag, value) => value || "")
	})

	describe("validation", () => {
		it("should require action parameter", async () => {
			await manageTabsTool(
				mockTask as Task,
				mockToolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("manage_tabs")
		})

		it("should only allow 'open' and 'close' actions", async () => {
			mockToolUse.params.action = "invalid"

			await manageTabsTool(
				mockTask as Task,
				mockToolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("manage_tabs")
		})

		it("should require file/files for open action", async () => {
			mockToolUse.params.action = "open"

			await manageTabsTool(
				mockTask as Task,
				mockToolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockPushToolResult).toHaveBeenCalledWith("manageTabs.errors.openRequiresFile")
		})

		it("should require file for close action", async () => {
			mockToolUse.params.action = "close"

			await manageTabsTool(
				mockTask as Task,
				mockToolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("manage_tabs", "file")
		})
	})

	describe("parseFileWithLine function", () => {
		it("should parse file path without line number", () => {
			const result = parseFileWithLine("src/test.js")
			expect(result).toEqual({ path: "src/test.js" })
		})

		it("should parse file path with line number", () => {
			const result = parseFileWithLine("src/test.js#45")
			expect(result).toEqual({ path: "src/test.js", line: 45 })
		})

		it("should handle multiple hash symbols (use last one)", () => {
			const result = parseFileWithLine("src/file#with#hash.js#100")
			expect(result).toEqual({ path: "src/file#with#hash.js", line: 100 })
		})

		it("should handle invalid line number", () => {
			const result = parseFileWithLine("src/test.js#abc")
			expect(result).toEqual({ path: "src/test.js#abc" })
		})

		it("should handle zero or negative line number", () => {
			const result = parseFileWithLine("src/test.js#0")
			expect(result).toEqual({ path: "src/test.js#0" })
		})

		it("should handle empty hash", () => {
			const result = parseFileWithLine("src/test.js#")
			expect(result).toEqual({ path: "src/test.js#" })
		})
	})

	describe("hash-based line numbers in files parameter", () => {
		it("should handle mixed files with and without line numbers", async () => {
			mockToolUse.params.action = "open"
			mockToolUse.params.files = '["src/test1.js", "src/test2.js#50", "src/test3.js#100"]'

			await manageTabsTool(
				mockTask as Task,
				mockToolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Should complete without errors (actual file operations would need VSCode mocks)
			expect(mockHandleError).not.toHaveBeenCalled()
		})
	})
})

// Import the function from the actual implementation for testing
import { parseFileWithLine } from "../manageTabsTool"
