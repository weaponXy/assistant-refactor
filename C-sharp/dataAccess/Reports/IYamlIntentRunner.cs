using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace dataAccess.Reports;

/// <summary>
/// Interface for intent classification using YAML-driven prompts.
/// Enables mocking in tests while maintaining loose coupling.
/// </summary>
public interface IYamlIntentRunner
{
    /// <summary>
    /// Classifies user intent using the router.intent.yaml configuration.
    /// </summary>
    /// <param name="userText">The user's natural language query</param>
    /// <param name="ct">Cancellation token</param>
    /// <returns>JsonDocument containing intent, domain, sub_intent, and confidence</returns>
    Task<JsonDocument> RunIntentAsync(string userText, CancellationToken ct);
}
