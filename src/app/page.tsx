// app/page.tsx
"use client";

import React, { useMemo, useState } from "react";

type DayEntry = {
  day: number;
  am: string; // keep as string in UI, convert to number on submit
  pm: string;
  social: string;
  admin: string;
};

type HoursField = keyof Omit<DayEntry, "day">;
// 'am' | 'pm' | 'social' | 'admin'

type Selection = {
  field: HoursField;
  startRow: number;
  endRow: number;
} | null;

function getDaysInMonth(monthStr: string): number {
  // monthStr is "YYYY-MM"
  const [yearStr, monthStrOnly] = monthStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStrOnly);

  if (!year || !month) return 31; // fallback

  // JS Date: month is 1-based here when using "0" day trick
  // new Date(year, month, 0) = last day of that month
  return new Date(year, month, 0).getDate();
}

function generateDays(monthStr: string): DayEntry[] {
  const count = getDaysInMonth(monthStr);
  return Array.from({ length: count }, (_, idx) => ({
    day: idx + 1,
    am: "",
    pm: "",
    social: "",
    admin: "",
  }));
}

function getWeekdayName(monthStr: string, day: number): string {
  if (!monthStr) return "";
  const [yearStr, monthStrOnly] = monthStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStrOnly); // 1–12

  if (!year || !month) return "";

  // JS Date months are 0-based (0 = January)
  const date = new Date(year, month - 1, day);
  // "Mon", "Tue", etc. – you can change to 'long' if you want full names
  return date.toLocaleDateString("en-GB", { weekday: "short" });
}

function isWeekend(monthStr: string, day: number): boolean {
  if (!monthStr) return false;
  const [yearStr, monthStrOnly] = monthStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStrOnly);

  if (!year || !month) return false;

  // JS Date: month is 0-based
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  return dayOfWeek === 0 || dayOfWeek === 6;
}

