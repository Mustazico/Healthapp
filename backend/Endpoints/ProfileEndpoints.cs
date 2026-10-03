using System.ComponentModel.DataAnnotations;
using backend.Auth;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.EntityFrameworkCore;

namespace backend.Endpoints;

public record ProfileInput(
    Sex Sex,
    DateOnly BirthDate,
    [Range(100, 250)] double HeightCm,
    [Range(1.1, 2.5)] double ActivityFactor,
    [Range(-1500, 1500)] double DeficitKcal,
    [Range(0, 4)] double ProteinPerKg);

/// <param name="TdeeSource">"Fitbit" when based on measured burn, "Formula" when estimated.</param>
public record ProfileDto(ProfileInput? Profile, double? LatestWeightKg, double? Bmr, double? Tdee, double? TargetKcal,
    double? ProteinTargetG, string? TdeeSource);

public record WeightInput([Range(20, 400)] double WeightKg);

public record WeightDto(DateOnly Date, double WeightKg);

/// <param name="ProjectedBurn">Measured burn for past days; for today, burn so far plus resting burn for the rest of the day.</param>
public record DayEnergyDto(DateOnly Date, bool Measured, double? BurnedSoFar, int? Steps, double? ProjectedBurn,
    double? TargetKcal, DateTime? UpdatedAt);

public static class ProfileEndpoints
{
    public static void MapProfileEndpoints(this WebApplication app)
    {
        var profile = app.MapGroup("/api/profile").RequireAuthorization(Policies.AppUser);

        profile.MapGet("/", async (AppDbContext db, ICurrentUser user, HealthSyncService wearable, CancellationToken ct) =>
        {
            await wearable.SyncAsync(user.UserId, force: false, ct);
            return await BuildDto(db, user.UserId);
        });

        profile.MapPut("/", async (ProfileInput input, AppDbContext db, ICurrentUser user) =>
        {
            var today = DateOnly.FromDateTime(DateTime.Today);
            var age = EnergyCalculator.AgeAt(input.BirthDate, today);
            if (age is < 10 or > 120) return Results.BadRequest(new { error = "Ugyldig fødselsdato." });

            var p = await db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.UserId);
            if (p is null)
            {
                p = new Profile { UserId = user.UserId };
                db.Profiles.Add(p);
            }
            p.Sex = input.Sex;
            p.BirthDate = input.BirthDate;
            p.HeightCm = input.HeightCm;
            p.ActivityFactor = input.ActivityFactor;
            p.DeficitKcal = input.DeficitKcal;
            p.ProteinPerKg = input.ProteinPerKg;
            await db.SaveChangesAsync();
            return Results.Ok(await BuildDto(db, user.UserId));
        });

        var weights = app.MapGroup("/api/weights").RequireAuthorization(Policies.AppUser);

        app.MapGet("/api/energy/{date}", async (DateOnly date, AppDbContext db, ICurrentUser user, HealthSyncService wearable, CancellationToken ct) =>
        {
            var uid = user.UserId;
            await wearable.SyncAsync(uid, force: false, ct);
            var summary = await BuildDto(db, uid);
            var deficit = summary.Profile?.DeficitKcal;
            var e = await db.DailyEnergies.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == uid && x.Date == date, ct);
            if (e is null)
                return new DayEnergyDto(date, false, null, null, summary.Tdee, summary.TargetKcal, null);

            var projected = EnergyCalculator.ProjectDay(e, summary.Bmr, summary.Tdee, DateTime.Now);
            return new DayEnergyDto(date, true, Math.Round(e.CaloriesOut), e.Steps, Math.Round(projected),
                deficit is null ? null : Math.Round(projected - deficit.Value), DateTime.SpecifyKind(e.UpdatedAt, DateTimeKind.Utc));
        }).RequireAuthorization(Policies.AppUser);

        weights.MapGet("/", async (DateOnly? from, DateOnly? to, AppDbContext db, ICurrentUser user) =>
        {
            var end = to ?? DateOnly.FromDateTime(DateTime.Today);
            var start = from ?? end.AddDays(-365);
            return await db.WeightEntries.AsNoTracking()
                .Where(w => w.UserId == user.UserId && w.Date >= start && w.Date <= end)
                .OrderBy(w => w.Date)
                .Select(w => new WeightDto(w.Date, w.WeightKg))
                .ToListAsync();
        });

        weights.MapPut("/{date}", async (DateOnly date, WeightInput input, AppDbContext db, ICurrentUser user) =>
        {
            var w = await db.WeightEntries.FirstOrDefaultAsync(x => x.UserId == user.UserId && x.Date == date);
            if (w is null)
            {
                w = new WeightEntry { UserId = user.UserId, Date = date };
                db.WeightEntries.Add(w);
            }
            w.WeightKg = input.WeightKg;
            await db.SaveChangesAsync();
            return Results.Ok(new WeightDto(w.Date, w.WeightKg));
        });

        weights.MapDelete("/{date}", async (DateOnly date, AppDbContext db, ICurrentUser user) =>
        {
            var w = await db.WeightEntries.FirstOrDefaultAsync(x => x.UserId == user.UserId && x.Date == date);
            if (w is null) return Results.NotFound();
            db.WeightEntries.Remove(w);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static async Task<ProfileDto> BuildDto(AppDbContext db, int userId)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var p = await db.Profiles.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == userId);
        var weight = await db.WeightEntries.AsNoTracking()
            .Where(w => w.UserId == userId)
            .OrderByDescending(w => w.Date)
            .Select(w => (double?)w.WeightKg)
            .FirstOrDefaultAsync();
        var since = today.AddDays(-EnergyCalculator.WearableAverageDays);
        var energies = await db.DailyEnergies.AsNoTracking()
            .Where(e => e.UserId == userId && e.Date >= since)
            .ToListAsync();
        var measured = EnergyCalculator.WearableAverage(energies, today);

        var input = p is null ? null : new ProfileInput(p.Sex, p.BirthDate, p.HeightCm, p.ActivityFactor, p.DeficitKcal, p.ProteinPerKg);
        double? bmr = p is not null && weight is not null
            ? EnergyCalculator.Bmr(p.Sex, weight.Value, p.HeightCm, EnergyCalculator.AgeAt(p.BirthDate, today))
            : null;
        double? formula = bmr * p?.ActivityFactor;
        var tdee = measured ?? formula;
        var source = measured is not null ? "Fitbit" : formula is not null ? "Formula" : null;

        return new ProfileDto(
            input,
            weight,
            Round(bmr),
            Round(tdee),
            p is not null ? Round(tdee - p.DeficitKcal) : null,
            p is not null ? Round(weight * p.ProteinPerKg) : null,
            source);
    }

    private static double? Round(double? v) => v is null ? null : Math.Round(v.Value);
}
