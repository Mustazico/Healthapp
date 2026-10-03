using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace backend.Services;

public class GoogleHealthOptions
{
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    /// <summary>Must be listed under "Authorized redirect URIs" on the OAuth client.</summary>
    public string RedirectUri { get; set; } = "";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret) && !string.IsNullOrWhiteSpace(RedirectUri);
}

public record HealthTokens(string AccessToken, string? RefreshToken, int ExpiresIn, string Scope);

public record HealthIdentity(string HealthUserId, string? LegacyUserId);

/// <summary>Consent or token problem the user can fix by reconnecting. Code is shown to the app as ?fitbit=code.</summary>
public class HealthAuthException(string message, string code = "error") : Exception(message)
{
    public string Code { get; } = code;
}

public class GoogleHealthClient(HttpClient http, IOptions<GoogleHealthOptions> options)
{
    public const string Scope = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";
    // total-calories rollups are limited to 14 days per request, other types to 90.
    private const int MaxCaloriesRangeDays = 14;
    private const int MaxStepsRangeDays = 90;

    private GoogleHealthOptions O => options.Value;

    public string BuildAuthorizeUrl(string state, string codeChallenge) =>
        "https://accounts.google.com/o/oauth2/v2/auth" +
        $"?client_id={Uri.EscapeDataString(O.ClientId)}" +
        $"&redirect_uri={Uri.EscapeDataString(O.RedirectUri)}" +
        "&response_type=code&access_type=offline&prompt=consent" +
        $"&scope={Uri.EscapeDataString(Scope)}" +
        $"&state={state}&code_challenge={codeChallenge}&code_challenge_method=S256";

    public Task<HealthTokens> ExchangeCodeAsync(string code, string codeVerifier, CancellationToken ct) =>
        TokenRequestAsync(new()
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["code_verifier"] = codeVerifier,
            ["redirect_uri"] = O.RedirectUri,
        }, ct);

    public Task<HealthTokens> RefreshAsync(string refreshToken, CancellationToken ct) =>
        TokenRequestAsync(new() { ["grant_type"] = "refresh_token", ["refresh_token"] = refreshToken }, ct);

    public async Task RevokeAsync(string token, CancellationToken ct)
    {
        using var content = new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = token });
        using var _ = await http.PostAsync("https://oauth2.googleapis.com/revoke", content, ct);
    }

    public async Task<HealthIdentity> GetIdentityAsync(string accessToken, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "https://health.googleapis.com/v4/users/me/identity");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var res = await http.SendAsync(req, ct);
        if (res.StatusCode == HttpStatusCode.PreconditionFailed)
            throw new HealthAuthException("Google Health-profilen er ikke satt opp. Åpne Fitbit-/Google Health-appen og fullfør oppsettet først.", "profile");
        await ThrowIfUnauthorized(res);
        res.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStreamAsync(ct));
        var r = doc.RootElement;
        return new HealthIdentity(
            r.TryGetProperty("healthUserId", out var h) ? h.GetString() ?? "" : "",
            r.TryGetProperty("legacyUserId", out var l) ? l.GetString() : null);
    }

    public Task<Dictionary<DateOnly, double>> GetDailyCaloriesAsync(string accessToken, DateOnly from, DateOnly toInclusive, CancellationToken ct) =>
        DailyRollUpAsync(accessToken, "total-calories", "totalCalories", "kcalSum", from, toInclusive, MaxCaloriesRangeDays, ct);

    public Task<Dictionary<DateOnly, double>> GetDailyStepsAsync(string accessToken, DateOnly from, DateOnly toInclusive, CancellationToken ct) =>
        DailyRollUpAsync(accessToken, "steps", "steps", "countSum", from, toInclusive, MaxStepsRangeDays, ct);

    private async Task<Dictionary<DateOnly, double>> DailyRollUpAsync(string accessToken, string dataType, string valueField,
        string sumField, DateOnly from, DateOnly toInclusive, int maxDays, CancellationToken ct)
    {
        var result = new Dictionary<DateOnly, double>();
        for (var start = from; start <= toInclusive; start = start.AddDays(maxDays))
        {
            var endExclusive = start.AddDays(maxDays) is var e && e > toInclusive.AddDays(1) ? toInclusive.AddDays(1) : e;
            using var req = new HttpRequestMessage(HttpMethod.Post,
                $"https://health.googleapis.com/v4/users/me/dataTypes/{dataType}/dataPoints:dailyRollUp")
            {
                Content = JsonContent.Create(new
                {
                    range = new { start = new { date = Civil(start) }, end = new { date = Civil(endExclusive) } },
                    windowSizeDays = 1,
                }),
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            using var res = await http.SendAsync(req, ct);
            await ThrowIfUnauthorized(res);
            res.EnsureSuccessStatusCode();

            using var doc = JsonDocument.Parse(await res.Content.ReadAsStreamAsync(ct));
            if (!doc.RootElement.TryGetProperty("rollupDataPoints", out var points)) continue;
            foreach (var p in points.EnumerateArray())
            {
                // The value is omitted for days without any on-wrist or manual data.
                if (!p.TryGetProperty(valueField, out var value) || !value.TryGetProperty(sumField, out var sum)) continue;
                var d = p.GetProperty("civilStartTime").GetProperty("date");
                var date = new DateOnly(d.GetProperty("year").GetInt32(), d.GetProperty("month").GetInt32(), d.GetProperty("day").GetInt32());
                result[date] = sum.ValueKind == JsonValueKind.String
                    ? double.Parse(sum.GetString()!, CultureInfo.InvariantCulture)
                    : sum.GetDouble();
            }
        }
        return result;
    }

    private async Task<HealthTokens> TokenRequestAsync(Dictionary<string, string> form, CancellationToken ct)
    {
        form["client_id"] = O.ClientId;
        form["client_secret"] = O.ClientSecret;
        using var content = new FormUrlEncodedContent(form);
        using var res = await http.PostAsync("https://oauth2.googleapis.com/token", content, ct);
        if (res.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized)
            throw new HealthAuthException("Tilgangen til Fitbit-data er utløpt.");
        res.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStreamAsync(ct));
        var r = doc.RootElement;
        return new HealthTokens(
            r.GetProperty("access_token").GetString()!,
            r.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : null,
            r.GetProperty("expires_in").GetInt32(),
            r.TryGetProperty("scope", out var s) ? s.GetString() ?? "" : "");
    }

    private static Task ThrowIfUnauthorized(HttpResponseMessage res) =>
        res.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden
            ? throw new HealthAuthException("Google Health avviste tilgangen.")
            : Task.CompletedTask;

    private static object Civil(DateOnly d) => new { year = d.Year, month = d.Month, day = d.Day };
}
