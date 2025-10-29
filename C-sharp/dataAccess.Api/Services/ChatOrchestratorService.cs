using Microsoft.SemanticKernel;
using System.Text.Json;
using System.Runtime.CompilerServices;
using dataAccess.Services;

namespace dataAccess.Api.Services;

/// <summary>
/// Orchestrates the chat pipeline: Intent Classification → SQL Generation → Query Execution → Result Summarization
/// </summary>
public interface IChatOrchestratorService
{
    /// <summary>
    /// Handles a user query through the full pipeline.
    /// </summary>
    /// <param name="userQuery">The user's natural language query</param>
    /// <param name="userId">The user ID for telemetry</param>
    /// <param name="sessionId">Optional session ID for context</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Natural language response</returns>
    Task<ChatOrchestrationResult> HandleQueryAsync(
        string userQuery, 
        Guid userId, 
        Guid? sessionId = null, 
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Handles a user query with streaming response for real-time updates.
    /// Yields tokens as they are generated from the LLM.
    /// </summary>
    /// <param name="userQuery">The user's natural language query</param>
    /// <param name="userId">The user ID for telemetry</param>
    /// <param name="sessionId">Optional session ID for context</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Stream of response tokens and metadata updates</returns>
    IAsyncEnumerable<StreamingChunk> StreamQueryAsync(
        string userQuery,
        Guid userId,
        Guid? sessionId = null,
        CancellationToken cancellationToken = default);
}

public class ChatOrchestratorService : IChatOrchestratorService
{
    private readonly Kernel _kernel;
    private readonly IDatabaseSchemaService _schemaService;
    private readonly TelemetryLogger _telemetryLogger;
    private readonly ILogger<ChatOrchestratorService> _logger;
    private readonly SqlValidator _sqlValidator;
    private readonly ISafeSqlExecutor _safeSqlExecutor;
    private readonly int _maxResultRows;

    public ChatOrchestratorService(
        Kernel kernel,
        IDatabaseSchemaService schemaService,
        TelemetryLogger telemetryLogger,
        IConfiguration configuration,
        ILogger<ChatOrchestratorService> logger,
        SqlValidator sqlValidator,
        ISafeSqlExecutor safeSqlExecutor)
    {
        _kernel = kernel;
        _schemaService = schemaService;
        _telemetryLogger = telemetryLogger;
        _logger = logger;
        _sqlValidator = sqlValidator;
        _safeSqlExecutor = safeSqlExecutor;
        _maxResultRows = configuration.GetValue<int?>("SqlExecution:MaxRows") ?? 1000;
    }

    public async Task<ChatOrchestrationResult> HandleQueryAsync(
        string userQuery,
        Guid userId,
        Guid? sessionId = null,
        CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;
        var result = new ChatOrchestrationResult
        {
            UserQuery = userQuery,
            UserId = userId,
            SessionId = sessionId ?? Guid.NewGuid()
        };

        try
        {
            _logger.LogInformation("Processing query for user {UserId}: {Query}", userId, userQuery);

            // Step 1: Classify Intent (with session context)
            var intent = await ClassifyIntentAsync(userQuery, result.SessionId, cancellationToken);
            result.Intent = intent;
            result.IntentClassificationLatencyMs = (int)(DateTime.UtcNow - startTime).TotalMilliseconds;

            _logger.LogInformation("Classified intent as: {Intent}", intent);

            // Route based on intent
            switch (intent.Trim())
            {
                case "GetDataQuery":
                    await HandleDataQueryAsync(result, cancellationToken);
                    break;

                case "BusinessRuleQuery":
                    result.Response = "Business rules RAG is not yet implemented. This feature is coming in Day 4!";
                    result.IsSuccess = true;
                    break;

                case "ChitChat":
                    result.Response = HandleChitChat(userQuery);
                    result.IsSuccess = true;
                    break;

                case "Clarification":
                    result.Response = HandleClarification(userQuery);
                    result.IsSuccess = true;
                    break;

                case "OutOfScope":
                    result.Response = HandleOutOfScope();
                    result.IsSuccess = true;
                    break;

                default:
                    result.Response = "Sorry, I'm not sure how to handle that request. Can you rephrase it?";
                    result.IsSuccess = false;
                    break;
            }

            result.TotalLatencyMs = (int)(DateTime.UtcNow - startTime).TotalMilliseconds;

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing query: {Query}", userQuery);
            result.IsSuccess = false;
            result.ErrorMessage = ex.Message;
            result.Response = "Sorry, I encountered an error processing your request. Please try again.";
            result.TotalLatencyMs = (int)(DateTime.UtcNow - startTime).TotalMilliseconds;
            return result;
        }
    }

