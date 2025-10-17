// kilocode_change - new file: Button component that opens release notes modal manually
import React, { useState } from "react"
import { FileText } from "lucide-react"
import { Button } from "../ui"
import { ReleaseNotesModal } from "./ReleaseNotesModal"

interface ManualReleaseNotesButtonProps {
	/**
	 * Custom button text (optional)
	 */
	buttonText?: string
	/**
	 * Custom CSS classes for the button
	 */
	className?: string
}

export const ManualReleaseNotesButton: React.FC<ManualReleaseNotesButtonProps> = ({
	buttonText = "View Release Notes",
	className = "w-40",
}) => {
	const [showModal, setShowModal] = useState(false)

	return (
		<>
			<Button onClick={() => setShowModal(true)} className={className}>
				<FileText className="p-0.5" />
				{buttonText}
			</Button>

			{showModal && <ReleaseNotesModal isOpen onClose={() => setShowModal(false)} />}
		</>
	)
}
