const DAY_MS = 24 * 60 * 60 * 1000;

export type CycleRecord = {
  id: string;
  installationId: string;
  startedAt: string;
  durationMonths: number;
  dueAt: string;
  status: "active" | "closed";
};

export type Notice = {
  id: string;
  severity: "info" | "warning" | "critical";
  frequency:
    | "once_in_final_14_days"
    | "daily_in_final_7_days"
    | "each_open_after_expiry";
  title: string;
  message: string;
  closable: boolean;
  requires_consent: boolean;
  countdown_seconds: number;
};

export function randomUint32(): Uint32Array {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addCalendarMonths(start: Date, months: number): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const day = Math.min(start.getUTCDate(), daysInMonth(targetYear, targetMonth));
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

export class CyclePolicy {
  chooseDurationMonths(): number {
    const random = randomUint32();
    return 2 + (random[0] % 5); // 2 to 6 months
  }

  evaluate(
    now: Date,
    cycle: CycleRecord | null,
    eventsToday: string[],
    contactName: string,
  ): Notice | null {
    if (!cycle || cycle.status !== "active") return null;
    const remaining = Date.parse(cycle.dueAt) - now.getTime();
    const base = {
      id: `cycle-${cycle.id}`,
      title: "Mantenimiento de SIDC",
      closable: true,
      requires_consent: false,
      countdown_seconds: 0,
    } as const;

    if (remaining <= 0) {
      return {
        ...base,
        id: `expired-${cycle.id}`,
        severity: "critical",
        frequency: "each_open_after_expiry",
        message: `El mantenimiento está vencido. Contacta con ${contactName}.`,
        closable: false,
        requires_consent: true,
        countdown_seconds: 5,
      };
    }

    if (remaining > 14 * DAY_MS) return null;
    if (remaining > 7 * DAY_MS) {
      if (eventsToday.includes("notice:final_14_days")) return null;
      return {
        ...base,
        id: `final-14-${cycle.id}`,
        severity: "info",
        frequency: "once_in_final_14_days",
        message: `El mantenimiento vencerá el ${new Date(cycle.dueAt).toLocaleDateString("es-ES")}.`,
      };
    }

    // Last 7 days
    if (eventsToday.includes("notice:final_7_days")) return null;
    const daysLeft = Math.max(1, Math.ceil(remaining / DAY_MS));
    return {
      ...base,
      id: `final-7-${cycle.id}`,
      severity: "warning",
      frequency: "daily_in_final_7_days",
      message: `El mantenimiento vencerá en ${daysLeft} día(s). Coordina con ${contactName}.`,
    };
  }
}

export const cyclePolicy = new CyclePolicy();
