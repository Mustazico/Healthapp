using backend.Auth;
using backend.Data;
using Microsoft.EntityFrameworkCore;

namespace backend.Endpoints;

public static class BackupEndpoints
{
    public static void MapBackupEndpoints(this WebApplication app)
    {
        // Contains every user's data, so admin only.
        app.MapGet("/api/backup", async (AppDbContext db) =>
        {
            var tmp = Path.Combine(Path.GetTempPath(), $"nutritrack-{Guid.NewGuid():N}.db");
            try
            {
                await db.Database.ExecuteSqlAsync($"VACUUM INTO {tmp}");
                var bytes = await File.ReadAllBytesAsync(tmp);
                return Results.File(bytes, "application/vnd.sqlite3", $"nutritrack-{DateTime.UtcNow:yyyyMMdd-HHmm}.db");
            }
            finally
            {
                File.Delete(tmp);
            }
        }).RequireAuthorization(Policies.Admin);
    }
}
