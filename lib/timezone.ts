export type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
};

export type AvailabilityWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type BlockedDateWindow = {
  date: string;
  resourceId: string | null;
};

export type AvailabilityValidationResult =
  | { valid: true }
  | { valid: false; reason: "INVALID_SLOT" | "BLOCKED_DATE" | "OUTSIDE_AVAILABILITY" };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "iso8601",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function isIanaTimeZone(timeZone: string) {
  try {
    getFormatter(timeZone).format(new Date());
    return true;
  } catch {
    formatterCache.delete(timeZone);
    return false;
  }
}

export function utcToZonedParts(value: Date | string, timeZone: string): ZonedDateTimeParts {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("La fecha UTC no es válida.");

  const values: Record<string, number> = {};
  for (const part of getFormatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  const year = values.year;
  const month = values.month;
  const day = values.day;
  const localDateAsUtc = new Date(Date.UTC(year, month - 1, day));

  return {
    year,
    month,
    day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    dayOfWeek: localDateAsUtc.getUTCDay(),
  };
}

export function zonedDateTimeToUtc(
  parts: Omit<ZonedDateTimeParts, "dayOfWeek">,
  timeZone: string,
) {
  if (!isIanaTimeZone(timeZone)) throw new Error("La zona horaria IANA no es válida.");
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let candidate = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = utcToZonedParts(new Date(candidate), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const difference = target - actualAsUtc;
    if (difference === 0) break;
    candidate += difference;
  }

  const result = new Date(candidate);
  const verified = utcToZonedParts(result, timeZone);
  const matches = (["year", "month", "day", "hour", "minute", "second"] as const).every(
    (key) => verified[key] === parts[key],
  );
  if (!matches) throw new Error("La hora local no existe en esa zona horaria por un cambio de DST.");
  return result;
}

export function localDateTimeStringToUtc(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("La fecha y hora local no tienen un formato válido.");
  const parts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: 0,
  };
  const calendarCheck = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  if (
    calendarCheck.getUTCFullYear() !== parts.year || calendarCheck.getUTCMonth() + 1 !== parts.month ||
    calendarCheck.getUTCDate() !== parts.day || parts.hour > 23 || parts.minute > 59
  ) throw new Error("La fecha y hora local no son válidas.");
  return zonedDateTimeToUtc(parts, timeZone);
}

export function formatUtcInTimeZone(value: Date | string, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(date);
}

export function localDateKey(parts: Pick<ZonedDateTimeParts, "year" | "month" | "day">) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function utcToLocalDateKey(value: Date | string, timeZone: string) {
  return localDateKey(utcToZonedParts(value, timeZone));
}

export function timeStringToSeconds(value: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error("La hora debe tener formato HH:mm.");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new Error("La hora no es válida.");
  return hour * 3600 + minute * 60 + second;
}

export function timeStringToDatabaseDate(value: string) {
  timeStringToSeconds(value);
  return new Date(`1970-01-01T${value.length === 5 ? `${value}:00` : value}.000Z`);
}

export function databaseTimeToString(value: Date) {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

export function localDateStringToDatabaseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("La fecha debe tener formato YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("La fecha no es válida.");
  return date;
}

export function databaseDateToLocalDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function validateSlotAvailability(input: {
  startDateTime: Date | string;
  endDateTime: Date | string;
  timeZone: string;
  resourceId: string;
  availabilityRules: AvailabilityWindow[];
  blockedDates: BlockedDateWindow[];
}): AvailabilityValidationResult {
  const start = input.startDateTime instanceof Date ? input.startDateTime : new Date(input.startDateTime);
  const end = input.endDateTime instanceof Date ? input.endDateTime : new Date(input.endDateTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return { valid: false, reason: "INVALID_SLOT" };

  const localStart = utcToZonedParts(start, input.timeZone);
  const localEnd = utcToZonedParts(end, input.timeZone);
  const dateKey = localDateKey(localStart);
  if (localDateKey(localEnd) !== dateKey) return { valid: false, reason: "OUTSIDE_AVAILABILITY" };

  const blocked = input.blockedDates.some(
    (item) => item.date === dateKey && (item.resourceId === null || item.resourceId === input.resourceId),
  );
  if (blocked) return { valid: false, reason: "BLOCKED_DATE" };

  const startSecond = localStart.hour * 3600 + localStart.minute * 60 + localStart.second;
  const endSecond = localEnd.hour * 3600 + localEnd.minute * 60 + localEnd.second;
  const insideRule = input.availabilityRules.some(
    (rule) =>
      rule.dayOfWeek === localStart.dayOfWeek &&
      startSecond >= timeStringToSeconds(rule.startTime) &&
      endSecond <= timeStringToSeconds(rule.endTime),
  );

  return insideRule ? { valid: true } : { valid: false, reason: "OUTSIDE_AVAILABILITY" };
}
