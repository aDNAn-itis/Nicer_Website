export function mjdToDate(mjd) {
    const JD = mjd + 2400000.5;

    const unixEpoch = JD - 2440587.5;

    const milliseconds = unixEpoch * 86400000;

    const date = new Date(milliseconds);

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;

    const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];
    const monthName = months[date.getUTCMonth()];

    const day = date.getUTCDate();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();

    return {
        year: year,
        month: monthName,
        day: day,
        hours: hours,
        minutes: minutes,
        seconds: seconds,
        formatted: `${month.toString().padStart(2, '0')}/${day
            .toString()
            .padStart(2, '0')}/${year}`,
        fullFormatted: `${year}-${month.toString().padStart(2, '0')}-${day
            .toString()
            .padStart(2, '0')} ${hours.toString().padStart(2, '0')}:${minutes
                .toString()
                .padStart(2, '0')}:${seconds.toString().padStart(2, '0')} UTC`,
        formattedWithoutSeconds: `${monthName} ${day}, ${year}`,
    };
}