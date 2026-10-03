using System.Net;
using System.Text.Json;
using backend.Models;

namespace backend.Services;

public class OpenFoodFactsClient(HttpClient http, ILogger<OpenFoodFactsClient> logger)
{
    private const string Fields = "product_name,product_name_nb,product_name_no,brands,image_front_url,serving_quantity,nutriments";

    public async Task<FoodDraft?> LookupAsync(string ean, CancellationToken ct)
    {
        try
        {
            using var res = await http.GetAsync($"api/v2/product/{ean}.json?fields={Fields}", ct);
            if (res.StatusCode == HttpStatusCode.NotFound) return null;
            if (!res.IsSuccessStatusCode)
            {
                logger.LogWarning("Open Food Facts returned {Status} for {Ean}", (int)res.StatusCode, ean);
                return null;
            }

            using var doc = JsonDocument.Parse(await res.Content.ReadAsStreamAsync(ct));
            if (!doc.RootElement.TryGetProperty("product", out var product)) return null;

            var name = new[] { "product_name_nb", "product_name_no", "product_name" }
                .Select(k => Str(product, k))
                .FirstOrDefault(s => !string.IsNullOrWhiteSpace(s));
            if (name is null) return null;

            var brand = Str(product, "brands")?.Split(',')[0].Trim();
            var image = NutrientsBuilder.HttpUrlOrNull(Str(product, "image_front_url"));
            var serving = Num(product, "serving_quantity");

            var nb = new NutrientsBuilder();
            if (product.TryGetProperty("nutriments", out var n))
            {
                nb.Kcal = Num(n, "energy-kcal_100g");
                nb.Protein = Num(n, "proteins_100g");
                nb.Carbs = Num(n, "carbohydrates_100g");
                nb.Fat = Num(n, "fat_100g");
                nb.SaturatedFat = Num(n, "saturated-fat_100g");
                nb.Sugar = Num(n, "sugars_100g");
                nb.Fiber = Num(n, "fiber_100g");
                nb.Salt = Num(n, "salt_100g");
                if (nb.Kcal is null && Num(n, "energy-kj_100g") is { } kj) nb.Kcal = Math.Round(kj / 4.184, 1);
            }

            var (nutrients, missing) = nb.Build();
            return new FoodDraft(name.Trim(), brand, ean, image, serving is > 0 ? serving : null, nutrients, FoodSource.OpenFoodFacts, missing);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogWarning(ex, "Open Food Facts lookup failed for {Ean}", ean);
            return null;
        }
    }

    private static string? Str(JsonElement e, string prop) =>
        e.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    // OFF sometimes serialises numbers as strings.
    private static double? Num(JsonElement e, string prop)
    {
        if (!e.TryGetProperty(prop, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number) return v.GetDouble();
        if (v.ValueKind == JsonValueKind.String && double.TryParse(v.GetString(), System.Globalization.CultureInfo.InvariantCulture, out var d)) return d;
        return null;
    }
}
