# Feature Plan: Double-ESC Checkpoint Selection & Restore

## Overview

This document outlines the implementation plan for a new CLI feature that allows users to press double-ESC (ESC-ESC) to open a selection menu of previous checkpoints. Once a checkpoint is selected, users can choose to restore:

- **Conversation + Code** (both)
- **Just the Conversation** (conversation only)
- **Just the Code** (code only)

## Feasibility Assessment

**Verdict: ✅ Feasible with moderate complexity**

The existing codebase provides solid foundations for this feature:

1. Checkpoint data is already stored in chat messages (`say: "checkpoint_saved"`)
2. The keyboard handler has a timing-based double-press pattern (exit confirmation)
3. Menu components exist for selection UIs (ApprovalMenu, FollowupSuggestionsMenu)
4. The checkpoint restore function can be modified to support partial restores

## Technical Analysis

### Existing Infrastructure

#### 1. Checkpoint Storage

Checkpoints are stored as messages in `chatMessages` with:

```typescript
{
  type: "say",
  say: "checkpoint_saved",
  text: "<commit-hash>",  // 40-character git hash
  ts: number,             // timestamp
  metadata?: {
    suppressMessage?: boolean
  }
}
```

#### 2. Keyboard Handler Architecture

Located in [`cli/src/state/atoms/keyboard.ts`](../src/state/atoms/keyboard.ts):

- Mode-based routing: `approval`, `followup`, `autocomplete`, `history`, `shell`, `normal`
- Exit confirmation pattern uses timing-based double-press detection (~2000ms window)
- Global hotkeys handled before mode-specific handlers

#### 3. Checkpoint Restore Function

Located in [`src/core/checkpoints/index.ts`](../../src/core/checkpoints/index.ts:255-321):

```typescript
export async function checkpointRestore(task: Task, { ts, commitHash, mode, operation }: CheckpointRestoreOptions) {
	// Git restore (code)
	await service.restoreCheckpoint(commitHash)

	// Conversation rewind
	if (mode === "restore") {
		await task.messageManager.rewindToTimestamp(ts, { includeTargetMessage: operation === "edit" })
	}
}
```

**Key insight**: Code and conversation restoration are currently coupled but can be separated.

#### 4. Existing Menu Components

- [`ApprovalMenu.tsx`](../src/ui/components/ApprovalMenu.tsx) - Approval options with keyboard navigation
- [`FollowupSuggestionsMenu.tsx`](../src/ui/components/FollowupSuggestionsMenu.tsx) - Suggestion selection with arrow keys

## Implementation Plan

### Phase 1: Double-ESC Detection

**File**: `cli/src/state/atoms/keyboard.ts`

Add timing-based double-ESC detection similar to exit confirmation:

```typescript
// New constants
const CHECKPOINT_SELECTION_WINDOW_MS = 500 // Shorter window for double-tap

// New atoms
export const checkpointSelectionModeAtom = atom<boolean>(false)
export const lastEscPressTimeAtom = atom<number>(0)
export const checkpointListAtom = atom<CheckpointMessage[]>([])
export const selectedCheckpointIndexAtom = atom<number>(0)
export const restoreTypeSelectionModeAtom = atom<boolean>(false)
export const selectedRestoreTypeIndexAtom = atom<number>(0)

// Double-ESC trigger atom
export const triggerCheckpointSelectionAtom = atom(null, (get, set) => {
	const now = Date.now()
	const lastPress = get(lastEscPressTimeAtom)

	if (now - lastPress < CHECKPOINT_SELECTION_WINDOW_MS) {
		// Double-ESC detected - enter checkpoint selection mode
		set(checkpointSelectionModeAtom, true)
		set(lastEscPressTimeAtom, 0)
		// Load checkpoints from chatMessages
		const chatMessages = get(chatMessagesAtom)
		const checkpoints = getCheckpointMessages(chatMessages)
		set(checkpointListAtom, checkpoints)
		set(selectedCheckpointIndexAtom, 0)
	} else {
		set(lastEscPressTimeAtom, now)
	}
})
```

