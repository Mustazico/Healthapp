using System.Text.Json;
using backend.Models;
using Microsoft.Extensions.Caching.Memory;

namespace backend.Services;

/// <summary>Searches the Norwegian food composition table (matvaretabellen.no). The whole table is downloaded and cached.</summary>
public class MatvaretabellenClient(HttpClient http, IMemoryCache cache, ILogger<MatvaretabellenClient> logger)
{
    private const string CacheKey = "matvaretabellen:foods";
    private static readonly SemaphoreSlim LoadGate = new(1, 1);

    private sealed record Entry(string Name, string SearchText, FoodDraft Draft);

    public async Task<IReadOnlyList<FoodDraft>> SearchAsync(string query, int max, CancellationToken ct)
    {
        var terms = Normalize(query).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (terms.Length == 0) return [];

        var foods = await GetFoodsAsync(ct);
        var phrase = string.Join(' ', terms);
        return foods
            .Where(f => terms.All(f.SearchText.Contains))
            .OrderBy(f => Rank(f.Name, phrase, terms[0]))
            // Plain produce ("Eple, norsk, rå") before products made from it.
            .ThenBy(f => f.Name.Split(' ').Contains("rå") ? 0 : 1)
            .ThenBy(f => f.Name.Length)
            .Take(max)
            .Select(f => f.Draft)
            .ToList();
    }

    private static int Rank(string name, string phrase, string firstTerm)
    {
        if (name == phrase || name.StartsWith(phrase + " ")) return 0;
        if (name.StartsWith(phrase)) return 1;
        return name.Split(' ').Any(w => w.StartsWith(firstTerm)) ? 2 : 3;
    }

    private async Task<List<Entry>> GetFoodsAsync(CancellationToken ct)
    {
        if (cache.TryGetValue(CacheKey, out List<Entry>? foods) && foods is not null) return foods;

        await LoadGate.WaitAsync(ct);
        try
        {
            if (cache.TryGetValue(CacheKey, out foods) && foods is not null) return foods;
            foods = await DownloadAsync(ct);
            // The table is updated yearly; don't cache failures so the next search retries.
            if (foods.Count > 0) cache.Set(CacheKey, foods, TimeSpan.FromDays(7));
            return foods;
        }
        finally
        {
            LoadGate.Release();
        }
    }

    private async Task<List<Entry>> DownloadAsync(CancellationToken ct)
    {
        try
        {
            using var res = await http.GetAsync("api/nb/foods.json", HttpCompletionOption.ResponseHeadersRead, ct);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogWarning("Matvaretabellen returned {Status}", (int)res.StatusCode);
                return [];
            }

            using var doc = await JsonDocument.ParseAsync(await res.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            if (!doc.RootElement.TryGetProperty("foods", out var list) || list.ValueKind != JsonValueKind.Array) return [];

            var foods = new List<Entry>();
            foreach (var f in list.EnumerateArray())
            {
                var name = Str(f, "foodName")?.Trim();
                if (string.IsNullOrEmpty(name)) continue;

                var values = new Dictionary<string, double>();
                if (f.TryGetProperty("constituents", out var cs) && cs.ValueKind == JsonValueKind.Array)
                {
                    foreach (var c in cs.EnumerateArray())
                    {
                        if (Str(c, "nutrientId") is { } id && c.TryGetProperty("quantity", out var q) && q.ValueKind == JsonValueKind.Number)
                            values[id] = q.GetDouble();
                    }
                }
                double? V(string id) => values.TryGetValue(id, out var v) ? v : null;

                var nb = new NutrientsBuilder
                {
                    Kcal = f.TryGetProperty("calories", out var cal) && cal.TryGetProperty("quantity", out var k) && k.ValueKind == JsonValueKind.Number
                        ? k.GetDouble()
                        : null,
                    Protein = V("Protein"),
                    Carbs = V("Karbo"),
                    Fat = V("Fett"),
                    SaturatedFat = V("Mettet"),
                    // "Sukker" is added sugar only; "Mono+Di" matches "sukkerarter" on labels.
                    Sugar = V("Mono+Di"),
                    Fiber = V("Fiber"),
                    Salt = V("NaCl"),
                };
                if (nb.Kcal is null) continue;

                var (nutrients, missing) = nb.Build();
                var keywords = f.TryGetProperty("searchKeywords", out var kw) && kw.ValueKind == JsonValueKind.Array
                    ? string.Join(' ', kw.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()))
                    : "";
                var normalizedName = Normalize(name);
                foods.Add(new Entry(normalizedName, $"{normalizedName} {Normalize(keywords)}",
                    new FoodDraft(name, null, null, null, PortionGrams(f), nutrients, FoodSource.Matvaretabellen, missing)));
            }
            logger.LogInformation("Loaded {Count} foods from Matvaretabellen", foods.Count);
            return foods;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogWarning(ex, "Matvaretabellen download failed");
            return [];
        }
    }

    private static double? PortionGrams(JsonElement food)
    {
        if (!food.TryGetProperty("portions", out var ps) || ps.ValueKind != JsonValueKind.Array) return null;
        foreach (var p in ps.EnumerateArray())
        {
            if (Str(p, "unit") == "g" && p.TryGetProperty("quantity", out var q) && q.ValueKind == JsonValueKind.Number && q.GetDouble() is > 0 and <= 10_000)
                return q.GetDouble();
        }
        return null;
    }

    private static string Normalize(string s) =>
        string.Join(' ', s.ToLowerInvariant().Split([' ', ',', '(', ')', '/', '-'], StringSplitOptions.RemoveEmptyEntries));

    private static string? Str(JsonElement e, string prop) =>
        e.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
