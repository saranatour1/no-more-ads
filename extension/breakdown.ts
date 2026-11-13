/**
 * The last 7 days in local time: the midnights that bound them (oldest first,
 * ending with tomorrow's) and a label for each day.
 */
export function lastDays(now = Date.now()) {
  const starts = Array.from({ length: 8 }, (_, i) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - 6 + i);
    return date.getTime();
  });
  const labels = starts
    .slice(0, 7)
    .map((start, i) =>
      i === 6 ? "Today" : new Date(start).toLocaleDateString(undefined, { weekday: "long" }),
    );
  return { starts, labels };
}
