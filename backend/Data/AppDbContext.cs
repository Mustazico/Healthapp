using backend.Auth;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options, ICurrentUser currentUser) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Food> Foods => Set<Food>();
    public DbSet<Recipe> Recipes => Set<Recipe>();
    public DbSet<RecipeIngredient> RecipeIngredients => Set<RecipeIngredient>();
    public DbSet<LogEntry> LogEntries => Set<LogEntry>();
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<WeightEntry> WeightEntries => Set<WeightEntry>();
    public DbSet<HealthConnection> HealthConnections => Set<HealthConnection>();
    public DbSet<DailyEnergy> DailyEnergies => Set<DailyEnergy>();

    // Referenced by query filters; EF re-evaluates it per query.
    private int CurrentUserId => currentUser.UserId;

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasIndex(u => u.GoogleSubject).IsUnique();
            e.Property(u => u.GoogleSubject).HasMaxLength(200);
            e.Property(u => u.Email).HasMaxLength(320);
            e.Property(u => u.Name).HasMaxLength(200);
        });

        b.Entity<Food>(e =>
        {
            e.ToTable("foods");
            e.HasIndex(f => f.Ean).IsUnique();
            e.HasIndex(f => f.Name);
            e.Property(f => f.Name).HasMaxLength(200);
            e.Property(f => f.Brand).HasMaxLength(200);
            e.Property(f => f.Ean).HasMaxLength(14);
            e.Property(f => f.ImageUrl).HasMaxLength(1000);
            e.Property(f => f.Source).HasConversion<string>().HasMaxLength(20);
            e.ComplexProperty(f => f.Per100g);
            e.HasOne(f => f.CreatedByUser).WithMany().HasForeignKey(f => f.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Recipe>(e =>
        {
            e.ToTable("recipes");
            e.Property(r => r.Name).HasMaxLength(200);
            e.Property(r => r.Notes).HasMaxLength(4000);
            e.HasMany(r => r.Ingredients).WithOne().HasForeignKey(i => i.RecipeId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(r => r.CreatedByUser).WithMany().HasForeignKey(r => r.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<RecipeIngredient>(e =>
        {
            e.ToTable("recipe_ingredients");
            e.HasOne(i => i.Food).WithMany().HasForeignKey(i => i.FoodId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<LogEntry>(e =>
        {
            e.ToTable("log_entries");
            e.HasIndex(l => new { l.UserId, l.Date });
            e.Property(l => l.Name).HasMaxLength(200);
            e.Property(l => l.Meal).HasConversion<string>().HasMaxLength(20);
            e.ComplexProperty(l => l.Nutrients);
            e.HasOne<User>().WithMany().HasForeignKey(l => l.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Food>().WithMany().HasForeignKey(l => l.FoodId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne<Recipe>().WithMany().HasForeignKey(l => l.RecipeId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(l => l.UserId == CurrentUserId);
        });

        b.Entity<Profile>(e =>
        {
            e.ToTable("profiles");
            e.HasKey(p => p.UserId);
            e.Property(p => p.Sex).HasConversion<string>().HasMaxLength(10);
            e.HasOne<User>().WithOne().HasForeignKey<Profile>(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(p => p.UserId == CurrentUserId);
        });

        b.Entity<WeightEntry>(e =>
        {
            e.ToTable("weight_entries");
            e.HasIndex(w => new { w.UserId, w.Date }).IsUnique();
            e.HasOne<User>().WithMany().HasForeignKey(w => w.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(w => w.UserId == CurrentUserId);
        });

        b.Entity<HealthConnection>(e =>
        {
            e.ToTable("health_connections");
            e.HasKey(c => c.UserId);
            e.Property(c => c.HealthUserId).HasMaxLength(64);
            e.Property(c => c.LastError).HasMaxLength(500);
            e.HasOne<User>().WithOne().HasForeignKey<HealthConnection>(c => c.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(c => c.UserId == CurrentUserId);
        });

        b.Entity<DailyEnergy>(e =>
        {
            e.ToTable("daily_energy");
            e.HasIndex(d => new { d.UserId, d.Date }).IsUnique();
            e.Property(d => d.Source).HasMaxLength(20);
            e.HasOne<User>().WithMany().HasForeignKey(d => d.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(d => d.UserId == CurrentUserId);
        });
    }
}
