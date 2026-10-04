namespace backend.Models;

public enum FoodSource { Manual, Kassalapp, OpenFoodFacts, Matvaretabellen }

public enum Meal { Breakfast, Lunch, Dinner, Supper, Snacks }

public enum Sex { Male, Female }

public class User
{
    public int Id { get; set; }
    public string GoogleSubject { get; set; } = "";
    public string Email { get; set; } = "";
    public string Name { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Shared across the household.
public class Food
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Brand { get; set; }
    public string? Ean { get; set; }
    public FoodSource Source { get; set; }
    public string? ImageUrl { get; set; }
    public double? ServingGrams { get; set; }
    public Nutrients Per100g { get; set; } = new();
    public int? CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// Shared across the household.
public class Recipe
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Notes { get; set; }
    public double? CookedWeightGrams { get; set; }
    public int? CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }
    public List<RecipeIngredient> Ingredients { get; set; } = [];
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class RecipeIngredient
{
    public int Id { get; set; }
    public int RecipeId { get; set; }
    public int FoodId { get; set; }
    public Food Food { get; set; } = null!;
    public double Grams { get; set; }
}

// Private per user. Nutrients is a snapshot so later food/recipe edits don't rewrite history.
public class LogEntry
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public DateOnly Date { get; set; }
    public Meal Meal { get; set; }
    public string Name { get; set; } = "";
    public double Grams { get; set; }
    public Nutrients Nutrients { get; set; } = new();
    public int? FoodId { get; set; }
    public int? RecipeId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Private per user.
public class MacroGoals
{
    public double Carbs { get; set; } = 250;
    public double Fat { get; set; } = 80;
    public double SaturatedFat { get; set; } = 25;
    public double Protein { get; set; } = 120;
    public double Fiber { get; set; } = 30;
    public double Sugar { get; set; } = 50;
}

public class Profile
{
    public int UserId { get; set; }
    public Sex Sex { get; set; }
    public DateOnly BirthDate { get; set; }
    public double HeightCm { get; set; }
    public double ActivityFactor { get; set; } = 1.4;
    public double DeficitKcal { get; set; } = 500;
    public double ProteinPerKg { get; set; } = 1.6;
    public MacroGoals Goals { get; set; } = new();
}

// Private per user.
public class WeightEntry
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public DateOnly Date { get; set; }
    public double WeightKg { get; set; }
}

// Private per user. Google Health API (Fitbit) connection; tokens are encrypted with ASP.NET Data Protection.
public class HealthConnection
{
    public int UserId { get; set; }
    public string HealthUserId { get; set; } = "";
    public string AccessTokenProtected { get; set; } = "";
    public string RefreshTokenProtected { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public DateTime ConnectedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastSyncAt { get; set; }
    public string? LastError { get; set; }
}

// Private per user. Total calories burned per day as measured by a wearable.
public class DailyEnergy
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public DateOnly Date { get; set; }
    public double CaloriesOut { get; set; }
    public int Steps { get; set; }
    public string Source { get; set; } = "Fitbit";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// Private per user. Marks a day as intentionally omitted from trend/stat calculations.
public class SkippedDay
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public DateOnly Date { get; set; }
}
