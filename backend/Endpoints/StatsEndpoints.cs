using backend.Auth;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.EntityFrameworkCore;

namespace backend.Endpoints;

public record DayStats(DateOnly Date, bool Logged, Nutrients Intake, double? WeightKg, double? Tdee, string? TdeeSource, double? Balance);

public record StatsTotals(int LoggedDays, double AvgKcal, double AvgProtein, double TotalBalance, double EstimatedKgChange);

public record StatsDto(List<DayStats> Days, StatsTotals Totals);

public record SkippedDayDto(DateOnly Date, bool IsSkipped);

public static class StatsEndpoints
{
    private const double KcalPerKg = 7700;

    public static void MapStatsEndpoints(this WebApplication app)
    {
        var skippedDays = app.MapGroup("/api/skipped-days").RequireAuthorization(Policies.AppUser);

        skippedDays.MapGet("/{date}", async (DateOnly date, AppDbContext db, ICurrentUser user) =>
        {
            var skipped = await db.SkippedDays.AsNoTracking().AnyAsync(s => s.UserId == user.UserId && s.Date == date);
            return Results.Ok(skipped);
        });

        skippedDays.MapPost("/{date}", async (DateOnly date, AppDbContext db, ICurrentUser user) =>
        {
            var exists = await db.SkippedDays.AnyAsync(s => s.UserId == user.UserId && s.Date == date);
            if (!exists)
            {
                db.SkippedDays.Add(new SkippedDay { UserId = user.UserId, Date = date });
                await db.SaveChangesAsync();
            }
            return Results.Ok();
        });

        skippedDays.MapDelete("/{date}", async (DateOnly date, AppDbContext db, ICurrentUser user) =>
        {
            var skipped = await db.SkippedDays.FirstOrDefaultAsync(s => s.UserId == user.UserId && s.Date == date);
            if (skipped is null) return Results.NotFound();
            db.SkippedDays.Remove(skipped);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        app.MapGet("/api/stats", async (DateOnly from, DateOnly to, AppDbContext db, ICurrentUser user, HealthSyncService wearable, CancellationToken ct) =>
        {
            if (to < from || to.DayNumber - from.DayNumber > LogEndpoints.MaxRangeDays)
                return Results.BadRequest(new { error = "Ugyldig intervall." });

            var uid = user.UserId;
            await wearable.SyncAsync(uid, force: false, ct);
            var today = DateOnly.FromDateTime(DateTime.Today);
            var profile = await db.Profiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == uid);
            var weights = await db.WeightEntries.AsNoTracking()
                .Where(w => w.UserId == uid && w.Date <= to)
                .OrderBy(w => w.Date)
                .ToListAsync();
            var entries = await db.LogEntries.AsNoTracking()
                .Where(e => e.UserId == uid && e.Date >= from && e.Date <= to)
                .ToListAsync();
            var skippedDates = await db.SkippedDays.AsNoTracking()
                .Where(s => s.UserId == uid && s.Date >= from && s.Date <= to)
                .Select(s => s.Date)
                .ToHashSetAsync();
            var byDate = entries.ToLookup(e => e.Date);
            var energy = await db.DailyEnergies.AsNoTracking()
                .Where(e => e.UserId == uid && e.Date >= from && e.Date <= to)
                .ToDictionaryAsync(e => e.Date);

            var days = new List<DayStats>();
            for (var d = from; d <= to; d = d.AddDays(1))
            {
                var skipped = skippedDates.Contains(d);
                var dayEntries = byDate[d].ToList();
                var intake = skipped ? new Nutrients() : Sum(dayEntries.Select(e => e.Nutrients));
                // Latest weigh-in on or before the day; fall back to the first one ever.
                var weight = weights.LastOrDefault(w => w.Date <= d)?.WeightKg ?? weights.FirstOrDefault()?.WeightKg;
                double? tdee;
                string? source;
                if (skipped)
                {
                    tdee = null;
                    source = null;
                }
                else if (energy.TryGetValue(d, out var measured) && EnergyCalculator.IsReliable(measured, today))
                {
                    tdee = Math.Round(measured.CaloriesOut);
                    source = measured.Source;
                }
                else
                {
                    tdee = profile is not null && weight is not null ? Math.Round(EnergyCalculator.Tdee(profile, weight.Value, d)) : null;
                    source = tdee is null ? null : "Formula";
                }
                var logged = dayEntries.Count > 0 && !skipped;
                double? balance = logged && tdee is not null ? Math.Round(intake.Kcal - tdee.Value) : null;
                days.Add(new DayStats(d, logged, intake, weights.FirstOrDefault(w => w.Date == d)?.WeightKg, tdee, source, balance));
            }

            var loggedDays = days.Where(x => x.Logged).ToList();
            var totalBalance = days.Sum(x => x.Balance ?? 0);
            var totals = new StatsTotals(
                loggedDays.Count,
                loggedDays.Count > 0 ? Math.Round(loggedDays.Average(x => x.Intake.Kcal)) : 0,
                loggedDays.Count > 0 ? Math.Round(loggedDays.Average(x => x.Intake.Protein), 1) : 0,
                totalBalance,
                Math.Round(totalBalance / KcalPerKg, 2));

            return Results.Ok(new StatsDto(days, totals));
        }).RequireAuthorization(Policies.AppUser);
    }

    private static Nutrients Sum(IEnumerable<Nutrients> items)
    {
        var s = new Nutrients();
        foreach (var n in items)
        {
            s.Kcal += n.Kcal; s.Protein += n.Protein; s.Carbs += n.Carbs; s.Fat += n.Fat;
            s.SaturatedFat += n.SaturatedFat; s.Sugar += n.Sugar; s.Fiber += n.Fiber; s.Salt += n.Salt;
        }
        return s;
    }
}