    public async IAsyncEnumerable<StreamingChunk> StreamQueryAsync(
        string userQuery,
        Guid userId,
        Guid? sessionId = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;
        var actualSessionId = sessionId ?? Guid.NewGuid();

        _logger.LogInformation("Streaming query for user {UserId}: {Query}", userId, userQuery);

        // Step 1: Classify Intent
        yield return new StreamingChunk
        {
            Type = "metadata",
            Metadata = new Dictionary<string, object>
            {
                ["step"] = "intent_classification",
                ["status"] = "started"
            }
        };

        string intent;
        var intentError = false;
        try
        {
            intent = await ClassifyIntentAsync(userQuery, actualSessionId, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error classifying intent: {Query}", userQuery);
            intent = string.Empty;
            intentError = true;
        }

        if (intentError)
        {
            yield return new StreamingChunk { Type = "error", Error = "Sorry, I encountered an error. Please try again." };
            yield break;
        }

        yield return new StreamingChunk
        {
            Type = "metadata",
            Metadata = new Dictionary<string, object>
            {
                ["step"] = "intent_classification",
                ["status"] = "completed",
                ["intent"] = intent
            }
        };

        // Route based on intent
        if (intent.Trim() == "GetDataQuery")
        {
            await foreach (var chunk in StreamDataQueryAsync(userQuery, userId, actualSessionId, cancellationToken))
            {
                yield return chunk;
            }
        }
        else
        {
            // Non-streaming responses for simple intents
            string response = intent.Trim() switch
            {
                "BusinessRuleQuery" => "Business rules RAG is not yet implemented. This feature is coming in Day 4!",
                "ChitChat" => HandleChitChat(userQuery),
                "Clarification" => HandleClarification(userQuery),
                "OutOfScope" => HandleOutOfScope(),
                _ => "Sorry, I'm not sure how to handle that request. Can you rephrase it?"
            };

            yield return new StreamingChunk
            {
                Type = "content",
                Content = response
            };
        }

        // Final done signal
        yield return new StreamingChunk
        {
            Type = "done",
            Metadata = new Dictionary<string, object>
            {
                ["total_latency_ms"] = (DateTime.UtcNow - startTime).TotalMilliseconds
            }
        };
    }

    private async IAsyncEnumerable<StreamingChunk> StreamDataQueryAsync(
        string userQuery,
        Guid userId,
        Guid sessionId,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        // Step 2: Get schema
        yield return new StreamingChunk
        {
            Type = "metadata",
            Metadata = new Dictionary<string, object>
            {
                ["step"] = "schema_retrieval",
                ["status"] = "started"
            }
        };

        string schema;
        var schemaError = false;
        try
        {
            schema = await _schemaService.GetRelevantSchemaAsync(userQuery);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving schema");
            schema = string.Empty;
            schemaError = true;
        }

        if (schemaError)
        {
            yield return new StreamingChunk { Type = "error", Error = "Error retrieving database schema." };
            yield break;
        }

        yield return new StreamingChunk
        {
            Type = "metadata",
            Metadata = new Dictionary<string, object>
            {
                ["step"] = "schema_retrieval",
                ["status"] = "completed"
            }
        };

        // Step 3: Generate SQL
        yield return new StreamingChunk
        {
            Type = "metadata",
            Metadata = new Dictionary<string, object>
            {
                ["step"] = "sql_generation",
                ["status"] = "started"
            }
        };

        string sql = string.Empty;
        var sqlError = false;
        string? sqlErrorMessage = null;

        try
        {
            var generateSqlFunction = _kernel.Plugins.GetFunction("Database", "GenerateSql");
            var sqlResult = await _kernel.InvokeAsync(
                generateSqlFunction,
                new KernelArguments
                {
                    ["input"] = userQuery,
                    ["schema"] = schema,
                    ["today"] = DateTime.Today.ToString("yyyy-MM-dd")
                },
                cancellationToken
            );

            var sqlResponse = sqlResult.ToString();
            var sqlJson = JsonSerializer.Deserialize<SqlGenerationResponse>(sqlResponse);

            if (!string.IsNullOrEmpty(sqlJson?.Error) || string.IsNullOrEmpty(sqlJson?.Query))
            {
                sqlError = true;
                sqlErrorMessage = sqlJson?.Error ?? "I couldn't generate a SQL query for that request.";
            }
            else
            {
                sql = sqlJson.Query;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating SQL");
            sqlError = true;
            sqlErrorMessage = "Error generating SQL query.";
        }

        if (sqlError)
        {
            yield return new StreamingChunk { Type = "error", Error = sqlErrorMessage ?? "Error generating SQL" };
            yield break;
        }

        var (isValid, validationMessage) = _sqlValidator.ValidateSql(sql);
        if (!isValid)
        {
            yield return new StreamingChunk { Type = "error", Error = validationMessage ?? "Generated SQL failed safety checks." };
            yield break;
        }

        sql = _sqlValidator.EnsureLimit(sql, _maxResultRows);

        yield return new StreamingChunk
        {
            Type = "metadata",
            Metadata = new Dictionary<string, object>
            {
                ["step"] = "sql_generation",
                ["status"] = "completed",
                ["sql"] = sql
            }
        };

        // Step 4: Execute SQL
        yield return new StreamingChunk
        {
            Type = "metadata",
            Metadata = new Dictionary<string, object>
            {
                ["step"] = "query_execution",
                ["status"] = "started"
            }
        };

        List<Dictionary<string, object?>> queryData;
        Exception? executionError = null;
        try
        {
            queryData = await _safeSqlExecutor.ExecuteQueryAsync(sql, cancellationToken);
        }
        catch (Exception ex)
        {
            executionError = ex;
            queryData = new List<Dictionary<string, object?>>();
        }

        if (executionError != null)
        {
            _logger.LogError(executionError, "Error executing SQL");
            yield return new StreamingChunk { Type = "error", Error = "Error executing query." };
            yield break;
        }

        yield return new StreamingChunk
        {
            Type = "metadata",
            Metadata = new Dictionary<string, object>
            {
                ["step"] = "query_execution",
                ["status"] = "completed",
                ["result_count"] = queryData.Count
            }
        };

        // Step 5: Summarize results (streaming)
        yield return new StreamingChunk
        {
            Type = "metadata",
            Metadata = new Dictionary<string, object>
            {
                ["step"] = "summarization",
                ["status"] = "started"
            }
        };

        await foreach (var token in StreamSummarizationAsync(userQuery, queryData, cancellationToken))
        {
            yield return token;
        }

        yield return new StreamingChunk
        {
            Type = "metadata",
            Metadata = new Dictionary<string, object>
            {
                ["step"] = "summarization",
                ["status"] = "completed"
            }
        };
    }

    private async IAsyncEnumerable<StreamingChunk> StreamSummarizationAsync(
        string userQuery,
        List<Dictionary<string, object?>> queryData,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        IAsyncEnumerable<StreamingKernelContent>? streamingResult = null;
        var streamError = false;

        try
        {
            var summarizeFunction = _kernel.Plugins.GetFunction("Analysis", "SummarizeResults");
            streamingResult = _kernel.InvokeStreamingAsync(
                summarizeFunction,
                new KernelArguments
                {
                    ["input"] = userQuery,
                    ["data"] = JsonSerializer.Serialize(queryData)
                },
                cancellationToken
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error starting summarization stream");
            streamError = true;
        }

        if (streamError || streamingResult == null)
        {
            yield return new StreamingChunk { Type = "error", Error = "Error summarizing results." };
            yield break;
        }

        await foreach (var token in streamingResult.WithCancellation(cancellationToken))
        {
            var content = token.ToString();
            if (!string.IsNullOrWhiteSpace(content))
            {
                yield return new StreamingChunk
                {
                    Type = "content",
                    Content = content
                };
            }
        }
    }

    private async Task<string> ClassifyIntentAsync(
        string userQuery, 
        Guid? sessionId = null, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            var routerFunction = _kernel.Plugins.GetFunction("Orchestration", "Router");
            var arguments = new KernelArguments
            {
                ["input"] = userQuery
            };

            // Inject session history for context if available
            if (sessionId.HasValue)
            {
                var history = await _telemetryLogger.GetSessionHistoryAsync(sessionId.Value, maxMessages: 10, ct: cancellationToken);
                if (history.Count > 0)
                {
                    var historyText = string.Join("\n", history.Select(m => $"{m.Role}: {m.Content}"));
                    arguments["conversation_history"] = historyText;
                    _logger.LogInformation("Injected {Count} messages of conversation history into Router context", history.Count);
                }
            }

            var intentResult = await _kernel.InvokeAsync(
                routerFunction,
                arguments,
                cancellationToken
            );

            var intent = intentResult.ToString().Trim();
            return intent;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error classifying intent for query: {Query}", userQuery);
            throw new InvalidOperationException("Intent classification failed", ex);
        }
    }

    private async Task HandleDataQueryAsync(ChatOrchestrationResult result, CancellationToken cancellationToken)
    {
        var sqlGenerationStart = DateTime.UtcNow;

        try
        {
            // Step 2: Get relevant schema
            var schema = await _schemaService.GetRelevantSchemaAsync(result.UserQuery);
            result.SchemaUsed = schema;

            // Step 3: Generate SQL
            var generateSqlFunction = _kernel.Plugins.GetFunction("Database", "GenerateSql");
            var sqlResult = await _kernel.InvokeAsync(
                generateSqlFunction,
                new KernelArguments
                {
                    ["input"] = result.UserQuery,
                    ["schema"] = schema,
                    ["today"] = DateTime.Today.ToString("yyyy-MM-dd")
                },
                cancellationToken
            );

            var sqlResponse = sqlResult.ToString();
            result.SqlGenerationLatencyMs = (int)(DateTime.UtcNow - sqlGenerationStart).TotalMilliseconds;

            // Parse the JSON response
            var sqlJson = JsonSerializer.Deserialize<SqlGenerationResponse>(sqlResponse);
            
            if (!string.IsNullOrEmpty(sqlJson?.Error))
            {
                result.Response = sqlJson.Error;
                result.IsSuccess = false;
                result.ErrorMessage = sqlJson.Error;
                return;
            }

            if (string.IsNullOrEmpty(sqlJson?.Query))
            {
                result.Response = "I couldn't generate a SQL query for that request.";
                result.IsSuccess = false;
                result.ErrorMessage = "Empty SQL query generated";
                return;
            }

            result.GeneratedSql = sqlJson.Query;

            var (isValid, validationError) = _sqlValidator.ValidateSql(result.GeneratedSql);
            if (!isValid)
            {
                result.SqlValidated = false;
                result.IsSuccess = false;
                result.ErrorMessage = validationError ?? "Generated SQL failed safety checks.";
                result.Response = result.ErrorMessage;
                return;
            }

            result.GeneratedSql = _sqlValidator.EnsureLimit(result.GeneratedSql, _maxResultRows);
            result.SqlValidated = true;

            // Step 4: Execute SQL using the hardened executor
            var executionStart = DateTime.UtcNow;
            var queryData = await _safeSqlExecutor.ExecuteQueryAsync(result.GeneratedSql, cancellationToken);
            result.SqlExecuted = true;
            result.ResultCount = queryData.Count;
            result.QueryExecutionLatencyMs = (int)(DateTime.UtcNow - executionStart).TotalMilliseconds;

            // Step 5: Summarize results
            var summarizationStart = DateTime.UtcNow;
            var summarizeFunction = _kernel.Plugins.GetFunction("Analysis", "SummarizeResults");
            var summaryResult = await _kernel.InvokeAsync(
                summarizeFunction,
                new KernelArguments
                {
                    ["input"] = result.UserQuery,
                    ["data"] = JsonSerializer.Serialize(queryData)
                },
                cancellationToken
            );

            result.Response = summaryResult.ToString();
            result.SummarizationLatencyMs = (int)(DateTime.UtcNow - summarizationStart).TotalMilliseconds;
            result.IsSuccess = true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling data query: {Query}", result.UserQuery);
            result.IsSuccess = false;
            result.ErrorMessage = ex.Message;
            result.Response = "Sorry, I encountered an error executing your query. Please try rephrasing it.";
        }
    }

    private string HandleChitChat(string query)
    {
        var lowerQuery = query.ToLowerInvariant();

        if (lowerQuery.Contains("hello") || lowerQuery.Contains("hi") || lowerQuery.Contains("kumusta"))
        {
            return "Hello! Kumusta? I'm BuiswAIz, your business assistant. How can I help you today?";
        }

        if (lowerQuery.Contains("thank") || lowerQuery.Contains("salamat"))
        {
            return "You're welcome! Happy to help po! 😊";
        }

        if (lowerQuery.Contains("good morning") || lowerQuery.Contains("magandang umaga"))
        {
            return "Magandang umaga! How can I assist you with your business today?";
        }

        if (lowerQuery.Contains("good afternoon") || lowerQuery.Contains("magandang hapon"))
        {
            return "Magandang hapon! What would you like to know about your business?";
        }

        return "Hello! I'm BuiswAIz, your friendly business assistant. Ask me about your sales, inventory, expenses, or other business data! 😊";
    }

    private string HandleClarification(string query)
    {
        return "I'm not quite sure what you're asking for. Could you please provide more details? For example:\n" +
               "- \"Show me sales for yesterday\"\n" +
               "- \"How many products are out of stock?\"\n" +
               "- \"What's the total revenue this month?\"";
    }

    private string HandleOutOfScope()
    {
        return "I'm sorry, but that question is outside my area of expertise. I'm designed to help with business-related queries like sales, inventory, expenses, and orders. Is there anything business-related I can help you with? 😊";
    }
}

/// <summary>
/// Response model for the SQL generation plugin
/// </summary>
public class SqlGenerationResponse
{
    public string? Query { get; set; }
    public string? Error { get; set; }
}

/// <summary>
/// Result of the chat orchestration pipeline
/// </summary>
public class ChatOrchestrationResult
{
    public string UserQuery { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public Guid SessionId { get; set; }
    public string Intent { get; set; } = string.Empty;
    public string? SchemaUsed { get; set; }
    public string? GeneratedSql { get; set; }
    public bool SqlValidated { get; set; }
    public bool SqlExecuted { get; set; }
    public int? ResultCount { get; set; }
    public string Response { get; set; } = string.Empty;
    public bool IsSuccess { get; set; }
    public string? ErrorMessage { get; set; }
    
    // Latency tracking
    public int IntentClassificationLatencyMs { get; set; }
    public int SqlGenerationLatencyMs { get; set; }
    public int QueryExecutionLatencyMs { get; set; }
    public int SummarizationLatencyMs { get; set; }
    public int TotalLatencyMs { get; set; }
}

/// <summary>
/// Represents a chunk in the streaming response
/// </summary>
public class StreamingChunk
{
    /// <summary>
    /// Type of chunk: "metadata", "content", "error", "done"
    /// </summary>
    public string Type { get; set; } = string.Empty;

    /// <summary>
    /// Text content (for "content" chunks)
    /// </summary>
    public string? Content { get; set; }

    /// <summary>
    /// Metadata for progress updates (for "metadata" chunks)
    /// </summary>
    public Dictionary<string, object>? Metadata { get; set; }

    /// <summary>
    /// Error message (for "error" chunks)
    /// </summary>
    public string? Error { get; set; }
}
