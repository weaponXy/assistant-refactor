// dataAccess.Api/Controllers/ForecastController.cs
using Microsoft.AspNetCore.Mvc;
using dataAccess.Services;

namespace dataAccess.Api.Controllers;

[ApiController]
[Route("api/forecast")]
public sealed class ForecastController : ControllerBase
{
    private readonly SimpleForecastService _svc;
    public ForecastController(SimpleForecastService svc) { _svc = svc; }

    [HttpGet("sales")]
    public async Task<IActionResult> Sales([FromQuery] int days = 30, [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null, CancellationToken ct = default)
        => Ok(await _svc.ForecastAsync(ForecastDomain.Sales, Clamp(days), from, to, ct));

    [HttpGet("expenses")]
    public async Task<IActionResult> Expenses([FromQuery] int days = 30, [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null, CancellationToken ct = default)
        => Ok(await _svc.ForecastAsync(ForecastDomain.Expenses, Clamp(days), from, to, ct));

    private static int Clamp(int d) => d <= 0 ? 30 : Math.Min(d, 60);
}
