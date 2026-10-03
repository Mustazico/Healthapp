using System.Net;
using System.Text.Json;
using backend.Models;
using Microsoft.Extensions.Options;

namespace backend.Services;

public class KassalappOptions
{
    public string ApiKey { get; set; } = "";
    public string BaseUrl { get; set; } = "https://kassal.app/api/v1/";
}

public class KassalappClient(HttpClient http, IOptions<KassalappOptions> options, ILogger<KassalappClient> logger)
{
    public async Task<FoodDraft?> LookupAsync(string ean, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(options.Value.ApiKey)) return null;
        try
        {
            using var res = await http.GetAsync($"products/ean/{ean}", ct);
            if (res.StatusCode == HttpStatusCode.NotFound) return null;
            if (!res.IsSuccessStatusCode)
            {
                logger.LogWarning("Kassalapp returned {Status} for {Ean}", (int)res.StatusCode, ean);
                return null;
            }

            using var doc = JsonDocument.Parse(await res.Content.ReadAsStreamAsync(ct));
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object) return null;

            var products = data.TryGetProperty("products", out var p) && p.ValueKind == JsonValueKind.Array
                ? p.EnumerateArray().ToList()
                : [];
            if (products.Count == 0) return null;

            var name = products.Select(x => Str(x, "name")).FirstOrDefault(s => !string.IsNullOrWhiteSpace(s));
            if (name is null) return null;
            var brand = products.Select(x => Str(x, "brand")).FirstOrDefault(s => !string.IsNullOrWhiteSpace(s));
            var image = products.Select(x => NutrientsBuilder.HttpUrlOrNull(Str(x, "image"))).FirstOrDefault(s => s is not null);

            var nb = new NutrientsBuilder();
            if (data.TryGetProperty("nutrition", out var nutrition) && nutrition.ValueKind == JsonValueKind.Array)
                ParseNutrition(nutrition, nb);
            // Top-level nutrition is sometimes empty while a product entry has it.
            if (!nb.HasAny)
            {
                foreach (var prod in products)
                {
                    if (prod.TryGetProperty("nutrition", out var pn) && pn.ValueKind == JsonValueKind.Array) ParseNutrition(pn, nb);
                    if (nb.HasAny) break;
                }
            }

            var (nutrients, missing) = nb.Build();
            return new FoodDraft(name.Trim(), brand?.Trim(), ean, image, null, nutrients, FoodSource.Kassalapp, missing);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogWarning(ex, "Kassalapp lookup failed for {Ean}", ean);
            return null;
        }
    }

    private static void ParseNutrition(JsonElement items, NutrientsBuilder nb)
    {
        double? kj = null;
        foreach (var item in items.EnumerateArray())
        {
            var code = (Str(item, "code") ?? "").ToLowerInvariant();
            var unit = (Str(item, "unit") ?? "").ToLowerInvariant();
            if (!item.TryGetProperty("amount", out var a) || a.ValueKind != JsonValueKind.Number) continue;
            var amount = a.GetDouble();

            if (code.Contains("kcal") || unit == "kcal") nb.Kcal ??= amount;
            else if (code.Contains("kj") || unit == "kj") kj ??= amount;
            else if (code.Contains("mettet") || code.Contains("mettede")) nb.SaturatedFat ??= amount;
            else if (code.StartsWith("fett")) nb.Fat ??= amount;
            else if (code.Contains("sukker")) nb.Sugar ??= amount;
            else if (code.StartsWith("karbohydrat")) nb.Carbs ??= amount;
            else if (code.Contains("fiber")) nb.Fiber ??= amount;
            else if (code.StartsWith("protein")) nb.Protein ??= amount;
            else if (code == "salt") nb.Salt ??= amount;
        }
        if (nb.Kcal is null && kj is not null) nb.Kcal = Math.Round(kj.Value / 4.184, 1);
    }

    private static string? Str(JsonElement e, string prop) =>
        e.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
