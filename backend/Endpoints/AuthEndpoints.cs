using System.Security.Claims;
using backend.Auth;
using backend.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Options;

namespace backend.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var googleConfigured = AuthSetup.GoogleConfigured(app.Configuration);
        var devLogin = app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("Auth:EnableDevLogin");

        app.MapGet("/auth/providers", () => new { google = googleConfigured, dev = devLogin });

        app.MapGet("/auth/login", (string? returnUrl) =>
        {
            if (googleConfigured)
                return Results.Challenge(new AuthenticationProperties { RedirectUri = SafeReturnUrl(returnUrl), IsPersistent = true });

            if (devLogin)
            {
                var email = app.Configuration["Auth:DefaultDevEmail"] ?? "dev1@example.com";
                return Results.Redirect($"/auth/dev-login?email={Uri.EscapeDataString(email)}&returnUrl={Uri.EscapeDataString(SafeReturnUrl(returnUrl))}");
            }

            return Results.Problem("Innlogging er ikke konfigurert på serveren.", statusCode: 503);
        });

        app.MapPost("/auth/logout", async (HttpContext ctx) =>
        {
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        });

        app.MapGet("/api/me", (ClaimsPrincipal user, IOptionsMonitor<AuthSettings> settings) =>
        {
            var email = user.FindFirstValue(ClaimTypes.Email);
            return new
            {
                id = int.Parse(user.FindFirstValue(AppClaims.UserId)!),
                email,
                name = user.FindFirstValue(ClaimTypes.Name),
                isAdmin = settings.CurrentValue.IsAdmin(email),
            };
        }).RequireAuthorization(Policies.AppUser);

        if (devLogin)
        {
            // Development only: sign in as an allow-listed email without Google.
            app.MapGet("/auth/dev-login", async (string email, string? returnUrl, HttpContext ctx, AppDbContext db, IOptionsMonitor<AuthSettings> settings) =>
            {
                if (!settings.CurrentValue.IsAllowed(email)) return Results.Forbid();
                var user = await AuthSetup.UpsertUserAsync(db, "dev:" + email.ToLowerInvariant(), email, email.Split('@')[0]);
                await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, AuthSetup.CreatePrincipal(user),
                    new AuthenticationProperties { IsPersistent = true });
                return Results.Redirect(SafeReturnUrl(returnUrl));
            });
        }
    }

    private static string SafeReturnUrl(string? url) =>
        !string.IsNullOrEmpty(url) && url.StartsWith('/') && !url.StartsWith("//") && !url.StartsWith("/\\")
            ? url
            : "/";
}
