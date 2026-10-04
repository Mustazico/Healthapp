using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace backend.Services;

public record LookupResult(int? FoodId, FoodDraft Draft);

public class FoodLookupService(AppDbContext db, KassalappClient kassalapp, OpenFoodFactsClient off,
    MatvaretabellenClient matvaretabellen, IMemoryCache cache)
{
    /// <summary>Generic foods (fruit, vegetables, …) from Matvaretabellen first, then store products from Kassalapp.</summary>
    public async Task<List<LookupResult>> SearchOnlineAsync(string query, CancellationToken ct)
    {
        var mvtTask = matvaretabellen.SearchAsync(query, 15, ct);
        // Cached because Kassalapp's free tier allows 60 requests/min.
        var cacheKey = "kassalapp-search:" + query.ToLowerInvariant();
        if (!cache.TryGetValue(cacheKey, out IReadOnlyList<FoodDraft>? products))
        {
            products = await kassalapp.SearchAsync(query, 15, ct);
            if (products is not null) cache.Set(cacheKey, products, TimeSpan.FromHours(1));
        }
        // Products without any nutrition info last.
        var drafts = (await mvtTask).Concat((products ?? []).OrderBy(d => d.MissingNutrients.Contains("kcal"))).ToList();

        // Point to already saved foods so they are reused instead of duplicated.
        var eans = drafts.Where(d => d.Ean is not null).Select(d => d.Ean!).ToList();
        var names = drafts.Where(d => d.Source == FoodSource.Matvaretabellen).Select(d => d.Name).ToList();
        var saved = await db.Foods.AsNoTracking()
            .Where(f => (f.Ean != null && eans.Contains(f.Ean)) || (f.Source == FoodSource.Matvaretabellen && names.Contains(f.Name)))
            .Select(f => new { f.Id, f.Ean, f.Name, f.Source })
            .ToListAsync(ct);

        return drafts.Select(d => new LookupResult(
            d.Ean is not null
                ? saved.FirstOrDefault(f => f.Ean == d.Ean)?.Id
                : saved.FirstOrDefault(f => f.Source == FoodSource.Matvaretabellen && f.Name == d.Name)?.Id,
            d)).ToList();
    }

    public static bool IsValidEan(string ean) => ean.Length is >= 8 and <= 14 && ean.All(char.IsAsciiDigit);

    public async Task<LookupResult?> LookupAsync(string ean, CancellationToken ct)
    {
        var existing = await db.Foods.AsNoTracking().FirstOrDefaultAsync(f => f.Ean == ean, ct);
        if (existing is not null)
        {
            return new LookupResult(existing.Id, new FoodDraft(existing.Name, existing.Brand, ean, existing.ImageUrl,
                existing.ServingGrams, existing.Per100g, existing.Source, []));
        }

        var draft = await kassalapp.LookupAsync(ean, ct);
        // Prefer OFF when Kassalapp knows the product but lacks nutrition.
        if (draft is null || draft.MissingNutrients.Length == 8)
        {
            var offDraft = await off.LookupAsync(ean, ct);
            if (offDraft is not null && (draft is null || offDraft.MissingNutrients.Length < 8))
                draft = draft is null ? offDraft : offDraft with { Name = draft.Name, Brand = draft.Brand ?? offDraft.Brand, ImageUrl = draft.ImageUrl ?? offDraft.ImageUrl };
        }

        return draft is null ? null : new LookupResult(null, draft);
    }
}
