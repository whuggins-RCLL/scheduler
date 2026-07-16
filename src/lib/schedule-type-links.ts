import type { EmployeeProfile, Location, Position, Task } from "@/domain/types";

/** Schedule types a position is linked to (many-to-many, with legacy fallback). */
export function positionScheduleTypeIds(position: Pick<Position, "locationId" | "applicableLocationIds">): string[] {
  if (position.applicableLocationIds.length > 0) return position.applicableLocationIds;
  return position.locationId ? [position.locationId] : [];
}

/** Whether a task applies to a schedule type (empty list = all types). */
export function taskAppliesToScheduleType(task: Pick<Task, "applicableLocationIds">, locationId: string): boolean {
  if (task.applicableLocationIds.length === 0) return true;
  return task.applicableLocationIds.includes(locationId);
}

/** Group active tasks by schedule type for sectioned admin UIs. */
export function tasksByScheduleType(
  tasks: Task[],
  locations: Location[],
): { location: Location | null; label: string; tasks: Task[] }[] {
  const activeTasks = tasks.filter((t) => t.active).sort((a, b) => a.order - b.order);
  const activeLocations = locations.filter((l) => l.active).sort((a, b) => a.name.localeCompare(b.name));
  const sections = activeLocations.map((location) => ({
    location,
    label: location.name,
    tasks: activeTasks.filter(
      (task) => task.applicableLocationIds.length > 0 && task.applicableLocationIds.includes(location.id),
    ),
  }));
  const general = activeTasks.filter((task) => task.applicableLocationIds.length === 0);
  if (general.length > 0) {
    sections.push({ location: null, label: "All schedule types", tasks: general });
  }
  return sections.filter((section) => section.tasks.length > 0);
}

export function employeesForScheduleType(employees: EmployeeProfile[], locationId: string): EmployeeProfile[] {
  return employees.filter((e) => e.active && e.eligibleLocationIds.includes(locationId));
}

export function positionsForScheduleType(positions: Position[], locationId: string): Position[] {
  return positions.filter((p) => p.active && positionScheduleTypeIds(p).includes(locationId));
}

export function tasksForScheduleType(tasks: Task[], locationId: string): Task[] {
  return tasks.filter((t) => t.active && taskAppliesToScheduleType(t, locationId));
}

export function employeesWithScheduleTypeAccess(employees: EmployeeProfile[], locationId: string): EmployeeProfile[] {
  return employees.filter((e) => e.active && e.eligibleLocationIds.includes(locationId));
}