### Phase 2: New Input Mode - "checkpoint"

**File**: `cli/src/state/atoms/ui.ts`

Extend `InputMode` type:

```typescript
export type InputMode =
	| "normal"
	| "approval"
	| "autocomplete"
	| "followup"
	| "history"
	| "shell"
	| "checkpoint" // NEW: Checkpoint selection mode
	| "restoreType" // NEW: Restore type selection mode
```

### Phase 3: Checkpoint Selection UI Component

**New File**: `cli/src/ui/components/CheckpointSelectionMenu.tsx`

```typescript
interface CheckpointSelectionMenuProps {
  checkpoints: CheckpointMessage[]
  selectedIndex: number
  visible: boolean
}

export const CheckpointSelectionMenu: React.FC<CheckpointSelectionMenuProps> = ({
  checkpoints,
  selectedIndex,
  visible,
}) => {
  if (!visible || checkpoints.length === 0) return null

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.actions.pending} paddingX={1}>
      <Text bold color={theme.actions.pending}>
        Select Checkpoint to Restore:
      </Text>
      {checkpoints.map((cp, index) => (
        <CheckpointRow
          key={cp.text}
          checkpoint={cp}
          index={index}
          isSelected={index === selectedIndex}
        />
      ))}
      <Box marginTop={1}>
        <Text color={theme.ui.text.dimmed}>
          ↑↓ Navigate • Enter Select • ESC Cancel
        </Text>
      </Box>
    </Box>
  )
}
```

### Phase 4: Restore Type Selection UI Component

**New File**: `cli/src/ui/components/RestoreTypeMenu.tsx`

```typescript
type RestoreType = "both" | "conversation" | "code"

const RESTORE_OPTIONS: { type: RestoreType; label: string; description: string }[] = [
  { type: "both", label: "Conversation + Code", description: "Restore both conversation and file changes" },
  { type: "conversation", label: "Conversation Only", description: "Restore conversation history only" },
  { type: "code", label: "Code Only", description: "Restore file changes only (git reset)" },
]

export const RestoreTypeMenu: React.FC<RestoreTypeMenuProps> = ({
  selectedCheckpoint,
  selectedIndex,
  visible,
}) => {
  if (!visible) return null

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.actions.pending} paddingX={1}>
      <Text bold color={theme.actions.pending}>
        Restore Type for {selectedCheckpoint.text.slice(0, 8)}:
      </Text>
      {RESTORE_OPTIONS.map((option, index) => (
        <RestoreOptionRow
          key={option.type}
          option={option}
          isSelected={index === selectedIndex}
        />
      ))}
      <Box marginTop={1}>
        <Text color={theme.ui.text.dimmed}>
          ↑↓ Navigate • Enter Confirm • ESC Back
        </Text>
      </Box>
    </Box>
  )
}
```

### Phase 5: Keyboard Handler for Checkpoint Mode

**File**: `cli/src/state/atoms/keyboard.ts`

Add new handler function:

