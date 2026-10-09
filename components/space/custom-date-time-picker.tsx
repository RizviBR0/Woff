"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CustomDateTimePickerProps {
  initialDate?: string | null;
  onApply: (isoString: string) => Promise<void> | void;
  isBusy?: boolean;
}

export function CustomDateTimePicker({
  initialDate,
  onApply,
  isBusy = false,
}: CustomDateTimePickerProps) {
  // Parse initial or default to tomorrow at 18:00
  const defaultDate = useMemo(() => {
    if (initialDate) {
      const parsed = new Date(initialDate);
      if (Number.isFinite(parsed.getTime()) && parsed.getTime() > Date.now()) {
        return parsed;
      }
    }
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
    return d;
  }, [initialDate]);

  // Selected date parts
  const [selectedYear, setSelectedYear] = useState(() => defaultDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(() => defaultDate.getMonth());
  const [selectedDay, setSelectedDay] = useState(() => defaultDate.getDate());

  // Month being viewed in the calendar
  const [viewYear, setViewYear] = useState(() => defaultDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => defaultDate.getMonth());

  // Time state (12-hour format)
  const [hour12, setHour12] = useState(() => {
    const h = defaultDate.getHours() % 12;
    return h === 0 ? 12 : h;
  });
  const [minute, setMinute] = useState(() => {
    const m = defaultDate.getMinutes();
    if (m < 8) return 0;
    if (m < 23) return 15;
    if (m < 38) return 30;
    if (m < 53) return 45;
    return 0;
  });
  const [ampm, setAmPm] = useState<"AM" | "PM">(() => (defaultDate.getHours() >= 12 ? "PM" : "AM"));

  // Calculate today
  const today = useMemo(() => new Date(), []);
  const todayStart = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(),
    [today]
  );

  // Month navigation boundaries
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const handlePrevMonth = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Calendar matrix calculation
  const { monthName, days } = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevMonthTotalDays = new Date(viewYear, viewMonth, 0).getDate();

    const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    const dayCells: Array<{
      day: number;
      isCurrentMonth: boolean;
      isPast: boolean;
      isToday: boolean;
      isSelected: boolean;
      timestamp: number;
    }> = [];

    // Leading padding from previous month
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i;
      dayCells.push({
        day: d,
        isCurrentMonth: false,
        isPast: true,
        isToday: false,
        isSelected: false,
        timestamp: 0,
      });
    }

    // Days in current month
    for (let d = 1; d <= totalDays; d++) {
      const cellTimestamp = new Date(viewYear, viewMonth, d).getTime();
      const isPast = cellTimestamp < todayStart;
      const isToday =
        viewYear === today.getFullYear() && viewMonth === today.getMonth() && d === today.getDate();
      const isSelected =
        viewYear === selectedYear && viewMonth === selectedMonth && d === selectedDay;

      dayCells.push({
        day: d,
        isCurrentMonth: true,
        isPast,
        isToday,
        isSelected,
        timestamp: cellTimestamp,
      });
    }

    // Trailing padding to complete grid
    const remaining = (7 - (dayCells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      dayCells.push({
        day: i,
        isCurrentMonth: false,
        isPast: false,
        isToday: false,
        isSelected: false,
        timestamp: 0,
      });
    }

    return { monthName: monthLabel, days: dayCells };
  }, [viewYear, viewMonth, selectedYear, selectedMonth, selectedDay, todayStart, today]);

  // Compute final chosen date & time
  const computedDate = useMemo(() => {
    const result = new Date(selectedYear, selectedMonth, selectedDay);
    let h = hour12 % 12;
    if (ampm === "PM") h += 12;
    result.setHours(h, minute, 0, 0);
    return result;
  }, [selectedYear, selectedMonth, selectedDay, hour12, minute, ampm]);

  // Validation & relative duration
  const { isPast, summaryText, relativeText } = useMemo(() => {
    const now = Date.now();
    const diffMs = computedDate.getTime() - now;
    const past = diffMs <= 0;

    const dateStr = computedDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeStr = computedDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    if (past) {
      return {
        isPast: true,
        summaryText: `${dateStr} at ${timeStr}`,
        relativeText: "Time has already passed. Please select a future time.",
      };
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remHours = diffHours % 24;

    let rel = "";
    if (diffDays > 0) {
      rel = `in ${diffDays} day${diffDays > 1 ? "s" : ""}${remHours > 0 ? `, ${remHours} hr${remHours > 1 ? "s" : ""}` : ""}`;
    } else if (diffHours > 0) {
      rel = `in ${diffHours} hour${diffHours > 1 ? "s" : ""}`;
    } else {
      const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      rel = `in ${diffMins} min${diffMins > 1 ? "s" : ""}`;
    }

    return {
      isPast: false,
      summaryText: `${dateStr} at ${timeStr}`,
      relativeText: rel,
    };
  }, [computedDate]);

  // Quick shortcut helper
  const handleShortcut = (daysToAdd: number, targetHour: number = 18) => {
    const d = new Date();
    d.setDate(d.getDate() + daysToAdd);
    setSelectedYear(d.getFullYear());
    setSelectedMonth(d.getMonth());
    setSelectedDay(d.getDate());
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setHour12(targetHour > 12 ? targetHour - 12 : targetHour === 0 ? 12 : targetHour);
    setMinute(0);
    setAmPm(targetHour >= 12 ? "PM" : "AM");
  };

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/60 p-3 sm:p-4 dark:border-white/[0.07] dark:bg-white/[0.02]">
      {/* Quick shortcuts */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleShortcut(1, 18)}
          className="min-h-9 rounded-lg border border-border/70 bg-transparent px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-orange-500/40 hover:bg-orange-500/5 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:opacity-50 sm:text-[11px] dark:hover:text-orange-400"
        >
          Tomorrow 6 PM
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleShortcut(3, 18)}
          className="min-h-9 rounded-lg border border-border/70 bg-transparent px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-orange-500/40 hover:bg-orange-500/5 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:opacity-50 sm:text-[11px] dark:hover:text-orange-400"
        >
          In 3 days
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleShortcut(7, 18)}
          className="min-h-9 rounded-lg border border-border/70 bg-transparent px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-orange-500/40 hover:bg-orange-500/5 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:opacity-50 sm:text-[11px] dark:hover:text-orange-400"
        >
          In 1 week
        </button>
      </div>

      {/* Calendar Header: Month navigation */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <span aria-live="polite" className="text-[13px] font-semibold tracking-tight text-foreground">{monthName}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handlePrevMonth}
            disabled={isCurrentMonth || isBusy}
            aria-label="Previous month"
            className="h-8 w-8 rounded-lg bg-transparent text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleNextMonth}
            disabled={isBusy}
            aria-label="Next month"
            className="h-8 w-8 rounded-lg bg-transparent text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day of Week Labels */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((dayName) => (
          <div key={dayName} className="py-0.5">
            {dayName}
          </div>
        ))}
      </div>

      {/* Calendar Day Grid */}
      <div role="group" aria-label="Choose a closing date" className="grid grid-cols-7 gap-1">
        {days.map((cell, idx) => {
          if (!cell.isCurrentMonth) {
            return (
              <div
                key={`pad-${idx}`}
                className="flex h-8 items-center justify-center text-xs text-muted-foreground/25 select-none"
              >
                {cell.day}
              </div>
            );
          }

          if (cell.isPast) {
            return (
              <div
                key={`past-${cell.day}`}
                className="flex h-8 items-center justify-center text-xs text-muted-foreground/35 select-none cursor-not-allowed"
                title="Date is in the past"
              >
                {cell.day}
              </div>
            );
          }

          const isSelected = cell.isSelected;
          const isToday = cell.isToday;

          return (
            <button
              key={`day-${cell.day}`}
              type="button"
              disabled={isBusy}
              aria-label={new Date(viewYear, viewMonth, cell.day).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              onClick={() => {
                setSelectedYear(viewYear);
                setSelectedMonth(viewMonth);
                setSelectedDay(cell.day);
              }}
              className={`relative flex h-8 w-full items-center justify-center rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:opacity-50 ${
                isSelected
                  ? "bg-[#ff5a00] font-semibold text-white shadow-sm"
                  : isToday
                  ? "bg-orange-500/[0.08] font-semibold text-orange-600 hover:bg-orange-500/15 dark:text-orange-400"
                  : "bg-transparent text-foreground hover:bg-zinc-200/80 dark:hover:bg-white/10"
              }`}
            >
              <span>{cell.day}</span>
              {isToday && !isSelected && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-orange-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Time Picker Controls */}
      <div className="border-t border-border/50 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Local time</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Hour select */}
            <select
              value={hour12}
              disabled={isBusy}
              onChange={(e) => setHour12(Number(e.target.value))}
              aria-label="Hour"
              className="h-9 cursor-pointer rounded-lg border border-border/80 bg-transparent px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/60"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h} className="bg-popover text-popover-foreground">
                  {String(h).padStart(2, "0")}
                </option>
              ))}
            </select>

            <span className="font-bold text-muted-foreground">:</span>

            {/* Minute select */}
            <select
              value={minute}
              disabled={isBusy}
              onChange={(e) => setMinute(Number(e.target.value))}
              aria-label="Minute"
              className="h-9 cursor-pointer rounded-lg border border-border/80 bg-transparent px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/60"
            >
              {[0, 15, 30, 45, 59].map((m) => (
                <option key={m} value={m} className="bg-popover text-popover-foreground">
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>

            {/* AM / PM Segmented Toggle */}
            <div role="group" aria-label="Time period" className="flex h-9 rounded-lg bg-muted/60 p-1 text-xs font-medium">
              <button
                type="button"
                disabled={isBusy}
                aria-pressed={ampm === "AM"}
                onClick={() => setAmPm("AM")}
                className={`rounded-md px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 ${
                  ampm === "AM"
                    ? "bg-white dark:bg-[#252529] text-foreground shadow-sm"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                AM
              </button>
              <button
                type="button"
                disabled={isBusy}
                aria-pressed={ampm === "PM"}
                onClick={() => setAmPm("PM")}
                className={`rounded-md px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 ${
                  ampm === "PM"
                    ? "bg-white dark:bg-[#252529] text-foreground shadow-sm"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                PM
              </button>
            </div>
          </div>
        </div>

        {/* Quick time shortcut chips */}
        <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setHour12(12);
              setMinute(0);
              setAmPm("PM");
            }}
            className="min-h-8 rounded-lg bg-transparent px-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:opacity-50"
          >
            Noon
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setHour12(6);
              setMinute(0);
              setAmPm("PM");
            }}
            className="min-h-8 rounded-lg bg-transparent px-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:opacity-50"
          >
            6 PM
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setHour12(11);
              setMinute(59);
              setAmPm("PM");
            }}
            className="min-h-8 rounded-lg bg-transparent px-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:opacity-50"
          >
            End of day
          </button>
        </div>
      </div>

      {/* Human Summary Banner */}
      <div
        aria-live="polite"
        className={`flex flex-col gap-1 rounded-xl p-3 text-xs ${
          isPast
            ? "border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
            : "bg-orange-500/[0.07] text-foreground"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <span className="flex items-start gap-1.5 text-[11px] font-medium leading-relaxed">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
            {isPast ? "Past date/time selected" : summaryText}
          </span>
          {!isPast && (
            <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
              {relativeText}
            </span>
          )}
        </div>
        {isPast && <p className="text-[11px] text-red-500/90">{relativeText}</p>}
      </div>

      {/* Apply Button */}
      <Button
        type="button"
        disabled={isPast || isBusy}
        onClick={() => void onApply(computedDate.toISOString())}
        className="h-10 w-full rounded-xl bg-[#ff5a00] text-xs font-semibold text-white hover:bg-[#e85100]"
      >
        {isBusy ? "Saving limit..." : "Apply this time limit"}
      </Button>
    </div>
  );
}