// Utility to parse numeric inputs safely
function parseHours(value: string | number | undefined): number {
  if (value === "" || value === undefined || value === null) return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

export default function TimesheetPage() {
  const today = new Date();
  const initialMonth = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, "0")}`;

  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [month, setMonth] = useState(initialMonth);
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState<DayEntry[]>(() =>
    generateDays(initialMonth)
  );

  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selection, setSelection] = useState<Selection>(null);
  const inputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const tableContainerRef = React.useRef<HTMLDivElement | null>(null);
  const isShiftMouseDownRef = React.useRef(false);

  const handleCellClick = (
    e: React.MouseEvent<HTMLInputElement>,
    rowIndex: number,
    field: HoursField
  ) => {
    // If Shift is held and there is an existing selection on same field,
    // extend the selection to a range
    if (e.shiftKey && selection && selection.field === field) {
      setSelection({
        field,
        startRow: selection.startRow,
        endRow: rowIndex,
      });
    } else {
      // Start a new selection at this cell
      setSelection({
        field,
        startRow: rowIndex,
        endRow: rowIndex,
      });
    }
  };

  const handleTableBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // If the newly focused element is NOT inside the table container,
    // clear the selection.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setSelection(null);
    }
  };

  const handleCellFocus = (rowIndex: number, field: HoursField) => {
    if (isShiftMouseDownRef.current) {
      return;
    }
    setSelection({
      field,
      startRow: rowIndex,
      endRow: rowIndex,
    });
  };

  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRowIndex: number,
    field: HoursField
  ) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;

    e.preventDefault();

    const trimmed = text.trim();

    const isTableLike =
      trimmed.includes("\n") ||
      trimmed.includes("\r") ||
      trimmed.includes("\t") ||
      trimmed.includes(",");

    // --- CASE 1: single value & selection active → fill selection ---
    if (!isTableLike && selection && selection.field === field) {
      const value = trimmed;
      const start = Math.min(selection.startRow, selection.endRow);
      const end = Math.max(selection.startRow, selection.endRow);

      setDays((prev) => {
        const copy = [...prev];
        for (let i = start; i <= end && i < copy.length; i++) {
          copy[i] = { ...copy[i], [field]: value };
        }
        return copy;
      });
      return;
    }

    // --- CASE 2: single value, no selection → fill from this cell downward (previous behaviour) ---
    if (!isTableLike) {
      const value = trimmed;
      setDays((prev) => {
        const copy = [...prev];
        for (let i = startRowIndex; i < copy.length; i++) {
          copy[i] = { ...copy[i], [field]: value };
        }
        return copy;
      });
      return;
    }

    // --- CASE 3: multi-row/table paste (from Excel) – keep your previous behaviour ---
    const rows = trimmed
      .split(/\r?\n/)
      .map((line) => line.split(/\t|,/).map((v) => v.trim()));

    setDays((prev) => {
      const copy = [...prev];

      rows.forEach((cols, rowOffset) => {
        const targetIndex = startRowIndex + rowOffset;
        if (targetIndex >= copy.length) return;

        const [am, pm, social, admin] = cols;

        copy[targetIndex] = {
          ...copy[targetIndex],
          am: am ?? copy[targetIndex].am,
          pm: pm ?? copy[targetIndex].pm,
          social: social ?? copy[targetIndex].social,
          admin: admin ?? copy[targetIndex].admin,
        };
      });

      return copy;
    });
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: HoursField
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();

      // Shift+Enter = go up, Enter = go down
      const direction = e.shiftKey ? -1 : 1;
      const nextRow = rowIndex + direction;

      if (nextRow < 0 || nextRow >= days.length) return;

      const nextKey = `${nextRow}-${field}`;
      const nextEl = inputRefs.current[nextKey];

      if (nextEl) {
        nextEl.focus();
        nextEl.select();

        // 🔸 Move the selection highlight to the new cell
        setSelection({
          field,
          startRow: nextRow,
          endRow: nextRow,
        });
      }
    }
  };

  const handleCellMouseDown = (
    e: React.MouseEvent<HTMLInputElement>,
    rowIndex: number,
    field: HoursField
  ) => {
    // If we start a click with Shift held, remember that
    isShiftMouseDownRef.current = e.shiftKey;
  };

  const handleCellMouseUp = () => {
    // Reset after mouse interaction
    isShiftMouseDownRef.current = false;
  };

  // Recalculate days when month changes
  const handleMonthChange = (value: string) => {
    setMonth(value);
    if (!value) {
      setDays([]);
      return;
    }
    setDays(generateDays(value));
  };

  const handleDayChange = (
    index: number,
    field: keyof Omit<DayEntry, "day">,
    value: string
  ) => {
    setDays((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const totalHours = useMemo(() => {
    return days.reduce((sum, d) => {
      const dayTotal =
        parseHours(d.am) +
        parseHours(d.pm) +
        parseHours(d.social) +
        parseHours(d.admin);
      return sum + dayTotal;
    }, 0);
  }, [days]);

  const validateForm = (): boolean => {
    const validationErrors: string[] = [];

    if (!teacherName.trim()) {
      validationErrors.push("Teacher name is required.");
    }

    if (!teacherEmail.trim()) {
      validationErrors.push("Teacher email is required.");
    } else if (!teacherEmail.includes("@")) {
      validationErrors.push("Teacher email looks invalid.");
    }

    if (!month) {
      validationErrors.push("Month is required.");
    }

    // Optional: validate hour entries are non-negative numbers
    days.forEach((d) => {
      const fields: (keyof Omit<DayEntry, "day">)[] = [
        "am",
        "pm",
        "social",
        "admin",
      ];
      fields.forEach((field) => {
        const raw = d[field];
        if (raw === "") return; // treat empty as 0
        const num = parseFloat(raw);
        if (Number.isNaN(num) || num < 0) {
          validationErrors.push(
            `Invalid value in day ${d.day} (${field.toUpperCase()} hours).`
          );
        }
      });
    });

    setErrors(validationErrors);
    setSuccessMessage("");

    return validationErrors.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    setErrors([]);
    setSuccessMessage("");

    const payload = {
      teacherName: teacherName.trim(),
      teacherEmail: teacherEmail.trim(),
      month,
      notes,
      totalHours,
      days: days.map((d) => ({
        day: d.day,
        am: parseHours(d.am),
        pm: parseHours(d.pm),
        social: parseHours(d.social),
        admin: parseHours(d.admin),
      })),
    };

    try {
      const res = await fetch("/api/submit-timesheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message =
          data?.message || "Failed to submit timesheet. Please try again.";
        setErrors([message]);
      } else {
        setSuccessMessage("Timesheet submitted successfully.");
        // Optional: clear the form
        setTeacherName("");
        setTeacherEmail("");
        setNotes("");
        setMonth(initialMonth);
        setDays(generateDays(initialMonth));
      }
    } catch (err) {
      console.error(err);
      setErrors([
        "An unexpected error occurred while submitting the timesheet.",
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white shadow-md rounded-lg p-6 space-y-4">
        <h1 className="text-2xl font-semibold mb-4">Monthly Timesheet</h1>

        {/* Instructions box */}
        <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold mb-1">How to use this timesheet</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Enter your{" "}
              <span className="font-medium">name, email, and month</span> at the
              top. Hours can be decimals (e.g. <code>1.5</code>).
            </li>
            <li>
              <span className="font-medium">Enter / Shift+Enter:</span> move to
              the cell below / above in the same column.
            </li>
            <li>
              <span className="font-medium">Tab / Shift+Tab:</span> move to the
              next / previous cell across the row (standard browser behaviour).
            </li>
            <li>
              <span className="font-medium">Click</span> a cell to select it.
              <span className="font-medium">Shift+click</span> another cell in
              the same column to select a range. Selected cells are highlighted
              in yellow.
            </li>
            <li>
              Paste a <span className="font-medium">single value</span> (e.g.{" "}
              <code>2</code>) into a selected range to fill all selected cells
              with that value.
            </li>
            <li>
              Paste from <span className="font-medium">Excel</span> (multiple
              rows / columns) into the first cell to fill several days at once
              (AM / PM / Social / Admin).
            </li>
            <li>
              When finished, click{" "}
              <span className="font-medium">
                &ldquo;Submit timesheet&rdquo;
              </span>
              . You’ll see a confirmation message if it was sent successfully.
            </li>
          </ul>
        </div>

        {/* Form */}
        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Top fields */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">
                Teacher name *
              </label>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Teacher email *
              </label>
              <input
                type="email"
                value={teacherEmail}
                onChange={(e) => setTeacherEmail(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Month (YYYY-MM) *
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                rows={2}
              />
            </div>
          </div>

          {/* Days table */}
          {month && days.length > 0 && (
            <div
              ref={tableContainerRef}
              className="overflow-x-auto"
              tabIndex={-1}
              onBlur={handleTableBlur}
            >
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-2 py-1 text-left">Day</th>
                    <th className="border px-2 py-1 text-left">Weekday</th>{" "}
                    <th className="border px-2 py-1 text-right">AM hours</th>
                    <th className="border px-2 py-1 text-right">PM hours</th>
                    <th className="border px-2 py-1 text-right">
                      Social hours
                    </th>
                    <th className="border px-2 py-1 text-right">Admin hours</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d, idx) => {
                    const weekend = isWeekend(month, d.day);
                    const rowClass = weekend ? "bg-red-50" : "";

                    // selection highlighting (optional; keep if you added selection earlier)
                    const isSelected = (field: HoursField) =>
                      selection &&
                      selection.field === field &&
                      idx >= Math.min(selection.startRow, selection.endRow) &&
                      idx <= Math.max(selection.startRow, selection.endRow);

                    return (
                      <tr key={d.day} className={rowClass}>
                        <td className="border px-2 py-1">{d.day}</td>
                        <td className="border px-2 py-1">
                          {getWeekdayName(month, d.day)}
                        </td>

                        {/* AM */}
                        <td
                          className={
                            "border px-2 py-1 text-right " +
                            (isSelected("am") ? "bg-yellow-100" : "")
                          }
                        >
                          <input
                            id={`hours-${idx}-am`}
                            type="number"
                            min="0"
                            step="0.25"
                            value={d.am}
                            onChange={(e) =>
                              handleDayChange(idx, "am", e.target.value)
                            }
                            onClick={(e) => handleCellClick(e, idx, "am")}
                            onPaste={(e) => handlePaste(e, idx, "am")}
                            onFocus={() => handleCellFocus(idx, "am")}
                            onMouseDown={(e) =>
                              handleCellMouseDown(e, idx, "am")
                            }
                            onMouseUp={handleCellMouseUp}
                            onKeyDown={(e) => handleKeyDown(e, idx, "am")}
                            ref={(el) => {
                              inputRefs.current[`${idx}-am`] = el;
                            }}
                            className="w-full text-right border rounded px-1 py-0.5"
                          />
                        </td>

                        {/* PM */}
                        <td
                          className={
                            "border px-2 py-1 text-right " +
                            (isSelected("pm") ? "bg-yellow-100" : "")
                          }
                        >
                          <input
                            id={`hours-${idx}-pm`}
                            type="number"
                            min="0"
                            step="0.25"
                            value={d.pm}
                            onChange={(e) =>
                              handleDayChange(idx, "pm", e.target.value)
                            }
                            onClick={(e) => handleCellClick(e, idx, "pm")}
                            onPaste={(e) => handlePaste(e, idx, "pm")}
                            onFocus={() => handleCellFocus(idx, "pm")}
                            onKeyDown={(e) => handleKeyDown(e, idx, "pm")}
                            ref={(el) => {
                              inputRefs.current[`${idx}-pm`] = el;
                            }}
                            className="w-full text-right border rounded px-1 py-0.5"
                          />
                        </td>

                        {/* Social */}
                        <td
                          className={
                            "border px-2 py-1 text-right " +
                            (isSelected("social") ? "bg-yellow-100" : "")
                          }
                        >
                          <input
                            id={`hours-${idx}-social`}
                            type="number"
                            min="0"
                            step="0.25"
                            value={d.social}
                            onChange={(e) =>
                              handleDayChange(idx, "social", e.target.value)
                            }
                            onClick={(e) => handleCellClick(e, idx, "social")}
                            onPaste={(e) => handlePaste(e, idx, "social")}
                            onFocus={() => handleCellFocus(idx, "social")}
                            onKeyDown={(e) => handleKeyDown(e, idx, "social")}
                            ref={(el) => {
                              inputRefs.current[`${idx}-social`] = el;
                            }}
                            className="w-full text-right border rounded px-1 py-0.5"
                          />
                        </td>

                        {/* Admin */}
                        <td
                          className={
                            "border px-2 py-1 text-right " +
                            (isSelected("admin") ? "bg-yellow-100" : "")
                          }
                        >
                          <input
                            id={`hours-${idx}-admin`}
                            type="number"
                            min="0"
                            step="0.25"
                            value={d.admin}
                            onChange={(e) =>
                              handleDayChange(idx, "admin", e.target.value)
                            }
                            onClick={(e) => handleCellClick(e, idx, "admin")}
                            onPaste={(e) => handlePaste(e, idx, "admin")}
                            onFocus={() => handleCellFocus(idx, "admin")}
                            onKeyDown={(e) => handleKeyDown(e, idx, "admin")}
                            ref={(el) => {
                              inputRefs.current[`${idx}-admin`] = el;
                            }}
                            className="w-full text-right border rounded px-1 py-0.5"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary + errors + submit */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="text-sm font-medium">
              Total hours:{" "}
              <span className="font-semibold">{totalHours.toFixed(2)}</span>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
            >
              {isSubmitting ? "Submitting…" : "Submit timesheet"}
            </button>
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded p-3 space-y-1">
              {errors.map((err, idx) => (
                <div key={idx}>• {err}</div>
              ))}
            </div>
          )}

          {successMessage && (
            <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded p-3">
              {successMessage}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