```typescript
function handleCheckpointKeys(get: Getter, set: Setter, key: Key): void {
	const isRestoreTypeMode = get(restoreTypeSelectionModeAtom)

	if (isRestoreTypeMode) {
		handleRestoreTypeKeys(get, set, key)
		return
	}

	const checkpoints = get(checkpointListAtom)
	const selectedIndex = get(selectedCheckpointIndexAtom)

	switch (key.name) {
		case "up":
			set(selectedCheckpointIndexAtom, selectedIndex === 0 ? checkpoints.length - 1 : selectedIndex - 1)
			return

		case "down":
			set(selectedCheckpointIndexAtom, (selectedIndex + 1) % checkpoints.length)
			return

		case "return":
			// Move to restore type selection
			set(restoreTypeSelectionModeAtom, true)
			set(selectedRestoreTypeIndexAtom, 0)
			return

		case "escape":
			// Exit checkpoint selection mode
			set(checkpointSelectionModeAtom, false)
			set(checkpointListAtom, [])
			return
	}
}

function handleRestoreTypeKeys(get: Getter, set: Setter, key: Key): void {
	const selectedIndex = get(selectedRestoreTypeIndexAtom)
	const RESTORE_OPTIONS_COUNT = 3

	switch (key.name) {
		case "up":
			set(selectedRestoreTypeIndexAtom, selectedIndex === 0 ? RESTORE_OPTIONS_COUNT - 1 : selectedIndex - 1)
			return

		case "down":
			set(selectedRestoreTypeIndexAtom, (selectedIndex + 1) % RESTORE_OPTIONS_COUNT)
			return

		case "return":
			// Execute restore with selected type
			const checkpoint = get(checkpointListAtom)[get(selectedCheckpointIndexAtom)]
			const restoreType = ["both", "conversation", "code"][selectedIndex] as RestoreType
			set(executeCheckpointRestoreAtom, { checkpoint, restoreType })
			return

		case "escape":
			// Go back to checkpoint selection
			set(restoreTypeSelectionModeAtom, false)
			return
	}
}
```

### Phase 6: Extend Checkpoint Restore Protocol

**File**: `src/shared/WebviewMessage.ts`

Extend the restore payload schema:

```typescript
export const checkoutRestorePayloadSchema = z.object({
	ts: z.number(),
	commitHash: z.string(),
	mode: z.enum(["preview", "restore"]),
	restoreType: z.enum(["both", "conversation", "code"]).optional().default("both"), // NEW
})
```

### Phase 7: Modify Checkpoint Restore Function

**File**: `src/core/checkpoints/index.ts`

Update `checkpointRestore` to support partial restores:

```typescript
export type CheckpointRestoreOptions = {
	ts: number
	commitHash: string
	mode: "preview" | "restore"
	operation?: "delete" | "edit"
	restoreType?: "both" | "conversation" | "code" // NEW
}

export async function checkpointRestore(
	task: Task,
	{ ts, commitHash, mode, operation = "delete", restoreType = "both" }: CheckpointRestoreOptions,
) {
	const service = await getCheckpointService(task)
	if (!service) return

	const index = task.clineMessages.findIndex((m) => m.ts === ts)
	if (index === -1) return

	const provider = task.providerRef.deref()

	try {
		// Code restoration (git reset)
		if (restoreType === "both" || restoreType === "code") {
			await service.restoreCheckpoint(commitHash)
			TelemetryService.instance.captureCheckpointRestored(task.taskId)
			await provider?.postMessageToWebview({ type: "currentCheckpointUpdated", text: commitHash })
		}

		// Conversation restoration (message rewind)
		if (mode === "restore" && (restoreType === "both" || restoreType === "conversation")) {
			const deletedMessages = task.clineMessages.slice(index + 1)
			const { totalTokensIn, totalTokensOut, totalCacheWrites, totalCacheReads, totalCost } = getApiMetrics(
				task.combineMessages(deletedMessages),
			)

			await task.messageManager.rewindToTimestamp(ts, {
				includeTargetMessage: operation === "edit",
			})

			await task.say(
				"api_req_deleted",
				JSON.stringify({
					tokensIn: totalTokensIn,
					tokensOut: totalTokensOut,
					cacheWrites: totalCacheWrites,
					cacheReads: totalCacheReads,
					cost: totalCost,
				} satisfies ClineApiReqInfo),
			)
		}

		provider?.cancelTask()
	} catch (err) {
		provider?.log("[checkpointRestore] disabling checkpoints for this task")
		task.enableCheckpoints = false
		reportError("checkpointRestore", err)
	}
}
```

### Phase 8: CLI Execute Restore Action

**File**: `cli/src/state/atoms/actions.ts` (or new file)

