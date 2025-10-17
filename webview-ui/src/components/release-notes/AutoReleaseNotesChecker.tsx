// kilocode_change - new file: Auto-checks for unviewed releases and shows modal when needed
import React, { useState, useEffect } from "react"
import { ReleaseNotesModal } from "./ReleaseNotesModal"
import { useReleaseNotes } from "../../hooks/useReleaseNotes"

const SHOULD_AUTO_OPEN = false // Feature flag for auto-opening
const AUTO_OPEN_DELAY_MS = 2000 // 2 second delay before showing modal

export const AutoReleaseNotesChecker: React.FC = () => {
	const [showModal, setShowModal] = useState(false)
	const { hasUnviewedReleases, loadReleases, markAsViewed, currentVersion } = useReleaseNotes()

	useEffect(() => {
		if (!SHOULD_AUTO_OPEN) return

		let mounted = true

		const checkAndAutoOpen = async () => {
			try {
				const hasUnviewed = await hasUnviewedReleases()

				if (!mounted || !hasUnviewed) return

				// Load releases and delay before auto-opening
				await loadReleases()

				setTimeout(() => {
					if (mounted) {
						setShowModal(true)
						// Mark current version as viewed when auto-opening
						markAsViewed(currentVersion)
					}
				}, AUTO_OPEN_DELAY_MS)
			} catch (error) {
				console.warn("Failed to check for unviewed releases:", error)
			}
		}

		checkAndAutoOpen()

		return () => {
			mounted = false
		}
	}, [hasUnviewedReleases, loadReleases, markAsViewed, currentVersion])

	return showModal ? <ReleaseNotesModal isOpen onClose={() => setShowModal(false)} /> : null
}
