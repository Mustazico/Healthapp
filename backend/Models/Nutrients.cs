using System.ComponentModel.DataAnnotations;

namespace backend.Models;

public class Nutrients
{
    [Range(0, 100_000)] public double Kcal { get; set; }
    [Range(0, 10_000)] public double Protein { get; set; }
    [Range(0, 10_000)] public double Carbs { get; set; }
    [Range(0, 10_000)] public double Fat { get; set; }
    [Range(0, 10_000)] public double SaturatedFat { get; set; }
    [Range(0, 10_000)] public double Sugar { get; set; }
    [Range(0, 10_000)] public double Fiber { get; set; }
    [Range(0, 10_000)] public double Salt { get; set; }
}
