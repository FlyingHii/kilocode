/**
 * Checkpoint selection state atoms
 *
 * These atoms manage the state for the double-ESC checkpoint selection feature.
 * The feature allows users to press ESC twice quickly to open a checkpoint selection menu,
 * then choose a restore type (both, conversation only, or code only).
 */

import { atom } from "jotai"
import { chatMessagesAtom } from "./extension.js"
import type { ExtensionMessage } from "../../types/messages.js"

// ============================================================================
// Types
// ============================================================================

/**
 * Checkpoint information extracted from chat messages
 */
export interface CheckpointInfo {
	/** Timestamp of the checkpoint message */
	ts: number
	/** Git commit hash */
	commitHash: string
	/** Whether this was an auto-saved checkpoint */
	isAutoSaved: boolean
	/** Human-readable relative time (e.g., "5 minutes ago") */
	relativeTime: string
	/** The user message that preceded this checkpoint (truncated for display) */
	userMessagePreview: string | null
}

/**
 * Restore type options
 */
export type RestoreType = "both" | "conversation" | "code"

/**
 * Restore type option for the menu
 */
export interface RestoreTypeOption {
	value: RestoreType
	label: string
	description: string
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Time window for double-ESC detection (in milliseconds)
 * User must press ESC twice within this window to trigger checkpoint selection
 */
export const DOUBLE_ESC_WINDOW_MS = 500

/**
 * Available restore type options
 */
export const RESTORE_TYPE_OPTIONS: RestoreTypeOption[] = [
	{
		value: "both",
		label: "Restore Both",
		description: "Restore conversation and code to this checkpoint",
	},
	{
		value: "conversation",
		label: "Conversation Only",
		description: "Restore conversation history only (keep current code)",
	},
	{
		value: "code",
		label: "Code Only",
		description: "Restore code only (keep current conversation)",
	},
]

// ============================================================================
// Core State Atoms
// ============================================================================

/**
 * Whether checkpoint selection mode is active
 */
export const checkpointSelectionModeAtom = atom<boolean>(false)

/**
 * Whether restore type selection mode is active (after selecting a checkpoint)
 */
export const restoreTypeSelectionModeAtom = atom<boolean>(false)

/**
 * Currently selected checkpoint index in the checkpoint list
 */
export const selectedCheckpointIndexAtom = atom<number>(0)

/**
 * Currently selected restore type index
 */
export const selectedRestoreTypeIndexAtom = atom<number>(0)

/**
 * The checkpoint that was selected (stored when moving to restore type selection)
 */
export const selectedCheckpointAtom = atom<CheckpointInfo | null>(null)

/**
 * Timestamp of the last ESC press (for double-ESC detection)
 */
export const lastEscPressTimeAtom = atom<number>(0)

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format timestamp to human-readable relative time
 */
function formatRelativeTime(ts: number): string {
	const now = Date.now()
	const diffMs = now - ts
	const diffMins = Math.floor(diffMs / (1000 * 60))
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

	if (diffMins < 1) {
		return "just now"
	}
	if (diffMins < 60) {
		return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`
	}
	if (diffHours < 24) {
		return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
	}
	if (diffDays < 7) {
		return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
	}

	// For older checkpoints, show absolute date
	const date = new Date(ts)
	return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

/**
 * Truncate text to a maximum length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text
	}
	return text.slice(0, maxLength - 3) + "..."
}

/**
 * Find the most recent user message before a given timestamp
 */
function findPrecedingUserMessage(messages: ExtensionMessage[], beforeTs: number): string | null {
	// Iterate backwards through messages to find the most recent user_feedback before the checkpoint
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i]
		if (!msg) continue

		const msgTs = msg.ts as number
		// Only consider messages before the checkpoint
		if (msgTs >= beforeTs) continue

		// Look for user_feedback messages (these are user messages)
		if (msg.type === "say" && msg.say === "user_feedback" && msg.text) {
			return truncateText(msg.text.trim(), 50)
		}
	}
	return null
}

/**
 * Extract checkpoint info from a chat message
 */
function extractCheckpointInfo(msg: ExtensionMessage, allMessages: ExtensionMessage[]): CheckpointInfo | null {
	if (msg.type !== "say" || msg.say !== "checkpoint_saved" || !msg.text) {
		return null
	}

	// Type guard for metadata with suppressMessage
	const metadata = msg.metadata as { suppressMessage?: boolean } | undefined
	const ts = msg.ts as number

	return {
		ts,
		commitHash: msg.text,
		isAutoSaved: metadata?.suppressMessage === true,
		relativeTime: formatRelativeTime(ts),
		userMessagePreview: findPrecedingUserMessage(allMessages, ts),
	}
}

// ============================================================================
// Derived Atoms
// ============================================================================

/**
 * List of available checkpoints extracted from chat messages
 * Sorted by timestamp (most recent first)
 */
export const checkpointListAtom = atom<CheckpointInfo[]>((get) => {
	const messages = get(chatMessagesAtom)
	const allMessages = messages as ExtensionMessage[]

	const checkpoints: CheckpointInfo[] = []
	for (const msg of messages) {
		// Cast to ExtensionMessage for type compatibility
		const info = extractCheckpointInfo(msg as ExtensionMessage, allMessages)
		if (info) {
			checkpoints.push(info)
		}
	}

	// Sort by timestamp descending (most recent first)
	return checkpoints.sort((a, b) => b.ts - a.ts)
})

/**
 * Whether there are any checkpoints available
 */
export const hasCheckpointsAtom = atom<boolean>((get) => {
	return get(checkpointListAtom).length > 0
})

/**
 * Number of available checkpoints
 */
export const checkpointCountAtom = atom<number>((get) => {
	return get(checkpointListAtom).length
})

/**
 * Currently selected checkpoint (based on index)
 */
export const currentSelectedCheckpointAtom = atom<CheckpointInfo | null>((get) => {
	const checkpoints = get(checkpointListAtom)
	const index = get(selectedCheckpointIndexAtom)

	if (index < 0 || index >= checkpoints.length) {
		return null
	}

	return checkpoints[index] ?? null
})

/**
 * Currently selected restore type option (based on index)
 */
export const currentSelectedRestoreTypeAtom = atom<RestoreTypeOption | null>((get) => {
	const index = get(selectedRestoreTypeIndexAtom)

	if (index < 0 || index >= RESTORE_TYPE_OPTIONS.length) {
		return null
	}

	return RESTORE_TYPE_OPTIONS[index] ?? null
})

// ============================================================================
// Action Atoms
// ============================================================================

/**
 * Enter checkpoint selection mode
 */
export const enterCheckpointSelectionModeAtom = atom(null, (get, set) => {
	const hasCheckpoints = get(hasCheckpointsAtom)

	if (!hasCheckpoints) {
		// No checkpoints available, don't enter selection mode
		return false
	}

	set(checkpointSelectionModeAtom, true)
	set(restoreTypeSelectionModeAtom, false)
	set(selectedCheckpointIndexAtom, 0)
	set(selectedCheckpointAtom, null)

	return true
})

/**
 * Exit checkpoint selection mode (cancel)
 */
export const exitCheckpointSelectionModeAtom = atom(null, (_get, set) => {
	set(checkpointSelectionModeAtom, false)
	set(restoreTypeSelectionModeAtom, false)
	set(selectedCheckpointIndexAtom, 0)
	set(selectedRestoreTypeIndexAtom, 0)
	set(selectedCheckpointAtom, null)
})

/**
 * Move to restore type selection after selecting a checkpoint
 */
export const confirmCheckpointSelectionAtom = atom(null, (get, set) => {
	const checkpoint = get(currentSelectedCheckpointAtom)

	if (!checkpoint) {
		return false
	}

	set(selectedCheckpointAtom, checkpoint)
	set(checkpointSelectionModeAtom, false)
	set(restoreTypeSelectionModeAtom, true)
	set(selectedRestoreTypeIndexAtom, 0)

	return true
})

/**
 * Go back from restore type selection to checkpoint selection
 */
export const backToCheckpointSelectionAtom = atom(null, (_get, set) => {
	set(restoreTypeSelectionModeAtom, false)
	set(checkpointSelectionModeAtom, true)
	set(selectedRestoreTypeIndexAtom, 0)
})

/**
 * Navigate up in checkpoint list
 */
export const navigateCheckpointUpAtom = atom(null, (get, set) => {
	const count = get(checkpointCountAtom)
	if (count === 0) return

	const currentIndex = get(selectedCheckpointIndexAtom)
	const newIndex = currentIndex === 0 ? count - 1 : currentIndex - 1
	set(selectedCheckpointIndexAtom, newIndex)
})

/**
 * Navigate down in checkpoint list
 */
export const navigateCheckpointDownAtom = atom(null, (get, set) => {
	const count = get(checkpointCountAtom)
	if (count === 0) return

	const currentIndex = get(selectedCheckpointIndexAtom)
	const newIndex = (currentIndex + 1) % count
	set(selectedCheckpointIndexAtom, newIndex)
})

/**
 * Navigate up in restore type list
 */
export const navigateRestoreTypeUpAtom = atom(null, (get, set) => {
	const count = RESTORE_TYPE_OPTIONS.length
	const currentIndex = get(selectedRestoreTypeIndexAtom)
	const newIndex = currentIndex === 0 ? count - 1 : currentIndex - 1
	set(selectedRestoreTypeIndexAtom, newIndex)
})

/**
 * Navigate down in restore type list
 */
export const navigateRestoreTypeDownAtom = atom(null, (get, set) => {
	const count = RESTORE_TYPE_OPTIONS.length
	const currentIndex = get(selectedRestoreTypeIndexAtom)
	const newIndex = (currentIndex + 1) % count
	set(selectedRestoreTypeIndexAtom, newIndex)
})

/**
 * Record an ESC press and check if it's a double-ESC
 * Returns true if this is the second ESC within the time window
 */
export const recordEscPressAtom = atom(null, (get, set): boolean => {
	const now = Date.now()
	const lastPress = get(lastEscPressTimeAtom)
	const timeSinceLastPress = now - lastPress

	set(lastEscPressTimeAtom, now)

	// Check if this is a double-ESC (second press within window)
	return timeSinceLastPress > 0 && timeSinceLastPress <= DOUBLE_ESC_WINDOW_MS
})

/**
 * Reset the ESC press timer (e.g., when entering a mode that should not trigger double-ESC)
 */
export const resetEscPressTimerAtom = atom(null, (_get, set) => {
	set(lastEscPressTimeAtom, 0)
})