```typescript
export const executeCheckpointRestoreAtom = atom(
	null,
	async (get, set, { checkpoint, restoreType }: { checkpoint: CheckpointMessage; restoreType: RestoreType }) => {
		const sendWebviewMessage = get(sendWebviewMessageAtom)

		// Clear selection state
		set(checkpointSelectionModeAtom, false)
		set(restoreTypeSelectionModeAtom, false)
		set(checkpointListAtom, [])

		// Send restore request to extension
		await sendWebviewMessage({
			type: "checkpointRestore",
			payload: {
				ts: checkpoint.ts,
				commitHash: checkpoint.text,
				mode: "restore",
				restoreType,
			},
		})
	},
)
```

### Phase 9: Update Mode Routing

**File**: `cli/src/state/atoms/keyboard.ts`

Update `keyboardHandlerAtom` to include checkpoint mode:

```typescript
export const keyboardHandlerAtom = atom(null, async (get, set, key: Key) => {
	// Priority 1: Handle global hotkeys first
	if (handleGlobalHotkeys(get, set, key)) return

	// Priority 2: Check for double-ESC (only in normal mode when not streaming)
	const isStreaming = get(isStreamingAtom)
	const isCheckpointMode = get(checkpointSelectionModeAtom)

	if (!isStreaming && !isCheckpointMode && key.name === "escape") {
		set(triggerCheckpointSelectionAtom)
		// If we entered checkpoint mode, don't process further
		if (get(checkpointSelectionModeAtom)) return
	}

	// Priority 3: Determine current mode and route
	const isApprovalPending = get(isApprovalPendingAtom)
	const isFollowupVisible = get(followupSuggestionsMenuVisibleAtom)
	const isAutocompleteVisible = get(showAutocompleteAtom)
	const isInHistoryMode = get(historyModeAtom)
	const isShellModeActive = get(shellModeActiveAtom)

	let mode: InputMode = "normal"
	if (isCheckpointMode)
		mode = "checkpoint" // NEW
	else if (isShellModeActive) mode = "shell"
	else if (isApprovalPending) mode = "approval"
	else if (isFollowupVisible) mode = "followup"
	else if (isInHistoryMode) mode = "history"
	else if (isAutocompleteVisible) mode = "autocomplete"

	set(inputModeAtom, mode)

	switch (mode) {
		case "checkpoint":
			return handleCheckpointKeys(get, set, key) // NEW
		case "shell":
			return await handleShellKeys(get, set, key)
		// ... other cases
	}
})
```

## File Changes Summary

| File                                                | Change Type | Description                                       |
| --------------------------------------------------- | ----------- | ------------------------------------------------- |
| `cli/src/state/atoms/keyboard.ts`                   | Modify      | Add double-ESC detection, checkpoint mode handler |
| `cli/src/state/atoms/ui.ts`                         | Modify      | Add `checkpoint` and `restoreType` to InputMode   |
| `cli/src/ui/components/CheckpointSelectionMenu.tsx` | New         | Checkpoint list UI component                      |
| `cli/src/ui/components/RestoreTypeMenu.tsx`         | New         | Restore type selection UI component               |
| `cli/src/state/atoms/actions.ts`                    | Modify      | Add `executeCheckpointRestoreAtom`                |
| `src/shared/WebviewMessage.ts`                      | Modify      | Add `restoreType` to payload schema               |
| `src/core/checkpoints/index.ts`                     | Modify      | Support partial restores                          |
| `src/core/webview/webviewMessageHandler.ts`         | Modify      | Pass `restoreType` to restore function            |

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Normal Mode                              │
│                                                                  │
│  User presses ESC                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │ Start Timer  │                                                │
│  └──────────────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  User presses ESC again within 500ms?                            │
│         │                                                        │
│    Yes  │  No                                                    │
│         │   └──► Clear timer, continue normal mode               │
│         ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Checkpoint Selection Mode                    │   │
│  │                                                           │   │
│  │  Select Checkpoint to Restore:                            │   │
│  │  ────────────────────────────────────────────────────     │   │
│  │  > 41db173a - 5 minutes ago                               │   │
│  │    00d185d5 - 12 minutes ago                              │   │
│  │    a3f2c891 - 1 hour ago [auto-saved]                     │   │
│  │                                                           │   │
│  │  ↑↓ Navigate • Enter Select • ESC Cancel                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                                                        │
│         ▼ (Enter)                                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Restore Type Selection Mode                  │   │
│  │                                                           │   │
│  │  Restore Type for 41db173a:                               │   │
│  │  ────────────────────────────────────────────────────     │   │
│  │  > Conversation + Code                                    │   │
│  │      Restore both conversation and file changes           │   │
│  │    Conversation Only                                      │   │
│  │      Restore conversation history only                    │   │
│  │    Code Only                                              │   │
│  │      Restore file changes only (git reset)                │   │
│  │                                                           │   │
│  │  ↑↓ Navigate • Enter Confirm • ESC Back                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                                                        │
│         ▼ (Enter)                                                │
│  Execute restore with selected type                              │
│         │                                                        │
│         ▼                                                        │
│  Return to Normal Mode                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Edge Cases & Considerations

