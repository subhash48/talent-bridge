import type { CandidateInterview } from "@/types/portal";

const FORMATS = { video: "Video call", phone: "Phone call", onsite: "On-site" } as const;

/** "20261004T150000Z", the iCalendar UTC form. */
function icsTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
}

/** An .ics file any calendar app can import. No calendar integration or account needed. */
export function interviewIcs(interview: CandidateInterview, company: string, now = new Date()): string {
  const start = new Date(interview.scheduledAt);
  const end = new Date(start.getTime() + interview.durationMinutes * 60_000);
  const details = [
    `${FORMATS[interview.format]}, ${interview.durationMinutes} minutes.`,
    interview.interviewers.length ? `With ${interview.interviewers.join(", ")}.` : null,
    interview.meetingUrl ? `Join: ${interview.meetingUrl}` : null,
  ].filter(Boolean);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Encord//Candidate Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${interview.id}@candidate-portal`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(`${interview.title} with ${company}`)}`,
    `DESCRIPTION:${icsText(details.join("\n"))}`,
    `LOCATION:${icsText(interview.meetingUrl ?? FORMATS[interview.format])}`,
    ...(interview.meetingUrl ? [`URL:${interview.meetingUrl}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

export function downloadInterviewIcs(interview: CandidateInterview, company: string): void {
  const url = URL.createObjectURL(new Blob([interviewIcs(interview, company)], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${interview.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "interview"}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
