using backend.Data;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public record LookupResult(int? FoodId, FoodDraft Draft);

public class FoodLookupService(AppDbContext db, KassalappClient kassalapp, OpenFoodFactsClient off)
{
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
