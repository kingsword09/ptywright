import type { AgentFlowStep } from "./schema";

export function formatAgentStepLabel(step: AgentFlowStep): string {
  if (step.type === "snapshot") return `snapshot ${step.name}`;
  if (step.type === "waitForText") return `wait ${step.text ?? step.regex ?? ""}`;
  if (step.type === "typeText") return `type ${step.text.slice(0, 24)}`;
  if (step.type === "pressKey") return `press ${step.key}`;
  if (step.type === "click") return `click ${step.selector ?? step.text ?? `${step.x},${step.y}`}`;
  if (step.type === "mark") return `mark ${step.label ?? ""}`;
  if (step.type === "sleep") return `sleep ${step.ms}ms`;
  return step.type;
}
