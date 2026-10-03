using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using backend.Auth;
using backend.Services;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace backend.Endpoints;

public static class FitbitEndpoints
{
    private record PendingAuth(int UserId, string CodeVerifier);

    public static void MapFitbitEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/fitbit");

        g.MapGet("/status", (ICurrentUser user, HealthSyncService sync, IOptions<GoogleHealthOptions> o) =>
            sync.GetStatusAsync(user.UserId, o.Value.IsConfigured)).RequireAuthorization(Policies.AppUser);

        // Full-page navigation from the app; redirects to Google's consent screen for Fitbit data.
        g.MapGet("/connect", (ICurrentUser user, IMemoryCache cache, GoogleHealthClient client, IOptions<GoogleHealthOptions> o) =>
        {
            if (!o.Value.IsConfigured) return Results.Redirect("/more?fitbit=unavailable");

            var state = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
            var verifier = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
            var challenge = WebEncoders.Base64UrlEncode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
            cache.Set(CacheKey(state), new PendingAuth(user.UserId, verifier), TimeSpan.FromMinutes(10));
            return Results.Redirect(client.BuildAuthorizeUrl(state, challenge));
        }).RequireAuthorization(Policies.AppUser);

        // iOS home-screen apps may finish OAuth in a browser context without our cookie,
        // so the single-use, unguessable state is what binds the callback to the user.
        g.MapGet("/callback", async (string? code, string? state, string? error, ClaimsPrincipal principal,
            IMemoryCache cache, GoogleHealthClient client, HealthSyncService sync, ILoggerFactory lf, CancellationToken ct) =>
        {
            if (state is null || !cache.TryGetValue(CacheKey(state), out PendingAuth? pending) || pending is null)
                return Results.Redirect("/more?fitbit=expired");
            cache.Remove(CacheKey(state));

            var signedIn = principal.FindFirstValue(AppClaims.UserId);
            if (signedIn is not null && signedIn != pending.UserId.ToString())
                return Results.Redirect("/more?fitbit=error");
            if (error is not null || string.IsNullOrEmpty(code))
                return Results.Redirect("/more?fitbit=denied");

            try
            {
                var tokens = await client.ExchangeCodeAsync(code, pending.CodeVerifier, ct);
                await sync.ConnectAsync(pending.UserId, tokens, ct);
                return Results.Redirect("/more?fitbit=connected");
            }
            catch (HealthAuthException ex)
            {
                lf.CreateLogger("GoogleHealth").LogWarning(ex, "Google Health connect failed");
                return Results.Redirect($"/more?fitbit={ex.Code}");
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                lf.CreateLogger("GoogleHealth").LogWarning(ex, "Google Health token exchange failed");
                return Results.Redirect("/more?fitbit=error");
            }
        }).AllowAnonymous();

        g.MapPost("/sync", async (ICurrentUser user, HealthSyncService sync, IOptions<GoogleHealthOptions> o, CancellationToken ct) =>
        {
            await sync.SyncAsync(user.UserId, force: true, ct);
            return await sync.GetStatusAsync(user.UserId, o.Value.IsConfigured);
        }).RequireAuthorization(Policies.AppUser);

        g.MapDelete("/", async (ICurrentUser user, HealthSyncService sync, CancellationToken ct) =>
        {
            await sync.DisconnectAsync(user.UserId, ct);
            return Results.NoContent();
        }).RequireAuthorization(Policies.AppUser);
    }

    private static string CacheKey(string state) => "fitbit-oauth:" + state;
}
