using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using backend.Auth;
using backend.Data;
using backend.Endpoints;
using backend.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace backend;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        var connectionString = builder.Configuration.GetConnectionString("Default")!;

        // Containers lose the default key ring on redeploy, which would invalidate login cookies and stored Fitbit tokens.
        var keysPath = builder.Configuration["DataProtection:KeysPath"];
        if (!string.IsNullOrWhiteSpace(keysPath))
        {
            builder.Services.AddDataProtection()
                .SetApplicationName("NutriTrack")
                .PersistKeysToFileSystem(new DirectoryInfo(keysPath));
        }

        builder.AddAppAuth();
        builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(connectionString));

        builder.Services.Configure<KassalappOptions>(builder.Configuration.GetSection("Kassalapp"));
        builder.Services.AddHttpClient<KassalappClient>((sp, http) =>
        {
            var o = sp.GetRequiredService<IOptions<KassalappOptions>>().Value;
            http.BaseAddress = new Uri(o.BaseUrl);
            http.Timeout = TimeSpan.FromSeconds(8);
            if (!string.IsNullOrWhiteSpace(o.ApiKey))
                http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", o.ApiKey);
        });
        builder.Services.AddHttpClient<OpenFoodFactsClient>(http =>
        {
            http.BaseAddress = new Uri("https://world.openfoodfacts.org/");
            http.Timeout = TimeSpan.FromSeconds(8);
            http.DefaultRequestHeaders.UserAgent.ParseAdd("NutriTrack/1.0 (personal nutrition tracker)");
        });
        builder.Services.AddHttpClient<MatvaretabellenClient>(http =>
        {
            http.BaseAddress = new Uri("https://www.matvaretabellen.no/");
            // The full table is ~13 MB.
            http.Timeout = TimeSpan.FromSeconds(60);
        });
        builder.Services.AddScoped<FoodLookupService>();

        builder.Services.Configure<GoogleHealthOptions>(builder.Configuration.GetSection("GoogleHealth"));
        // Defaults to the same Google OAuth client as sign-in, so only one set of credentials is needed.
        builder.Services.PostConfigure<GoogleHealthOptions>(o =>
        {
            if (string.IsNullOrWhiteSpace(o.ClientId)) o.ClientId = builder.Configuration["Authentication:Google:ClientId"] ?? "";
            if (string.IsNullOrWhiteSpace(o.ClientSecret)) o.ClientSecret = builder.Configuration["Authentication:Google:ClientSecret"] ?? "";
        });
        builder.Services.AddHttpClient<GoogleHealthClient>(http => http.Timeout = TimeSpan.FromSeconds(20));
        builder.Services.AddScoped<HealthSyncService>();
        builder.Services.AddMemoryCache();

        builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
        builder.Services.AddValidation();
        builder.Services.AddProblemDetails();
        builder.Services.AddOpenApi();

        var app = builder.Build();

        EnsureDatabase(app, connectionString);

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }
        else
        {
            app.UseExceptionHandler();
            app.UseHsts();
            app.UseHttpsRedirection();
        }

        app.Use(async (ctx, next) =>
        {
            var h = ctx.Response.Headers;
            h.XContentTypeOptions = "nosniff";
            h.XFrameOptions = "DENY";
            h["Referrer-Policy"] = "same-origin";
            await next();
        });

        app.UseDefaultFiles();
        app.UseStaticFiles();
        app.UseAuthentication();
        app.UseAuthorization();

        app.MapAuthEndpoints();
        app.MapFoodEndpoints();
        app.MapRecipeEndpoints();
        app.MapLogEndpoints();
        app.MapProfileEndpoints();
        app.MapStatsEndpoints();
        app.MapBackupEndpoints();
        app.MapFitbitEndpoints();

        app.MapFallback("/api/{**rest}", () => Results.NotFound());
        app.MapFallbackToFile("index.html");

        app.Run();
    }

    private static void EnsureDatabase(WebApplication app, string connectionString)
    {
        var dataSource = new SqliteConnectionStringBuilder(connectionString).DataSource;
        var dir = Path.GetDirectoryName(Path.GetFullPath(dataSource));
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.Migrate();

        var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var connection = db.Database.GetDbConnection();
        connection.Open();
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "PRAGMA table_info('profiles');";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                var name = reader.GetString(reader.GetOrdinal("name"));
                columns.Add(name);
            }
        }

        foreach (var column in new[]
                 {
                     (Name: "goals_carbs", Default: "250"),
                     (Name: "goals_fat", Default: "80"),
                     (Name: "goals_saturated_fat", Default: "25"),
                     (Name: "goals_protein", Default: "120"),
                     (Name: "goals_fiber", Default: "30"),
                     (Name: "goals_sugar", Default: "50"),
                 })
        {
            if (columns.Contains(column.Name)) continue;
            db.Database.ExecuteSqlRaw($"ALTER TABLE profiles ADD COLUMN {column.Name} REAL NOT NULL DEFAULT {column.Default};");
        }

        // WAL is unreliable on Azure App Service's network-backed /home share.
        db.Database.ExecuteSqlRaw("PRAGMA journal_mode=DELETE;");
    }
}
