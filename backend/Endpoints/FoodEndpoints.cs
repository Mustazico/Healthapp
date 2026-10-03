using System.ComponentModel.DataAnnotations;
using backend.Auth;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.EntityFrameworkCore;

namespace backend.Endpoints;

public record FoodInput(
    [Required, StringLength(200, MinimumLength = 1)] string Name,
    [StringLength(200)] string? Brand,
    [RegularExpression(@"^\d{8,14}$")] string? Ean,
    FoodSource Source,
    [StringLength(1000)] string? ImageUrl,
    [Range(0.1, 10_000)] double? ServingGrams,
    [Required] Nutrients Per100g);

public record FoodDto(int Id, string Name, string? Brand, string? Ean, FoodSource Source, string? ImageUrl,
    double? ServingGrams, Nutrients Per100g, DateTime UpdatedAt)
{
    public static FoodDto From(Food f) => new(f.Id, f.Name, f.Brand, f.Ean, f.Source, f.ImageUrl, f.ServingGrams, f.Per100g, f.UpdatedAt);
}

public static class FoodEndpoints
{
    public static void MapFoodEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/foods").RequireAuthorization(Policies.AppUser);

        g.MapGet("/", async (string? q, AppDbContext db) =>
        {
            var query = db.Foods.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                var like = $"%{term}%";
                query = query.Where(f => EF.Functions.Like(f.Name, like) || EF.Functions.Like(f.Brand!, like) || f.Ean == term);
            }
            var foods = await query.OrderByDescending(f => f.UpdatedAt).Take(100).ToListAsync();
            return foods.Select(FoodDto.From);
        });

        g.MapGet("/{id:int}", async (int id, AppDbContext db) =>
            await db.Foods.AsNoTracking().FirstOrDefaultAsync(f => f.Id == id) is { } f
                ? Results.Ok(FoodDto.From(f))
                : Results.NotFound());

        g.MapGet("/lookup/{ean}", async (string ean, FoodLookupService lookup, CancellationToken ct) =>
        {
            if (!FoodLookupService.IsValidEan(ean)) return Results.BadRequest(new { error = "Ugyldig strekkode." });
            return await lookup.LookupAsync(ean, ct) is { } result ? Results.Ok(result) : Results.NotFound();
        });

        g.MapPost("/", async (FoodInput input, AppDbContext db, ICurrentUser user) =>
        {
            if (input.Ean is not null && await db.Foods.AsNoTracking().FirstOrDefaultAsync(f => f.Ean == input.Ean) is { } existing)
                return Results.Conflict(new { error = "En vare med denne strekkoden finnes allerede.", foodId = existing.Id });

            var food = new Food { CreatedByUserId = user.UserId };
            Apply(food, input);
            db.Foods.Add(food);
            await db.SaveChangesAsync();
            return Results.Created($"/api/foods/{food.Id}", FoodDto.From(food));
        });

        g.MapPut("/{id:int}", async (int id, FoodInput input, AppDbContext db) =>
        {
            var food = await db.Foods.FindAsync(id);
            if (food is null) return Results.NotFound();
            if (input.Ean is not null && await db.Foods.AnyAsync(f => f.Ean == input.Ean && f.Id != id))
                return Results.Conflict(new { error = "En annen vare har denne strekkoden." });

            Apply(food, input);
            food.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(FoodDto.From(food));
        });

        g.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var food = await db.Foods.FindAsync(id);
            if (food is null) return Results.NotFound();
            if (await db.RecipeIngredients.AnyAsync(i => i.FoodId == id))
                return Results.Conflict(new { error = "Varen brukes i en oppskrift og kan ikke slettes." });

            db.Foods.Remove(food);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static void Apply(Food food, FoodInput input)
    {
        food.Name = input.Name.Trim();
        food.Brand = string.IsNullOrWhiteSpace(input.Brand) ? null : input.Brand.Trim();
        food.Ean = input.Ean;
        food.Source = input.Source;
        food.ImageUrl = NutrientsBuilder.HttpUrlOrNull(input.ImageUrl);
        food.ServingGrams = input.ServingGrams;
        food.Per100g = input.Per100g;
    }
}
