import { useMemo } from "react"
import { useAtomValue } from "jotai"
import { chatMessagesAtom } from "../atoms/extension.js"

export interface SessionCostInfo {
	totalCost: number
	requestCount: number
	hasCostData: boolean
}

export function useSessionCost(): SessionCostInfo {
	const messages = useAtomValue(chatMessagesAtom)

	return useMemo(() => {
		let totalCost = 0
		let requestCount = 0

		for (const message of messages) {
			if (message.say === "api_req_started" && message.text) {
				const data = JSON.parse(message.text)
				if (typeof data.cost === "number") {
					totalCost += data.cost
					requestCount++
				}
			}
		}

		return { totalCost, requestCount, hasCostData: requestCount > 0 }
	}, [messages])
}

export function formatSessionCost(cost: number): string {
	return `$${cost.toFixed(2)}`
}
