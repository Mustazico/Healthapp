using System.Security.Claims;
using backend.Data;
using backend.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace backend.Auth;

public class AuthSettings
{
    public string[] AllowedEmails { get; set; } = [];
    public string[] AdminEmails { get; set; } = [];
    public bool EnableDevLogin { get; set; }

    public bool IsAllowed(string? email) =>
        email is not null &&
        (AllowedEmails.Contains(email, StringComparer.OrdinalIgnoreCase) ||
         (EnableDevLogin && Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Development"));

    public bool IsAdmin(string? email) =>
        email is not null && AdminEmails.Contains(email, StringComparer.OrdinalIgnoreCase);
}

public static class Policies
{
    public const string AppUser = "AppUser";
    public const string Admin = "Admin";
}

// Re-checked on every request so removing an email revokes access even with a valid cookie.
public sealed class AllowedEmailRequirement(bool adminOnly) : IAuthorizationRequirement
{
    public bool AdminOnly { get; } = adminOnly;
}

public sealed class AllowedEmailHandler(IOptionsMonitor<AuthSettings> settings) : AuthorizationHandler<AllowedEmailRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, AllowedEmailRequirement requirement)
    {
        var email = context.User.FindFirstValue(ClaimTypes.Email);
        var s = settings.CurrentValue;
        if (s.IsAllowed(email) && (!requirement.AdminOnly || s.IsAdmin(email)))
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}

public static class AuthSetup
{
    public static bool GoogleConfigured(IConfiguration config) =>
        !string.IsNullOrWhiteSpace(config["Authentication:Google:ClientId"]) &&
        !string.IsNullOrWhiteSpace(config["Authentication:Google:ClientSecret"]);

    public static void AddAppAuth(this WebApplicationBuilder builder)
    {
        var config = builder.Configuration;
        builder.Services.Configure<AuthSettings>(config.GetSection("Auth"));
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
        builder.Services.AddSingleton<IAuthorizationHandler, AllowedEmailHandler>();

        var google = GoogleConfigured(config);
        var auth = builder.Services
            .AddAuthentication(o =>
            {
                o.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                o.DefaultChallengeScheme = google ? GoogleDefaults.AuthenticationScheme : CookieAuthenticationDefaults.AuthenticationScheme;
            })
            .AddCookie(o =>
            {
                o.Cookie.Name = "nt.auth";
                o.Cookie.HttpOnly = true;
                o.Cookie.SameSite = SameSiteMode.Lax;
                o.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
                    ? CookieSecurePolicy.SameAsRequest
                    : CookieSecurePolicy.Always;
                o.ExpireTimeSpan = TimeSpan.FromDays(30);
                o.SlidingExpiration = true;
                // SPA handles navigation; API callers get status codes instead of redirects.
                o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
                o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
            });

        if (google)
        {
            auth.AddGoogle(o =>
            {
                o.ClientId = config["Authentication:Google:ClientId"]!;
                o.ClientSecret = config["Authentication:Google:ClientSecret"]!;
                o.Events.OnTicketReceived = OnGoogleTicketAsync;
            });
        }

        builder.Services.AddAuthorizationBuilder()
            .AddPolicy(Policies.AppUser, p => p
                .RequireAuthenticatedUser()
                .RequireClaim(AppClaims.UserId)
                .AddRequirements(new AllowedEmailRequirement(adminOnly: false)))
            .AddPolicy(Policies.Admin, p => p
                .RequireAuthenticatedUser()
                .RequireClaim(AppClaims.UserId)
                .AddRequirements(new AllowedEmailRequirement(adminOnly: true)));
    }

    private static async Task OnGoogleTicketAsync(TicketReceivedContext ctx)
    {
        var settings = ctx.HttpContext.RequestServices.GetRequiredService<IOptionsMonitor<AuthSettings>>().CurrentValue;
        var subject = ctx.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        var email = ctx.Principal?.FindFirstValue(ClaimTypes.Email);
        var name = ctx.Principal?.FindFirstValue(ClaimTypes.Name) ?? email ?? "";

        if (subject is null || !settings.IsAllowed(email))
        {
            ctx.Response.Redirect("/login?error=denied");
            ctx.HandleResponse();
            return;
        }

        var db = ctx.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
        var user = await UpsertUserAsync(db, subject, email!, name);
        ctx.Principal = CreatePrincipal(user);
        ctx.Properties!.IsPersistent = true;
    }

    public static async Task<User> UpsertUserAsync(AppDbContext db, string subject, string email, string name)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleSubject == subject);
        if (user is null)
        {
            user = new User { GoogleSubject = subject };
            db.Users.Add(user);
        }
        user.Email = email;
        user.Name = name;
        await db.SaveChangesAsync();
        return user;
    }

    public static ClaimsPrincipal CreatePrincipal(User user) =>
        new(new ClaimsIdentity(
            [
                new Claim(AppClaims.UserId, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Name, user.Name),
            ],
            CookieAuthenticationDefaults.AuthenticationScheme));
}
