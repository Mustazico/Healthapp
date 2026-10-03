using System.Collections.Concurrent;
using backend.Data;
using backend.Models;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public record WearableStatus(bool Configured, bool Connected, DateTime? LastSyncAt, string? LastError, int DaysSynced);

// Queries use IgnoreQueryFilters because the OAuth callback may run without a signed-in user;
// every query is scoped to an explicit userId instead.
public class HealthSyncService(AppDbContext db, GoogleHealthClient client, IDataProtectionProvider dp, ILogger<HealthSyncService> logger)
{
    public const string Source = "Fitbit";
    private const int InitialDays = 90;
    private static readonly TimeSpan SyncInterval = TimeSpan.FromMinutes(15);
    private static readonly ConcurrentDictionary<int, SemaphoreSlim> Locks = new();

    private readonly IDataProtector protector = dp.CreateProtector("NutriTrack.GoogleHealth.Tokens");

    public async Task<WearableStatus> GetStatusAsync(int userId, bool configured)
    {
        var c = await Connections(userId).AsNoTracking().FirstOrDefaultAsync();
        var days = await db.DailyEnergies.IgnoreQueryFilters().CountAsync(e => e.UserId == userId);
        // SQLite drops DateTimeKind; mark as UTC so clients convert to local time.
        DateTime? lastSync = c?.LastSyncAt is { } t ? DateTime.SpecifyKind(t, DateTimeKind.Utc) : null;
        return new WearableStatus(configured, c is not null, lastSync, c?.LastError, days);
    }

    public async Task ConnectAsync(int userId, HealthTokens tokens, CancellationToken ct)
    {
        if (!tokens.Scope.Split(' ').Contains(GoogleHealthClient.Scope))
            throw new HealthAuthException("Du må gi tilgang til aktivitetsdata for at forbrenningen skal kunne hentes.", "scope");
        if (tokens.RefreshToken is null)
            throw new HealthAuthException("Google ga ingen varig tilgang. Prøv å koble til på nytt.");

        var identity = await client.GetIdentityAsync(tokens.AccessToken, ct);

        var c = await Connections(userId).FirstOrDefaultAsync(ct);
        if (c is null)
        {
            c = new HealthConnection { UserId = userId };
            db.HealthConnections.Add(c);
        }
        c.HealthUserId = identity.HealthUserId;
        c.ConnectedAt = DateTime.UtcNow;
        c.LastSyncAt = null;
        c.LastError = null;
        StoreTokens(c, tokens);
        await db.SaveChangesAsync(ct);
        await SyncAsync(userId, force: true, ct);
    }

    public async Task DisconnectAsync(int userId, CancellationToken ct)
    {
        var c = await Connections(userId).FirstOrDefaultAsync(ct);
        if (c is null) return;
        try
        {
            await client.RevokeAsync(protector.Unprotect(c.RefreshTokenProtected), ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Google Health revoke failed for user {UserId}", userId);
        }
        db.HealthConnections.Remove(c);
        await db.DailyEnergies.IgnoreQueryFilters().Where(e => e.UserId == userId).ExecuteDeleteAsync(ct);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Syncs if connected and the last sync is older than the interval. Never throws.</summary>
    public async Task SyncAsync(int userId, bool force, CancellationToken ct)
    {
        var gate = Locks.GetOrAdd(userId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var c = await Connections(userId).FirstOrDefaultAsync(ct);
            if (c is null) return;
            if (!force && c.LastSyncAt > DateTime.UtcNow - SyncInterval) return;

            try
            {
                await SyncCoreAsync(c, ct);
                c.LastError = null;
                c.LastSyncAt = DateTime.UtcNow;
            }
            catch (HealthAuthException ex)
            {
                c.LastError = ex.Message + " Koble til på nytt.";
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                logger.LogWarning(ex, "Google Health sync failed for user {UserId}", userId);
                c.LastError = "Fikk ikke kontakt med Google Health. Prøver igjen senere.";
            }
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task SyncCoreAsync(HealthConnection c, CancellationToken ct)
    {
        var accessToken = await GetAccessTokenAsync(c, ct);
        var today = DateOnly.FromDateTime(DateTime.Today);
        // Re-fetch the last couple of days since they may have been partial at the previous sync.
        var from = c.LastSyncAt is { } last ? DateOnly.FromDateTime(last.ToLocalTime()).AddDays(-2) : today.AddDays(-InitialDays);

        var calories = await client.GetDailyCaloriesAsync(accessToken, from, today, ct);
        var steps = await client.GetDailyStepsAsync(accessToken, from, today, ct);

        var existing = await db.DailyEnergies.IgnoreQueryFilters()
            .Where(e => e.UserId == c.UserId && e.Date >= from)
            .ToDictionaryAsync(e => e.Date, ct);

        foreach (var (date, kcal) in calories)
        {
            if (kcal <= 0) continue;
            if (!existing.TryGetValue(date, out var e))
            {
                e = new DailyEnergy { UserId = c.UserId, Date = date, Source = Source };
                db.DailyEnergies.Add(e);
            }
            e.CaloriesOut = kcal;
            e.Steps = (int)steps.GetValueOrDefault(date);
            e.UpdatedAt = DateTime.UtcNow;
        }
    }

    private async Task<string> GetAccessTokenAsync(HealthConnection c, CancellationToken ct)
    {
        if (c.ExpiresAt > DateTime.UtcNow.AddMinutes(2)) return protector.Unprotect(c.AccessTokenProtected);

        var tokens = await client.RefreshAsync(protector.Unprotect(c.RefreshTokenProtected), ct);
        StoreTokens(c, tokens);
        await db.SaveChangesAsync(ct);
        return tokens.AccessToken;
    }

    private void StoreTokens(HealthConnection c, HealthTokens t)
    {
        c.AccessTokenProtected = protector.Protect(t.AccessToken);
        // Google only returns a refresh token on the initial consent; keep the existing one on refresh.
        if (t.RefreshToken is not null) c.RefreshTokenProtected = protector.Protect(t.RefreshToken);
        c.ExpiresAt = DateTime.UtcNow.AddSeconds(t.ExpiresIn);
    }

    private IQueryable<HealthConnection> Connections(int userId) =>
        db.HealthConnections.IgnoreQueryFilters().Where(x => x.UserId == userId);
}