### 1. No Checkpoints Available

If no checkpoints exist, show a message and return to normal mode:

```typescript
if (checkpoints.length === 0) {
	addMessage({
		type: "system",
		content: "No checkpoints available. Checkpoints are created automatically during task execution.",
	})
	set(checkpointSelectionModeAtom, false)
	return
}
```

### 2. Streaming State

Double-ESC should not trigger checkpoint selection while streaming (already handled by existing ESC → cancel logic).

### 3. Approval Pending

If an approval is pending, ESC should reject the approval, not trigger checkpoint selection.

### 4. Code-Only Restore Warning

When restoring code only, warn the user that conversation will be out of sync:

```typescript
if (restoreType === "code") {
	addMessage({
		type: "system",
		content:
			"⚠️ Code restored to checkpoint. Conversation history remains unchanged and may reference files that no longer exist.",
	})
}
```

### 5. Conversation-Only Restore Warning

When restoring conversation only, warn about potential inconsistency:

```typescript
if (restoreType === "conversation") {
	addMessage({
		type: "system",
		content: "⚠️ Conversation restored to checkpoint. File changes remain in current state.",
	})
}
```

## Testing Plan

### Unit Tests

1. Double-ESC timing detection
2. Checkpoint list extraction from messages
3. Mode transitions (normal → checkpoint → restoreType → normal)
4. Keyboard navigation in both menus

### Integration Tests

1. Full flow: double-ESC → select checkpoint → select restore type → execute
2. Cancel at checkpoint selection (ESC)
3. Back from restore type to checkpoint selection (ESC)
4. Restore with each type (both, conversation, code)

### Manual Testing

1. Verify timing feels natural (~500ms window)
2. Test with 0, 1, and many checkpoints
3. Test during streaming (should not trigger)
4. Test during approval (should not trigger)

## Estimated Effort

| Phase                                  | Effort    | Dependencies |
| -------------------------------------- | --------- | ------------ |
| Phase 1: Double-ESC Detection          | 2 hours   | None         |
| Phase 2: Input Mode Extension          | 30 min    | Phase 1      |
| Phase 3: Checkpoint Selection UI       | 2 hours   | Phase 2      |
| Phase 4: Restore Type UI               | 1.5 hours | Phase 3      |
| Phase 5: Keyboard Handlers             | 2 hours   | Phase 4      |
| Phase 6: Protocol Extension            | 30 min    | None         |
| Phase 7: Restore Function Modification | 1.5 hours | Phase 6      |
| Phase 8: CLI Execute Action            | 1 hour    | Phase 5, 7   |
| Phase 9: Mode Routing Update           | 1 hour    | Phase 8      |
| Testing & Polish                       | 3 hours   | All          |

**Total Estimated Effort: ~15 hours**

## Conclusion

This feature is **feasible and well-supported** by the existing codebase. The main work involves:

1. Adding a new input mode for checkpoint selection
2. Creating two new UI components (checkpoint list, restore type selection)
3. Extending the checkpoint restore function to support partial restores
4. Implementing timing-based double-ESC detection

The existing patterns for keyboard handling, menu components, and checkpoint management provide a solid foundation for this implementation.

---

## Implementation Status: ✅ COMPLETED

