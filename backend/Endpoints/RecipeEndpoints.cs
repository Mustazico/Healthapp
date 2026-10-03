using System.ComponentModel.DataAnnotations;
using backend.Auth;
using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Endpoints;

public record IngredientInput(int FoodId, [Range(0.1, 100_000)] double Grams);

public record RecipeInput(
    [Required, StringLength(200, MinimumLength = 1)] string Name,
    [StringLength(4000)] string? Notes,
    [Range(1, 100_000)] double? CookedWeightGrams,
    [Required] List<IngredientInput> Ingredients);

public record IngredientDto(int Id, int FoodId, double Grams, FoodDto Food);

public record RecipeDto(int Id, string Name, string? Notes, double? CookedWeightGrams, string? CreatedBy,
    DateTime UpdatedAt, List<IngredientDto> Ingredients);

public record RecipeListItem(int Id, string Name, int IngredientCount, double? CookedWeightGrams, string? CreatedBy, DateTime UpdatedAt);

public static class RecipeEndpoints
{
    public static void MapRecipeEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/recipes").RequireAuthorization(Policies.AppUser);

        g.MapGet("/", async (AppDbContext db) =>
            await db.Recipes.AsNoTracking()
                .OrderBy(r => r.Name)
                .Select(r => new RecipeListItem(r.Id, r.Name, r.Ingredients.Count, r.CookedWeightGrams,
                    r.CreatedByUser != null ? r.CreatedByUser.Name : null, r.UpdatedAt))
                .ToListAsync());

        g.MapGet("/{id:int}", async (int id, AppDbContext db) =>
            await Load(db, id) is { } r ? Results.Ok(ToDto(r)) : Results.NotFound());

        g.MapPost("/", async (RecipeInput input, AppDbContext db, ICurrentUser user) =>
        {
            if (await MissingFoods(db, input) is { } error) return error;
            var recipe = new Recipe { CreatedByUserId = user.UserId };
            Apply(recipe, input);
            db.Recipes.Add(recipe);
            await db.SaveChangesAsync();
            return Results.Created($"/api/recipes/{recipe.Id}", ToDto((await Load(db, recipe.Id))!));
        });

        g.MapPut("/{id:int}", async (int id, RecipeInput input, AppDbContext db) =>
        {
            var recipe = await db.Recipes.Include(r => r.Ingredients).FirstOrDefaultAsync(r => r.Id == id);
            if (recipe is null) return Results.NotFound();
            if (await MissingFoods(db, input) is { } error) return error;

            db.RecipeIngredients.RemoveRange(recipe.Ingredients);
            Apply(recipe, input);
            recipe.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(ToDto((await Load(db, id))!));
        });

        g.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var recipe = await db.Recipes.FindAsync(id);
            if (recipe is null) return Results.NotFound();
            db.Recipes.Remove(recipe);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static Task<Recipe?> Load(AppDbContext db, int id) =>
        db.Recipes.AsNoTracking()
            .Include(r => r.CreatedByUser)
            .Include(r => r.Ingredients).ThenInclude(i => i.Food)
            .FirstOrDefaultAsync(r => r.Id == id);

    private static async Task<IResult?> MissingFoods(AppDbContext db, RecipeInput input)
    {
        var ids = input.Ingredients.Select(i => i.FoodId).Distinct().ToList();
        var found = await db.Foods.CountAsync(f => ids.Contains(f.Id));
        return found == ids.Count ? null : Results.BadRequest(new { error = "En eller flere ingredienser finnes ikke." });
    }

    private static void Apply(Recipe recipe, RecipeInput input)
    {
        recipe.Name = input.Name.Trim();
        recipe.Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim();
        recipe.CookedWeightGrams = input.CookedWeightGrams;
        recipe.Ingredients = input.Ingredients.Select(i => new RecipeIngredient { FoodId = i.FoodId, Grams = i.Grams }).ToList();
    }

    private static RecipeDto ToDto(Recipe r) => new(r.Id, r.Name, r.Notes, r.CookedWeightGrams, r.CreatedByUser?.Name, r.UpdatedAt,
        r.Ingredients.OrderBy(i => i.Id).Select(i => new IngredientDto(i.Id, i.FoodId, i.Grams, FoodDto.From(i.Food))).ToList());
}
