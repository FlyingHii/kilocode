// kilocode_change - new file: Simple hook for release notes with global cache
import { useState } from "react"
import { useExtensionState } from "../context/ExtensionStateContext"
import { vscode } from "../utils/vscode"
import { ReleaseNote } from "../types/release-notes"

// Global cache to avoid re-importing
let releasesCache: ReleaseData | null = null

interface ReleaseData {
	currentVersion: string
	releases: ReleaseNote[]
}

export const useReleaseNotes = () => {
	const [loading, setLoading] = useState(false)
	const { lastViewedReleaseVersion } = useExtensionState()

	const loadReleases = async (): Promise<ReleaseData> => {
		if (releasesCache) {
			return releasesCache
		}

		setLoading(true)
		try {
			const data = await import("../generated/releases/releases.json")
			releasesCache = data.default as ReleaseData
			return releasesCache
		} catch (error) {
			console.error("Failed to load release notes:", error)
			// Fallback to empty data
			releasesCache = { currentVersion: "0.0.0", releases: [] }
			return releasesCache
		} finally {
			setLoading(false)
		}
	}

	const hasUnviewedReleases = async (): Promise<boolean> => {
		const data = await loadReleases()
		const lastViewed = lastViewedReleaseVersion || "0.0.0"
		return lastViewed === "0.0.0" || data.currentVersion !== lastViewed
	}

	const markAsViewed = async (version: string): Promise<void> => {
		try {
			vscode.postMessage({
				type: "updateGlobalState",
				key: "lastViewedReleaseVersion",
				stateValue: version,
			})
		} catch (error) {
			console.error("Failed to mark version as viewed:", error)
			throw error
		}
	}

	return {
		releases: releasesCache?.releases || [],
		currentVersion: releasesCache?.currentVersion || "0.0.0",
		loading,
		loadReleases,
		hasUnviewedReleases,
		markAsViewed,
	}
}
