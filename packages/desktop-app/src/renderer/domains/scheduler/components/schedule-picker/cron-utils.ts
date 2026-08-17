/**
 * Cron expression generation and parsing utilities for the schedule picker.
 *
 * Cron format (node-cron): minute hour day-of-month month day-of-week
 * Fields:
 *   minute      (0-59)
 *   hour        (0-23)
 *   day-of-month (1-31)
 *   month       (1-12)
 *   day-of-week (0-6, 0=Sunday)
 */

import type { TFunction } from "i18next";

export type ScheduleMode = "once" | "daily" | "weekly" | "interval";

export interface OnceSchedule {
	mode: "once";
	/** Year as integer, e.g. 2026 */
	year: number;
	/** Month as integer (1-12) */
	month: number;
	/** Day as integer (1-31) */
	day: number;
	/** Hour (0-23) */
	hour: number;
	/** Minute (0-59) */
	minute: number;
}

export interface DailySchedule {
	mode: "daily";
	/** Hour (0-23) */
	hour: number;
	/** Minute (0-59) */
	minute: number;
}

export interface WeeklySchedule {
	mode: "weekly";
	/** Set of weekdays (0=Sunday, 1=Monday, ..., 6=Saturday) */
	weekdays: Set<number>;
	/** Hour (0-23) */
	hour: number;
	/** Minute (0-59) */
	minute: number;
}

export interface IntervalSchedule {
	mode: "interval";
	/** Interval value in hours */
	intervalHours: number;
}

export type Schedule = OnceSchedule | DailySchedule | WeeklySchedule | IntervalSchedule;

/** Human-readable description of a schedule */
export function describeSchedule(schedule: Schedule, t: TFunction<"automation">): string {
	switch (schedule.mode) {
		case "once": {
			const timeStr = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
			return t("schedule.once", {
				year: schedule.year,
				month: schedule.month,
				day: schedule.day,
				time: timeStr,
			});
		}
		case "daily": {
			const timeStr = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
			return t("schedule.daily", { time: timeStr });
		}
		case "weekly": {
			const weekdayNames = t("schedule.weekdayNames", { returnObjects: true }) as string[];
			const sortedDays = [...schedule.weekdays].sort((a, b) => a - b);
			const dayStr =
				sortedDays.length === 1
					? weekdayNames[sortedDays[0]]
					: sortedDays.map((d) => weekdayNames[d]).join(t("schedule.weekdayJoin"));
			const timeStr = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
			return t("schedule.weekly", { days: dayStr, time: timeStr });
		}
		case "interval": {
			if (schedule.intervalHours === 1) return t("schedule.intervalOne");
			return t("schedule.interval", { hours: schedule.intervalHours });
		}
	}
}

/** Generate cron expression string from schedule */
export function toCronExpression(schedule: Schedule): string {
	switch (schedule.mode) {
		case "once":
			// node-cron does not support year field.
			// We use a 6-field cron: minute hour day month day-of-week
			// The task will fire once and then be disabled via isOnce flag.
			return `${schedule.minute} ${schedule.hour} ${schedule.day} ${schedule.month} *`;
		case "daily":
			return `${schedule.minute} ${schedule.hour} * * *`;
		case "weekly": {
			const sortedDays = [...schedule.weekdays].sort((a, b) => a - b).join(",");
			return `${schedule.minute} ${schedule.hour} * * ${sortedDays}`;
		}
		case "interval":
			// Every N hours at minute 0
			return `0 */${schedule.intervalHours} * * *`;
	}
}

/**
 * Parse a cron expression string into a Schedule.
 * Returns null if the expression cannot be parsed.
 */
export function parseCronExpression(cron: string, isOnce: boolean): Schedule | null {
	if (!cron || typeof cron !== "string") return null;

	const parts = cron.trim().split(/\s+/);
	if (parts.length < 5) return null;

	const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

	// Determine mode
	if (isOnce || (dayOfMonth !== "*" && month !== "*")) {
		// one-time: specific day and month
		const m = parseInt(month, 10);
		const d = parseInt(dayOfMonth, 10);
		if (Number.isNaN(m) || Number.isNaN(d)) return null;
		return {
			mode: "once",
			year: new Date().getFullYear(),
			month: m,
			day: d,
			hour: parseInt(hour, 10) || 0,
			minute: parseInt(minute, 10) || 0,
		};
	}

	if (hour.startsWith("*/")) {
		// interval: */N hour
		const intervalHours = parseInt(hour.slice(2), 10);
		if (Number.isNaN(intervalHours) || intervalHours < 1) return null;
		return { mode: "interval", intervalHours };
	}

	if (minute === "*/") {
		// interval: */N minute
		const intervalMinutes = parseInt(minute.slice(2), 10);
		if (Number.isNaN(intervalMinutes) || intervalMinutes < 1) return null;
		// Convert to hours (rounded up)
		const intervalHours = Math.ceil(60 / intervalMinutes);
		return { mode: "interval", intervalHours };
	}

	if (dayOfWeek !== "*" && dayOfWeek !== "?") {
		// weekly: specific weekday(s)
		const weekdays = new Set<number>();
		for (const part of dayOfWeek.split(",")) {
			const n = parseInt(part.trim(), 10);
			if (Number.isNaN(n) || n < 0 || n > 6) return null;
			weekdays.add(n);
		}
		if (weekdays.size === 0) return null;
		return {
			mode: "weekly",
			weekdays,
			hour: parseInt(hour, 10) || 0,
			minute: parseInt(minute, 10) || 0,
		};
	}

	// daily: every day at specific time
	return {
		mode: "daily",
		hour: parseInt(hour, 10) || 0,
		minute: parseInt(minute, 10) || 0,
	};
}

/** Get default schedule values for each mode */
export function getDefaultOnceSchedule(): OnceSchedule {
	const now = new Date();
	// Default to next hour (minimum non-past time)
	const next = new Date(now);
	next.setMinutes(next.getMinutes() + 1);
	next.setSeconds(0);
	next.setMilliseconds(0);
	// If we're at minute 59, go to next hour
	if (next.getMinutes() === 0 && now.getMinutes() > 0) {
		// Already set to next hour correctly
	}
	return {
		mode: "once",
		year: next.getFullYear(),
		month: next.getMonth() + 1,
		day: next.getDate(),
		hour: next.getHours(),
		minute: next.getMinutes(),
	};
}

export function getDefaultDailySchedule(): DailySchedule {
	return { mode: "daily", hour: 9, minute: 0 };
}

export function getDefaultWeeklySchedule(): WeeklySchedule {
	return { mode: "weekly", weekdays: new Set([1]), hour: 9, minute: 0 };
}

export function getDefaultIntervalSchedule(): IntervalSchedule {
	// Default to 2 hours so "custom" mode is active on first click,
	// allowing users to enter any interval value.
	return { mode: "interval", intervalHours: 2 };
}
