using backend.Models;

namespace backend.Services;

public static class EnergyCalculator
{
    // Mifflin-St Jeor.
    public static double Bmr(Sex sex, double weightKg, double heightCm, int ageYears) =>
        10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex == Sex.Male ? 5 : -161);

    public static int AgeAt(DateOnly birthDate, DateOnly date)
    {
        var age = date.Year - birthDate.Year;
        if (date < birthDate.AddYears(age)) age--;
        return age;
    }

    public static double Tdee(Profile p, double weightKg, DateOnly date) =>
        Bmr(p.Sex, weightKg, p.HeightCm, AgeAt(p.BirthDate, date)) * p.ActivityFactor;

    // Below this the watch was most likely not worn and Fitbit only reports its BMR estimate.
    public const int MinWornSteps = 1000;
    public const int WearableAverageDays = 14;
    private const int MinWearableDays = 3;

    /// <summary>Only completed days where the watch was worn are trusted.</summary>
    public static bool IsReliable(DailyEnergy e, DateOnly today) => e.Date < today && e.Steps >= MinWornSteps;

    /// <summary>Average measured burn over recent completed days, or null if too few days are available.</summary>
    public static double? WearableAverage(IEnumerable<DailyEnergy> energies, DateOnly today)
    {
        var days = energies
            .Where(e => IsReliable(e, today) && e.Date >= today.AddDays(-WearableAverageDays))
            .ToList();
        return days.Count >= MinWearableDays ? days.Average(e => e.CaloriesOut) : null;
    }

    /// <summary>
    /// Completed days return the measured burn. Today adds resting burn for the remaining minutes and
    /// never drops below a typical day, so the target isn't punishingly low early in the morning.
    /// </summary>
    public static double ProjectDay(DailyEnergy e, double? bmr, double? typicalDay, DateTime now)
    {
        if (e.Date < DateOnly.FromDateTime(now)) return e.CaloriesOut;
        var minutesLeft = Math.Max(0, (now.Date.AddDays(1) - now).TotalMinutes);
        var projected = e.CaloriesOut + (bmr ?? 0) / 1440 * minutesLeft;
        return Math.Max(projected, typicalDay ?? 0);
    }
}
