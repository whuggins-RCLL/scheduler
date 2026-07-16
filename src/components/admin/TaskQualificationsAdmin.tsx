"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { tasksByScheduleType } from "@/lib/schedule-type-links";

/**
 * Task qualifications grouped by schedule type and category. Each task is a
 * card with employee toggles — readable on mobile without horizontal scrolling.
 */
export function TaskQualificationsAdmin() {
  const { db, currentUser, setTaskQualifications } = useStore();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const employees = useMemo(
    () => db.employees
      .filter((e) => e.active)
      .sort((a, b) => (a.preferredName ?? a.legalName).localeCompare(b.preferredName ?? b.legalName)),
    [db.employees],
  );
  const sections = useMemo(() => tasksByScheduleType(db.tasks, db.locations), [db.tasks, db.locations]);

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  function toggle(employeeId: string, taskId: string, on: boolean) {
    const emp = db.employees.find((e) => e.id === employeeId);
    if (!emp) return;
    const next = on
      ? [...new Set([...emp.qualifiedTaskIds, taskId])]
      : emp.qualifiedTaskIds.filter((id) => id !== taskId);
    setTaskQualifications(employeeId, next);
  }

  const query = filter.trim().toLowerCase();

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Task qualifications</h1>
        <p className="muted">
          Assign task qualifications by schedule type. Each task lists who may perform it — used for
          swap eligibility and automated scheduling.
        </p>
      </div>

      {employees.length === 0 || db.tasks.filter((t) => t.active).length === 0 ? (
        <section className="card">
          <p className="muted">
            {employees.length === 0 ? "No active employees yet." : "No active tasks yet."}
          </p>
        </section>
      ) : (
        <>
          <div className="field" style={{ maxWidth: "28rem" }}>
            <label htmlFor="tq-filter">Filter employees</label>
            <input
              id="tq-filter"
              type="search"
              placeholder="Search by name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          {sections.map((section) => {
            const sectionKey = section.location?.id ?? "all";
            const open = expandedSection === null || expandedSection === sectionKey;
            const visibleEmployees = query
              ? employees.filter((e) => (e.preferredName ?? e.legalName).toLowerCase().includes(query))
              : employees;
            const categories = [...new Set(section.tasks.map((t) => t.category))].sort();

            return (
              <section key={sectionKey} className="card qual-section">
                <button
                  type="button"
                  className="qual-section-head"
                  onClick={() => setExpandedSection(open && expandedSection === sectionKey ? null : sectionKey)}
                  aria-expanded={open}
                >
                  <span>
                    <strong>{section.label}</strong>
                    <span className="muted qual-section-meta">
                      {section.tasks.length} task{section.tasks.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                </button>

                {open && categories.map((category) => {
                  const categoryTasks = section.tasks.filter((t) => t.category === category);
                  return (
                    <div key={category} className="qual-category">
                      <h3 className="qual-category-title">{category}</h3>
                      <div className="qual-task-grid">
                        {categoryTasks.map((task) => (
                          <article key={task.id} className="qual-task-card">
                            <header className="qual-task-head">
                              <h4>{task.name}</h4>
                              {task.estimatedMinutes > 0 && (
                                <span className="muted qual-task-est">{task.estimatedMinutes} min</span>
                              )}
                            </header>
                            <div className="qual-employee-list">
                              {visibleEmployees.map((emp) => {
                                const on = emp.qualifiedTaskIds.includes(task.id);
                                const label = emp.preferredName ?? emp.legalName;
                                return (
                                  <label key={emp.id} className={`qual-employee-chip ${on ? "on" : ""}`}>
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={(e) => toggle(emp.id, task.id, e.target.checked)}
                                      aria-label={`${label} — ${task.name}`}
                                    />
                                    <span>{label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
