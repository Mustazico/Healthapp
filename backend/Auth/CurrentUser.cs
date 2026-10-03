using System.Security.Claims;

namespace backend.Auth;

public static class AppClaims
{
    public const string UserId = "uid";
}

public interface ICurrentUser
{
    int UserId { get; }
}

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public int UserId =>
        int.TryParse(accessor.HttpContext?.User.FindFirstValue(AppClaims.UserId), out var id) ? id : 0;
}
