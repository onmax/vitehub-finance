import type { SetupCheck } from "./api"

/**
 * The setup guide's steps (docs/1.guides/0.setup.md), in its order. The page shows each one's status under its heading
 * and the prompt hands the same list to an agent, so both talk about the same step by the same number.
 */
export const SETUP_STEPS = ["account", "app", "credentials", "link", "connect"] as const
export type SetupStepId = (typeof SETUP_STEPS)[number]

/**
 * `unchecked`: nothing can tell until the credentials work. `sandbox` and `redirect` are what's wrong with a registered
 * app; `missing`, `rejected`, and `unreachable` with its credentials; `todo` is a step not done yet.
 */
export type SetupStepStatus = "done" | "unchecked" | "todo" | "sandbox" | "redirect" | "missing" | "rejected" | "unreachable"

export interface SetupStep {
  id: SetupStepId
  /** 1-based, as the guide numbers it. */
  number: number
  status: SetupStepStatus
}

const STATUS: Record<SetupStepId, (check: SetupCheck) => SetupStepStatus> = {
  account: ({ banks }) => (banks.state === "missing" ? "unchecked" : "done"),
  app: ({ banks }) => (banks.state !== "ready" ? "unchecked" : banks.environment === "sandbox" ? "sandbox" : banks.redirectRegistered ? "done" : "redirect"),
  credentials: ({ banks }) => (banks.state === "ready" ? "done" : banks.state),
  link: ({ banks }) => (banks.state !== "ready" ? "unchecked" : banks.active ? "done" : "todo"),
  connect: ({ bankConnected }) => (bankConnected ? "done" : "todo"),
}

export const setupSteps = (check: SetupCheck): SetupStep[] => SETUP_STEPS.map((id, index) => ({ id, number: index + 1, status: STATUS[id](check) }))

/** The first step not done: where the person, and the agent, pick up. */
export const nextStep = (steps: SetupStep[]) => steps.find((step) => step.status !== "done") ?? null
