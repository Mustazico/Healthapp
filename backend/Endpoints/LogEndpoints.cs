using System.ComponentModel.DataAnnotations;
using backend.Auth;
using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Endpoints;

public record LogInput(
    DateOnly Date,
    Meal Meal,
    [Required, StringLength(200, MinimumLength = 1)] string Name,
    [Range(0, 100_000)] double Grams,
    [Required] Nutrients Nutrients,
    int? FoodId,
    int? RecipeId);

public record LogDto(int Id, DateOnly Date, Meal Meal, string Name, double Grams, Nutrients Nutrients, int? FoodId, int? RecipeId)
{
    public static LogDto From(LogEntry e) => new(e.Id, e.Date, e.Meal, e.Name, e.Grams, e.Nutrients, e.FoodId, e.RecipeId);
}

public static class LogEndpoints
{
    public const int MaxRangeDays = 400;

    public static void MapLogEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/log").RequireAuthorization(Policies.AppUser);

        g.MapGet("/", async (DateOnly? date, DateOnly? from, DateOnly? to, AppDbContext db, ICurrentUser user) =>
        {
            var start = date ?? from;
            var end = date ?? to;
            if (start is null || end is null || end < start || end.Value.DayNumber - start.Value.DayNumber > MaxRangeDays)
                return Results.BadRequest(new { error = "Oppgi date eller et gyldig from/to-intervall." });

            var entries = await db.LogEntries.AsNoTracking()
                .Where(e => e.UserId == user.UserId && e.Date >= start && e.Date <= end)
                .OrderBy(e => e.Date).ThenBy(e => e.CreatedAt)
                .ToListAsync();
            return Results.Ok(entries.Select(LogDto.From));
        });

        g.MapPost("/", async (LogInput input, AppDbContext db, ICurrentUser user) =>
        {
            if (await InvalidReferences(db, input) is { } error) return error;
            var entry = new LogEntry { UserId = user.UserId };
            Apply(entry, input);
            db.LogEntries.Add(entry);
            await db.SaveChangesAsync();
            return Results.Created($"/api/log/{entry.Id}", LogDto.From(entry));
        });

        g.MapPut("/{id:int}", async (int id, LogInput input, AppDbContext db, ICurrentUser user) =>
        {
            var entry = await db.LogEntries.FirstOrDefaultAsync(e => e.Id == id && e.UserId == user.UserId);
            if (entry is null) return Results.NotFound();
            if (await InvalidReferences(db, input) is { } error) return error;
            Apply(entry, input);
            await db.SaveChangesAsync();
            return Results.Ok(LogDto.From(entry));
        });

        g.MapDelete("/{id:int}", async (int id, AppDbContext db, ICurrentUser user) =>
        {
            var entry = await db.LogEntries.FirstOrDefaultAsync(e => e.Id == id && e.UserId == user.UserId);
            if (entry is null) return Results.NotFound();
            db.LogEntries.Remove(entry);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static async Task<IResult?> InvalidReferences(AppDbContext db, LogInput input)
    {
        if (input.FoodId is { } fid && !await db.Foods.AnyAsync(f => f.Id == fid))
            return Results.BadRequest(new { error = "Varen finnes ikke." });
        if (input.RecipeId is { } rid && !await db.Recipes.AnyAsync(r => r.Id == rid))
            return Results.BadRequest(new { error = "Oppskriften finnes ikke." });
        return null;
    }

    private static void Apply(LogEntry entry, LogInput input)
    {
        entry.Date = input.Date;
        entry.Meal = input.Meal;
        entry.Name = input.Name.Trim();
        entry.Grams = input.Grams;
        entry.Nutrients = input.Nutrients;
        entry.FoodId = input.FoodId;
        entry.RecipeId = input.RecipeId;
    }
}
