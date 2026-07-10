const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fourteen: 14,
  fifteen: 15,
  thirty: 30,
};

export type MedicationCourse = {
  courseStartDate: string | null;
  courseEndDate: string | null;
  courseDurationText: string | null;
};

export function toDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  if (Number.isNaN(value.getTime())) return null;
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function todayDateOnly() {
  return toDateOnly(new Date())!;
}

export function isCourseExpired(courseEndDate: string | null | undefined, today = todayDateOnly()) {
  return !!courseEndDate && courseEndDate < today;
}

export function derivePrescriptionCourse(
  prescribedAt: Date,
  durationText: string | null | undefined
): MedicationCourse {
  const courseStartDate = toDateOnly(prescribedAt);
  const courseDurationText = durationText?.trim() || null;
  const parsed = courseStartDate && courseDurationText ? parseDuration(courseDurationText) : null;
  const courseEndDate =
    courseStartDate && parsed ? addDuration(courseStartDate, parsed.amount, parsed.unit) : null;
  return {
    courseStartDate,
    courseEndDate,
    courseDurationText,
  };
}

function parseDuration(text: string): { amount: number; unit: "day" | "week" | "month" } | null {
  const normalized = text.toLowerCase().replace(/[-_]/g, " ");
  const match = normalized.match(
    /\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|thirty)\s*(day|days|d|week|weeks|wk|wks|month|months|mo|mos)\b/
  );
  if (!match) return null;

  const rawAmount = match[1];
  const amount = rawAmount in NUMBER_WORDS ? NUMBER_WORDS[rawAmount] : Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const rawUnit = match[2];
  if (rawUnit.startsWith("w")) return { amount, unit: "week" };
  if (rawUnit.startsWith("m")) return { amount, unit: "month" };
  return { amount, unit: "day" };
}

function addDuration(startDate: string, amount: number, unit: "day" | "week" | "month") {
  const date = new Date(`${startDate}T00:00:00`);
  if (unit === "month") {
    date.setMonth(date.getMonth() + amount);
  } else {
    date.setDate(date.getDate() + amount * (unit === "week" ? 7 : 1));
  }
  return toDateOnly(date);
}