The feature has been fully implemented. Here's a summary of the changes made:

### Files Modified

| File                                        | Changes                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/WebviewMessage.ts`              | Added `restoreType: z.enum(["both", "conversation", "code"]).optional().default("both")` to `checkoutRestorePayloadSchema`                            |
| `src/core/checkpoints/index.ts`             | Extended `CheckpointRestoreOptions` type and modified `checkpointRestore()` to conditionally execute code/conversation restore based on `restoreType` |
| `cli/src/state/atoms/ui.ts`                 | Added `"checkpoint"` and `"restoreType"` to `InputMode` type                                                                                          |
| `cli/src/state/atoms/index.ts`              | Exported all checkpoint atoms                                                                                                                         |
| `cli/src/state/atoms/actions.ts`            | Added `requestCheckpointRestoreAtom` to send restore request to extension                                                                             |
| `cli/src/state/atoms/keyboard.ts`           | Added double-ESC detection, checkpoint mode handlers, and mode routing                                                                                |
| `cli/src/state/hooks/useApprovalHandler.ts` | Added `restoreType: "both"` to existing checkpoint restore call                                                                                       |
| `cli/src/ui/UI.tsx`                         | Integrated `CheckpointSelectionMenu` and `RestoreTypeMenu` components                                                                                 |

### Files Created

| File                                                | Description                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `cli/src/state/atoms/checkpoint.ts`                 | All checkpoint selection state atoms, types, constants, and action atoms |
| `cli/src/ui/components/CheckpointSelectionMenu.tsx` | UI component for checkpoint list with scrolling                          |
| `cli/src/ui/components/RestoreTypeMenu.tsx`         | UI component for restore type selection                                  |
| `cli/src/state/atoms/__tests__/checkpoint.spec.ts`  | Comprehensive tests for checkpoint atoms                                 |

### Key Implementation Details

1. **Double-ESC Detection**: Uses a 500ms timing window (`DOUBLE_ESC_WINDOW_MS`) to detect double-ESC presses
2. **Two-Stage Selection**: First select checkpoint, then select restore type
3. **Extension as Source of Truth**: CLI sends `checkpointRestore` message to extension which performs actual restore
4. **Conditional Restore**: `checkpointRestore()` now supports:
    - `restoreType: "both"` - Restore both code and conversation (default)
    - `restoreType: "code"` - Restore code only (git reset)
    - `restoreType: "conversation"` - Restore conversation only (message rewind)
5. **Backward Compatible**: The `restoreType` field defaults to `"both"` for existing callers

### User Flow

```
Normal Mode
    │
    ▼ (ESC pressed)
Start Timer
    │
    ▼ (ESC pressed again within 500ms)
Checkpoint Selection Mode
    │ ↑↓ Navigate
    │ Enter → Select
    │ ESC → Cancel
    ▼
Restore Type Selection Mode
    │ ↑↓ Navigate
    │ Enter → Confirm & Execute
    │ Backspace → Back to checkpoint selection
    │ ESC → Cancel
    ▼
