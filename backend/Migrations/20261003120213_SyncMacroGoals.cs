using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    /// <inheritdoc />
    public partial class SyncMacroGoals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "goals_carbs",
                table: "profiles",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "goals_fat",
                table: "profiles",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "goals_fiber",
                table: "profiles",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "goals_protein",
                table: "profiles",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "goals_saturated_fat",
                table: "profiles",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "goals_sugar",
                table: "profiles",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "goals_carbs",
                table: "profiles");

            migrationBuilder.DropColumn(
                name: "goals_fat",
                table: "profiles");

            migrationBuilder.DropColumn(
                name: "goals_fiber",
                table: "profiles");

            migrationBuilder.DropColumn(
                name: "goals_protein",
                table: "profiles");

            migrationBuilder.DropColumn(
                name: "goals_saturated_fat",
                table: "profiles");

            migrationBuilder.DropColumn(
                name: "goals_sugar",
                table: "profiles");
        }
    }
}
