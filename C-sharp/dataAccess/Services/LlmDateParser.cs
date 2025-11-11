using System.Text.Json;
using dataAccess.LLM;
using dataAccess.Planning;
using dataAccess.Reports;
using Microsoft.Extensions.Logging;

namespace dataAccess.Services;

/// <summary>
/// LLM-based date parser service that uses Groq's 8B model to convert natural language
/// date queries into precise DateTime ranges. This replaces the brittle static DateRangeResolver.
/// </summary>
public sealed class LlmDateParser : ILlmDateParser
{
    private readonly GroqJsonClient _groq;
    private readonly PromptLoader _promptLoader;
    private readonly ILogger<LlmDateParser> _logger;
    private readonly string _promptTemplate;

    public LlmDateParser(
        GroqJsonClient groq,
        PromptLoader promptLoader,
        ILogger<LlmDateParser> logger)
    {
        _groq = groq;
        _promptLoader = promptLoader;
        _logger = logger;

        // Load the datetime parsing prompt template
        _promptTemplate = _promptLoader.ReadText("datetime.parse.yaml");
    }

    public async Task<(DateTime StartDate, DateTime EndDate)> ParseDateRangeAsync(
        string dateQuery,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dateQuery))
        {
            _logger.LogWarning("Empty date query provided, defaulting to 'yesterday'");
            dateQuery = "yesterday";
        }

        try
        {
            _logger.LogInformation("Parsing date query with LLM: {DateQuery}", dateQuery);

            // Prepare the prompt with current date
            var currentDate = DateTime.Now.ToString("yyyy-MM-dd");
            var systemPrompt = _promptTemplate
                .Replace("[CURRENT_DATE]", currentDate);

            // Call Groq LLM (8B specialist model)
            var result = await _groq.CompleteJsonAsyncChat(
                system: systemPrompt,
                user: $"Parse this date query: \"{dateQuery}\"",
                temperature: 0.0,
                ct: ct);

            // Parse the JSON response
            var json = result.RootElement;
            
            if (!json.TryGetProperty("startDate", out var startDateElem) ||
                !json.TryGetProperty("endDate", out var endDateElem))
            {
                throw new InvalidOperationException(
                    $"LLM response missing required fields. Response: {result.RootElement}");
            }

            var startDateStr = startDateElem.GetString();
            var endDateStr = endDateElem.GetString();

            if (!DateTime.TryParse(startDateStr, out var startDate) ||
                !DateTime.TryParse(endDateStr, out var endDate))
            {
                throw new InvalidOperationException(
                    $"Failed to parse dates from LLM response. Start: {startDateStr}, End: {endDateStr}");
            }

            _logger.LogInformation(
                "Successfully parsed date query '{Query}' to range: {Start} to {End}",
                dateQuery, startDate.ToString("yyyy-MM-dd"), endDate.ToString("yyyy-MM-dd"));

            return (startDate, endDate);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse date query with LLM: {DateQuery}", dateQuery);
            
            // Fallback: Use yesterday as a safe default
            _logger.LogWarning("Falling back to 'yesterday' due to parsing error");
            var yesterday = DateTime.Now.AddDays(-1).Date;
            return (yesterday, yesterday);
        }
    }
}
