/**
 * CheckpointSelectionMenu component - displays available checkpoints for selection
 * Triggered by double-ESC, allows users to select a checkpoint to restore
 */

import React from "react"
import { Box, Text } from "ink"
import type { CheckpointInfo } from "../../state/atoms/checkpoint.js"
import { useTheme } from "../../state/hooks/useTheme.js"

interface CheckpointSelectionMenuProps {
	checkpoints: CheckpointInfo[]
	selectedIndex: number
}

export const CheckpointSelectionMenu: React.FC<CheckpointSelectionMenuProps> = ({ checkpoints, selectedIndex }) => {
	const theme = useTheme()

	if (checkpoints.length === 0) {
		return null
	}

	// Limit display to 10 checkpoints with scrolling
	const maxVisible = 10
	const startIndex = Math.max(
		0,
		Math.min(selectedIndex - Math.floor(maxVisible / 2), checkpoints.length - maxVisible),
	)
	const endIndex = Math.min(startIndex + maxVisible, checkpoints.length)
	const visibleCheckpoints = checkpoints.slice(startIndex, endIndex)

	return (
		<Box flexDirection="column" borderStyle="round" borderColor={theme.actions.pending} paddingX={1}>
			<Text bold color={theme.actions.pending}>
				📍 Select Checkpoint to Restore
			</Text>
			<Box marginTop={1} flexDirection="column">
				{startIndex > 0 && (
					<Text color={theme.ui.text.dimmed}>
						{"  "}↑ {startIndex} more...
					</Text>
				)}
				{visibleCheckpoints.map((checkpoint, index) => {
					const actualIndex = startIndex + index
					return (
						<CheckpointRow
							key={checkpoint.commitHash}
							checkpoint={checkpoint}
							index={actualIndex}
							isSelected={actualIndex === selectedIndex}
						/>
					)
				})}
				{endIndex < checkpoints.length && (
					<Text color={theme.ui.text.dimmed}>
						{"  "}↓ {checkpoints.length - endIndex} more...
					</Text>
				)}
			</Box>
			<Box marginTop={1}>
				<Text color={theme.ui.text.dimmed} dimColor>
					↑↓ Navigate • Enter Select • Esc Cancel
				</Text>
			</Box>
		</Box>
	)
}

interface CheckpointRowProps {
	checkpoint: CheckpointInfo
	index: number
	isSelected: boolean
}

const CheckpointRow: React.FC<CheckpointRowProps> = ({ checkpoint, index, isSelected }) => {
	const theme = useTheme()

	// Truncate hash for display (show first 8 characters)
	const shortHash = checkpoint.commitHash.slice(0, 8)

	return (
		<Box>
			{isSelected && (
				<Text color={theme.actions.pending} bold>
					{">"}{" "}
				</Text>
			)}
			{!isSelected && <Text>{"  "}</Text>}

			<Text color={isSelected ? theme.actions.pending : theme.ui.text.primary} bold={isSelected}>
				{index + 1}. {shortHash}
			</Text>

			<Text color={theme.ui.text.dimmed}> - </Text>

			<Text color={isSelected ? theme.ui.text.primary : theme.ui.text.dimmed}>{checkpoint.relativeTime}</Text>

			{checkpoint.isAutoSaved && (
				<Text color={theme.ui.text.dimmed} dimColor>
					{" "}
					(auto)
				</Text>
			)}

			{checkpoint.userMessagePreview && (
				<Text color={theme.ui.text.dimmed} dimColor>
					{" "}
					- "{checkpoint.userMessagePreview}"
				</Text>
			)}
		</Box>
	)
}
