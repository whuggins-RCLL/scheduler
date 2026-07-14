import type { EmployeeProfile, Position, StructuredRule } from "./types";

/**
 * Deterministic, rule-based interpreter that converts a manager's natural-
 * language scheduling note into a *proposed* {@link StructuredRule}. This is
 * intentionally NOT an LLM call: it is transparent, testable, and runs offline.
 * The manager must still confirm/edit/reject the interpretation before the
 * scheduling engine applies it (rule.confirmed stays false here).
 *
 * When the AI feature is enabled, an LLM may *suggest* the same structure, but
 * this deterministic path is always available as the fallback and the ground
 * truth for tests.
 */

export interface InterpretationContext {
  employees: EmployeeProfile[];
  positions: Position[];
}

const HOUR_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
};

function findEmployee(text: string, employees: EmployeeProfile[]): EmployeeProfile | undefined {
  const lower = text.toLowerCase();
  return employees.find((e) => {
    const names = [e.preferredName, e.legalName].filter(Boolean).map((n) => n!.toLowerCase());
    return names.some((n) => n.split(" ").some((part) => part.length > 2 && lower.includes(part)));
  });
}

function findPosition(text: string, positions: Position[]): Position | undefined {
  const lower = text.toLowerCase();
  return positions.find(
    (p) => lower.includes(p.name.toLowerCase()) || lower.includes(p.shortLabel.toLowerCase()),
  );
}

function parseHours(text: string): number | undefined {
  const digit = /(\d+(?:\.\d+)?)\s*(?:hours|hrs|hour|h)\b/i.exec(text);
  if (digit) return Number(digit[1]);
  const word = /\b(one|two|three|four|five|six|seven|eight)\s+(?:consecutive\s+)?hours?\b/i.exec(text);
  if (word) return HOUR_WORDS[word[1].toLowerCase()];
  return undefined;
}

export function interpretNote(text: string, ctx: InterpretationContext): StructuredRule | null {
  const employee = findEmployee(text, ctx.employees);
  const position = findPosition(text, ctx.positions);
  const lower = text.toLowerCase();
  const constraintClass: "soft" | "info" = "soft";

  // "no more than N consecutive hours at <position>"
  if (/(consecutive|in a row|straight|at a time)/i.test(lower) || /more than/i.test(lower)) {
    const hours = parseHours(text);
    if (hours) {
      return {
        kind: "max_consecutive_minutes",
        employeeId: employee?.id,
        positionId: position?.id,
        thresholdMinutes: Math.round(hours * 60),
        constraintClass,
        confirmed: false,
      };
    }
  }

  // "don't schedule <emp> at <position>" / "keep <emp> off <position>"
  if (/(don'?t|do not|avoid|keep .* off|not).*(desk|position|shift)/i.test(lower) && position) {
    return {
      kind: "avoid_position",
      employeeId: employee?.id,
      positionId: position.id,
      constraintClass: /\bnever\b/i.test(lower) ? "hard" : constraintClass,
      confirmed: false,
    };
  }

  // "prefer <emp> for <position>"
  if (/(prefer|whenever possible|likes?)/i.test(lower) && position) {
    return {
      kind: "prefer_position",
      employeeId: employee?.id,
      positionId: position.id,
      constraintClass: "soft",
      confirmed: false,
    };
  }

  // "no more than N hours a day"
  if (/(per day|a day|daily|each day)/i.test(lower)) {
    const hours = parseHours(text);
    if (hours) {
      return {
        kind: "max_daily_minutes",
        employeeId: employee?.id,
        thresholdMinutes: Math.round(hours * 60),
        constraintClass,
        confirmed: false,
      };
    }
  }

  // "don't schedule <emp> for both opening and closing the same day"
  if (/(opening|open).*(closing|close)|(closing|close).*(opening|open)/i.test(lower)) {
    return {
      kind: "no_open_close_same_day",
      employeeId: employee?.id,
      constraintClass,
      confirmed: false,
    };
  }

  return null;
}

/** Human-readable summary of a structured rule for manager confirmation. */
export function describeRule(rule: StructuredRule, ctx: InterpretationContext): string {
  const emp = ctx.employees.find((e) => e.id === rule.employeeId);
  const pos = ctx.positions.find((p) => p.id === rule.positionId);
  const who = emp ? (emp.preferredName ?? emp.legalName) : "Anyone";
  const where = pos ? ` at ${pos.name}` : "";
  const hrs = rule.thresholdMinutes ? (rule.thresholdMinutes / 60).toFixed(1) : "";
  switch (rule.kind) {
    case "max_consecutive_minutes":
      return `${who}: no more than ${hrs} consecutive hours${where} (${rule.constraintClass}).`;
    case "max_daily_minutes":
      return `${who}: no more than ${hrs} hours per day (${rule.constraintClass}).`;
    case "avoid_position":
      return `${who}: avoid${where} (${rule.constraintClass}).`;
    case "prefer_position":
      return `${who}: prefer${where} (${rule.constraintClass}).`;
    case "no_open_close_same_day":
      return `${who}: do not work both opening and closing the same day (${rule.constraintClass}).`;
    case "pair_with_coverage":
      return `${who}: require paired coverage${where} (${rule.constraintClass}).`;
  }
}