Execute Restore → Return to Normal Mode
```

---

## Known Issue: Conversation Restore Not Working in CLI

### Problem Description

After implementing the feature, testing revealed that conversation restore doesn't work correctly in the CLI. When restoring a checkpoint with `restoreType: "conversation"` or `restoreType: "both"`, the AI still "remembers" previous messages that should have been removed.

### Root Cause Analysis

The issue stems from the checkpoint restore flow in [`src/core/webview/webviewMessageHandler.ts`](../../src/core/webview/webviewMessageHandler.ts:1309-1328):

```typescript
case "checkpointRestore": {
    const result = checkoutRestorePayloadSchema.safeParse(message.payload)
    if (result.success) {
        await provider.cancelTask()  // First cancelTask - triggers task reinitialization
        try {
            await pWaitFor(() => provider.getCurrentTask()?.isInitialized === true, { timeout: 3_000 })
        } catch (error) {
            vscode.window.showErrorMessage(t("common:errors.checkpoint_timeout"))
        }
        try {
            await provider.getCurrentTask()?.checkpointRestore(result.data)  // Performs rewind
        } catch (error) {
            vscode.window.showErrorMessage(t("common:errors.checkpoint_failed"))
        }
    }
    break
}
```

And in [`src/core/checkpoints/index.ts`](../../src/core/checkpoints/index.ts:326):

```typescript
// At the end of checkpointRestore():
provider?.cancelTask() // Second cancelTask - triggers ANOTHER reinitialization
```

**The problem is a race condition caused by double `cancelTask()` calls:**

1. `provider.cancelTask()` is called BEFORE `checkpointRestore()` in the handler (line 1313)
2. `pWaitFor()` waits for task to reinitialize - this reloads messages from disk (line 1316)
3. `checkpointRestore()` performs the rewind via `messageManager.rewindToTimestamp()` on the NEW task
4. The rewind correctly persists truncated messages to disk via `overwriteClineMessages()` and `overwriteApiConversationHistory()`
5. `provider?.cancelTask()` is called AGAIN at the end of `checkpointRestore()` (line 326)
6. This second `cancelTask()` triggers ANOTHER reinitialization which reloads messages from disk

**However**, the CLI's state sync mechanism in [`cli/src/state/atoms/extension.ts`](../src/state/atoms/extension.ts) uses a `reconcileMessages()` function that protects streaming messages from rollbacks. This reconciliation logic may be preventing the CLI from receiving the truncated message list properly after the restore completes.

### Potential Solutions

#### Option 1: Add Explicit State Sync After Restore (Recommended)

Add an explicit `postStateToWebview()` call after `checkpointRestore()` completes in the webviewMessageHandler to ensure the CLI receives the updated state:

```typescript
case "checkpointRestore": {
    const result = checkoutRestorePayloadSchema.safeParse(message.payload)
    if (result.success) {
        await provider.cancelTask()
        try {
            await pWaitFor(() => provider.getCurrentTask()?.isInitialized === true, { timeout: 3_000 })
        } catch (error) {
            vscode.window.showErrorMessage(t("common:errors.checkpoint_timeout"))
        }
        try {
            await provider.getCurrentTask()?.checkpointRestore(result.data)
            // NEW: Explicitly sync state to webview after restore
            await provider.postStateToWebview()
        } catch (error) {
            vscode.window.showErrorMessage(t("common:errors.checkpoint_failed"))
        }
    }
    break
}
```

#### Option 2: Modify CLI Reconciliation Logic

Update the `reconcileMessages()` function in `cli/src/state/atoms/extension.ts` to detect checkpoint restore scenarios and allow message list truncation:

```typescript
// Add a flag or timestamp to detect checkpoint restore
// When detected, bypass the streaming protection logic
```

#### Option 3: Send Explicit "Checkpoint Restored" Event

Create a new message type that the CLI can listen for to force a full state refresh:

```typescript
// In checkpointRestore():
provider?.postMessageToWebview({ type: "checkpointRestoreComplete", ts: ts })

