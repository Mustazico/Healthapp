using backend.Models;

namespace backend.Services;

public record FoodDraft(
    string Name,
    string? Brand,
    string? Ean,
    string? ImageUrl,
    double? ServingGrams,
    Nutrients Per100g,
    FoodSource Source,
    string[] MissingNutrients);

// Collects nullable values while parsing an external source.
internal sealed class NutrientsBuilder
{
    public double? Kcal, Protein, Carbs, Fat, SaturatedFat, Sugar, Fiber, Salt;

    public bool HasAny => new[] { Kcal, Protein, Carbs, Fat, SaturatedFat, Sugar, Fiber, Salt }.Any(v => v.HasValue);

    public (Nutrients nutrients, string[] missing) Build()
    {
        var missing = new List<string>();
        double Take(double? v, string name) { if (v is null) missing.Add(name); return Math.Max(0, v ?? 0); }

        var n = new Nutrients
        {
            Kcal = Take(Kcal, "kcal"),
            Protein = Take(Protein, "protein"),
            Carbs = Take(Carbs, "carbs"),
            Fat = Take(Fat, "fat"),
            SaturatedFat = Take(SaturatedFat, "saturatedFat"),
            Sugar = Take(Sugar, "sugar"),
            Fiber = Take(Fiber, "fiber"),
            Salt = Take(Salt, "salt"),
        };
        return (n, missing.ToArray());
    }

    public static string? HttpUrlOrNull(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp)
            ? url
            : null;
}