// In CLI:
// Listen for this event and force a full state refresh
```

### Next Steps

1. ✅ Implement Option 1 (explicit `postStateToWebview()` call) as the simplest fix - **COMPLETED**
2. Test the fix with all three restore types (`both`, `conversation`, `code`)
3. If Option 1 doesn't work, investigate the CLI's `reconcileMessages()` logic more deeply
4. Consider adding a delay or explicit sync mechanism to ensure the CLI receives the updated state after the second `cancelTask()` completes

### Fix Applied

The fix was implemented in [`src/core/webview/webviewMessageHandler.ts`](../../src/core/webview/webviewMessageHandler.ts:1309-1339):

```typescript
case "checkpointRestore": {
    const result = checkoutRestorePayloadSchema.safeParse(message.payload)

    if (result.success) {
        await provider.cancelTask()

        try {
            await pWaitFor(() => provider.getCurrentTask()?.isInitialized === true, { timeout: 3_000 })
        } catch (error) {
            vscode.window.showErrorMessage(t("common:errors.checkpoint_timeout"))
        }

        try {
            await provider.getCurrentTask()?.checkpointRestore(result.data)
            // kilocode_change start: Wait for the second cancelTask() (inside checkpointRestore) to complete
            // and task to reinitialize, then explicitly sync state to webview to ensure CLI receives
            // the updated message list after conversation restore
            try {
                await pWaitFor(() => provider.getCurrentTask()?.isInitialized === true, { timeout: 3_000 })
            } catch {
                // Timeout is acceptable - task may already be initialized
            }
            await provider.postStateToWebview()
            // kilocode_change end
        } catch (error) {
            vscode.window.showErrorMessage(t("common:errors.checkpoint_failed"))
        }
    }

    break
}
```

This fix ensures that after `checkpointRestore()` completes (which includes the second `cancelTask()` and task reinitialization), the CLI receives an explicit state update with the truncated message list.

### Detailed Analysis of CLI State Sync

After reviewing [`cli/src/state/atoms/extension.ts`](../src/state/atoms/extension.ts), the `reconcileMessages()` function (lines 557-646) has sophisticated logic to protect streaming messages from being overwritten:

```typescript
// PRIORITY 1: Prevent completed messages from being overwritten by stale partial updates
if (existingMsg && !existingMsg.partial && incomingMsg.partial) {
	const currentVersion = versionMap.get(incomingMsg.ts) || 0
	const incomingVersion = getMessageContentLength(incomingMsg)
	if (incomingVersion <= currentVersion) {
		return existingMsg // Reject stale update
	}
}

// PRIORITY 2: If message is actively streaming, protect it from ALL rollbacks
if (existingMsg && streamingSet.has(incomingMsg.ts) && existingMsg.partial) {
	// ... protection logic
}
```

**Key insight**: The reconciliation logic is designed to protect against rollbacks during streaming, but it should NOT prevent legitimate message list truncation during checkpoint restore. The issue is likely that:

1. The checkpoint restore truncates messages on disk correctly
2. The `cancelTask()` at the end of `checkpointRestore()` triggers task reinitialization
3. The new task loads the truncated messages from disk
4. The extension sends the new state to the CLI via `postStateToWebview()`
5. **BUT** the CLI's `reconcileMessages()` may be comparing the truncated list against its current (longer) list and keeping the old messages

The reconciliation logic compares messages by timestamp (`ts`), so if the incoming list is shorter (truncated), the messages that were removed won't be in the incoming list at all. The current logic should handle this correctly since it iterates over `deduplicatedIncoming` (the incoming messages), not the current messages.

**However**, there's a potential issue: The `syntheticAsks` logic (lines 572-589) adds back CLI-created messages that don't exist in incoming. This could potentially re-add messages that were supposed to be removed.

### Recommended Fix

The simplest fix is to add an explicit `postStateToWebview()` call after `checkpointRestore()` completes in the webviewMessageHandler. This ensures the CLI receives the updated state after the restore is complete:

```typescript
case "checkpointRestore": {
    const result = checkoutRestorePayloadSchema.safeParse(message.payload)
    if (result.success) {
        await provider.cancelTask()
        try {
            await pWaitFor(() => provider.getCurrentTask()?.isInitialized === true, { timeout: 3_000 })
        } catch (error) {
            vscode.window.showErrorMessage(t("common:errors.checkpoint_timeout"))
        }
        try {
            await provider.getCurrentTask()?.checkpointRestore(result.data)
            // Wait for the second cancelTask() to complete and task to reinitialize
            await pWaitFor(() => provider.getCurrentTask()?.isInitialized === true, { timeout: 3_000 })
            // Explicitly sync state to webview after restore
            await provider.postStateToWebview()
        } catch (error) {
            vscode.window.showErrorMessage(t("common:errors.checkpoint_failed"))
        }
    }
    break
}
```

This ensures that after the checkpoint restore completes (including the second `cancelTask()` and task reinitialization), the CLI receives the updated state with the truncated message list.
