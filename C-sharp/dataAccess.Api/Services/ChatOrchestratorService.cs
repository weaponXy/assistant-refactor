using Microsoft.SemanticKernel;
using System.Text.Json;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;
using dataAccess.Services;
using dataAccess.Planning;
using dataAccess.Planning.Nlq;
using dataAccess.Reports;
using dataAccess.Contracts;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace dataAccess.Api.Services;

/// <summary>
/// Orchestrates the chat pipeline: Intent Classification → SQL Generation → Query Execution → Result Summarization
/// Phase 4: Stateful 2-stage orchestrator with slot-filling validation
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
    
    // Phase 4: New dependencies for slot-filling orchestration
    private readonly IChatHistoryService _chatHistory;
    private readonly PromptLoader _promptLoader;
    private readonly IYamlReportRunner _reportRunner;
    private readonly IForecastRunnerService _forecastRunner;
    private readonly IYamlIntentRunner _intentRunner;
    
    // Phase 6: Dynamic SQL Query dependencies
    private readonly LlmSqlGenerator _sqlGenerator;
    private readonly LlmSummarizer _summarizer;
    
    // Phase 4.5: Pre-emptive slot filling dependencies
    
    // Master Orchestrator: NLQ Service for dynamic SQL queries
    private readonly NlqService _nlqService;
    private readonly ILlmDateParser _llmDateParser;

    public ChatOrchestratorService(
        Kernel kernel,
        IDatabaseSchemaService schemaService,
        TelemetryLogger telemetryLogger,
        IConfiguration configuration,
        ILogger<ChatOrchestratorService> logger,
        SqlValidator sqlValidator,
        ISafeSqlExecutor safeSqlExecutor,
        IChatHistoryService chatHistory,
        PromptLoader promptLoader,
        IYamlReportRunner reportRunner,
        IForecastRunnerService forecastRunner,
        IYamlIntentRunner intentRunner,
        LlmSqlGenerator sqlGenerator,
        LlmSummarizer summarizer,
        ILlmDateParser llmDateParser,
        NlqService nlqService)
    {
        _kernel = kernel;
        _schemaService = schemaService;
        _telemetryLogger = telemetryLogger;
        _logger = logger;
        _sqlValidator = sqlValidator;
        _safeSqlExecutor = safeSqlExecutor;
        _maxResultRows = configuration.GetValue<int?>("SqlExecution:MaxRows") ?? 1000;
        
        // Phase 4 dependencies
        _chatHistory = chatHistory;
        _promptLoader = promptLoader;
        _reportRunner = reportRunner;
        _forecastRunner = forecastRunner;
        _intentRunner = intentRunner;
        
        // Phase 6 dependencies
        _sqlGenerator = sqlGenerator;
        _summarizer = summarizer;
        
        // Phase 4.5 dependencies
        _llmDateParser = llmDateParser;
        
        // Master Orchestrator: NLQ Service for dynamic SQL queries
        _nlqService = nlqService;
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
            _logger.LogInformation("[Phase 4] Processing query for user {UserId}: {Query}", userId, userQuery);

            // ═══════════════════════════════════════════════════════════════
            // A. CHECK FOR PENDING STATE (Slot-Filling Resume)
            // ═══════════════════════════════════════════════════════════════
            var session = await _chatHistory.GetOrCreateSessionAsync(result.SessionId.ToString());
            var (pendingPlanJson, pendingSlotName) = _chatHistory.GetPendingState(session);
            
            PlannerResult finalPlan;

            if (pendingPlanJson != null)
            {
                // User is answering a clarification question - fill the slot
                _logger.LogInformation("[Phase 4] Resuming slot-filling for slot: {SlotName}", pendingSlotName);
                
                finalPlan = PlannerResult.FromJsonDocument(pendingPlanJson) 
                    ?? throw new InvalidOperationException("Failed to deserialize pending plan");

                if (pendingSlotName == "sub_intent")
                {
                    // Stage 1: User provided the topic/sub-intent
                    finalPlan.SubIntent = userQuery.Trim();
                    _logger.LogInformation("[Phase 4] Filled sub_intent: {SubIntent}", finalPlan.SubIntent);
                }
                else if (pendingSlotName != null)
                {
                    // Stage 2: User provided a parameter value
                    finalPlan.Slots[pendingSlotName] = userQuery.Trim();
                    _logger.LogInformation("[Phase 4] Filled slot {SlotName}: {Value}", pendingSlotName, userQuery.Trim());
                }
                else
                {
                    throw new InvalidOperationException("Pending slot name is null");
                }

                // Clear pending state
                await _chatHistory.ClearPendingStateAsync(session.Id);
            }
            else
            {
                // ═══════════════════════════════════════════════════════════════
                // B. HANDLE NEW QUERY (Stage 1: Intent Classification)
                // ═══════════════════════════════════════════════════════════════
                _logger.LogInformation("[Phase 4] Processing new query - classifying intent");
                
                // OPTIMIZATION: Fetch conversation history ONCE per request (not per pathway)
                // This history is reused for intent classification only
                var history = await _chatHistory.GetRecentMessagesAsync(session.Id);
                _logger.LogInformation("[Phase 4] Fetched {Count} messages from conversation history", history.Count);
                
                // LLM CALL #1: Intent Classification (router only - does NOT generate responses)
                var intentDoc = await _intentRunner.RunIntentAsync(userQuery, history, cancellationToken);
                var intentResult = ParseIntentResult(intentDoc);
                
                result.Intent = intentResult.Intent;
                result.IntentClassificationLatencyMs = (int)(DateTime.UtcNow - startTime).TotalMilliseconds;
                
                _logger.LogInformation("[Phase 4] Intent classified: {Intent}, Domain: {Domain}, Confidence: {Confidence}, Slots: {SlotCount}", 
                    intentResult.Intent, intentResult.Domain, intentResult.Confidence, intentResult.Slots.Count);

                // Check for ambiguous topic (Stage 1 clarification needed)
                if ((intentResult.Intent.Equals("report", StringComparison.OrdinalIgnoreCase) || 
                     intentResult.Intent.Equals("forecast", StringComparison.OrdinalIgnoreCase)) &&
                    string.IsNullOrEmpty(intentResult.SubIntent))
                {
                    _logger.LogInformation("[Phase 4] Stage 1 clarification needed for intent: {Intent}", intentResult.Intent);
                    
                    // Load clarification prompt from router.intent.yaml
                    var clarificationPrompt = GetClarificationPromptForIntent(intentResult.Intent);
                    
                    // Save pending state
                    var pendingPlan = new PlannerResult
                    {
                        Intent = intentResult.Intent,
                        Domain = intentResult.Domain,
                        Confidence = intentResult.Confidence,
                        UserText = userQuery
                    };
                    
                    await _chatHistory.SavePendingStateAsync(session.Id, pendingPlan.ToJsonDocument(), "sub_intent");
                    
                    result.Response = clarificationPrompt;
                    result.IsSuccess = true;
                    result.TotalLatencyMs = (int)(DateTime.UtcNow - startTime).TotalMilliseconds;
                    return result;
                }

                // Convert intent result to PlannerResult
                finalPlan = new PlannerResult
                {
                    Intent = intentResult.Intent,
                    Domain = intentResult.Domain,
                    SubIntent = intentResult.SubIntent,
                    Confidence = intentResult.Confidence,
                    UserText = userQuery,
                    Slots = intentResult.Slots  // PHASE 4.5.1 FIX: Include slots from router
                };
                
                // ═══════════════════════════════════════════════════════════════
                // 🔍 DEBUG POINT: INTENT CLASSIFICATION RESULT
                // ═══════════════════════════════════════════════════════════════
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
                _logger.LogWarning("🔍 DEBUG: INTENT CLASSIFICATION RESULT");
                _logger.LogWarning("User Query: {Query}", userQuery);
                _logger.LogWarning("Classified Intent: {Intent}", intentResult.Intent);
                _logger.LogWarning("Domain: {Domain}", intentResult.Domain ?? "null");
                _logger.LogWarning("SubIntent: {SubIntent}", intentResult.SubIntent ?? "null");
                _logger.LogWarning("Confidence: {Confidence}", intentResult.Confidence);
                _logger.LogWarning("Slots from Router: {Slots}", JsonSerializer.Serialize(intentResult.Slots));
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
            }

            // ═══════════════════════════════════════════════════════════════
            // B.5: NORMALIZE ROUTER SLOTS (Phase 1: Hybrid Dynamic Validation)
            // ═══════════════════════════════════════════════════════════════
            _logger.LogInformation("[Phase 1] Validating and normalizing router slots. Current slots: {Slots}", 
                JsonSerializer.Serialize(finalPlan.Slots));

            // Normalize period_start if router provided it
            if (finalPlan.Slots.ContainsKey("period_start"))
            {
                var normalizedStart = await NormalizeAndValidateDateSlot(
                    "period_start",
                    finalPlan.Slots["period_start"],
                    userQuery,
                    cancellationToken);

                if (normalizedStart != null)
                {
                    // Valid - update with normalized value
                    finalPlan.Slots["period_start"] = normalizedStart;
                    _logger.LogInformation("[Phase 1] period_start normalized: {Value}", normalizedStart);
                }
                else
                {
                    // Invalid or failed parsing - remove slot to trigger clarification
                    finalPlan.Slots.Remove("period_start");
                    _logger.LogWarning("[Phase 1] period_start validation failed. Removed from slots to trigger clarification.");
                }
            }

            // Normalize period_end if router provided it
            if (finalPlan.Slots.ContainsKey("period_end"))
            {
                var normalizedEnd = await NormalizeAndValidateDateSlot(
                    "period_end",
                    finalPlan.Slots["period_end"],
                    userQuery,
                    cancellationToken);

                if (normalizedEnd != null)
                {
                    // Valid - update with normalized value
                    finalPlan.Slots["period_end"] = normalizedEnd;
                    _logger.LogInformation("[Phase 1] period_end normalized: {Value}", normalizedEnd);
                }
                else
                {
                    // Invalid or failed parsing - remove slot to trigger clarification
                    finalPlan.Slots.Remove("period_end");
                    _logger.LogWarning("[Phase 1] period_end validation failed. Removed from slots to trigger clarification.");
                }
            }

            _logger.LogInformation("[Phase 1] After normalization. Final slots: {Slots}", 
                JsonSerializer.Serialize(finalPlan.Slots));

            // ═══════════════════════════════════════════════════════════════
            // C. EXECUTE THE PLAN (Stage 2: Parameter Check with Pre-emptive Slot Filling)
            // ═══════════════════════════════════════════════════════════════
            _logger.LogInformation("[Phase 4] Executing plan for intent: {Intent}, SubIntent: {SubIntent}", 
                finalPlan.Intent, finalPlan.SubIntent);
            
            OrchestrationStepResult stepResult;

            // ═══════════════════════════════════════════════════════════════
            // UNIFIED INTENT HANDLER - THREE PATHWAYS
            // ═══════════════════════════════════════════════════════════════
            // Pathway 1: Date-Sensitive (reports.*, forecast.*)
            // Pathway 2: Dynamic SQL (nlq.query)
            // Pathway 3: Simple YAML (faq, chitchat)
            var normalizedIntent = finalPlan.Intent.ToLowerInvariant();
            
            // 🔍 DEBUG: Show which pathway will be chosen
            _logger.LogWarning("🔍 DEBUG: ROUTING TO PATHWAY - Normalized Intent: {NormalizedIntent}", normalizedIntent);
            
            // ═══════════════════════════════════════════════════════════════
            // PATHWAY 1: DATE-SENSITIVE INTENTS (Reports & Forecasts)
            // ═══════════════════════════════════════════════════════════════
            if (normalizedIntent.StartsWith("reports.") || 
                normalizedIntent.StartsWith("forecast.") ||
                normalizedIntent == "report" ||
                normalizedIntent == "forecast" ||
                normalizedIntent == "forecasting")
            {
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
                _logger.LogWarning("✅ PATHWAY 1: DATE-SENSITIVE INTENTS (Reports & Forecasts)");
                _logger.LogWarning("Intent: {Intent}", normalizedIntent);
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
                var isReport = normalizedIntent.StartsWith("reports.") || normalizedIntent == "report";
                var isForecast = normalizedIntent.StartsWith("forecast.") || normalizedIntent == "forecast" || normalizedIntent == "forecasting";
                
                // Normalize intent based on type
                string normalizedDomainIntent;
                string specFileName;
                
                if (isReport)
                {
                    // ═══════════════════════════════════════════════════════════════
                    // REPORTS: Normalize intent to use "reports." prefix
                    // ═══════════════════════════════════════════════════════════════
                    normalizedDomainIntent = normalizedIntent;
                    
                    if (!normalizedDomainIntent.StartsWith("reports."))
                    {
                        if (normalizedDomainIntent == "report")
                        {
                            // Use Domain or SubIntent to determine specific report type
                            if (!string.IsNullOrWhiteSpace(finalPlan.Domain))
                            {
                                var domainLower = finalPlan.Domain.ToLowerInvariant();
                                normalizedDomainIntent = domainLower switch
                                {
                                    "sales" => "reports.sales",
                                    "inventory" => "reports.inventory",
                                    "expense" or "expenses" => "reports.expenses",
                                    _ => "reports.sales"
                                };
                            }
                            else if (!string.IsNullOrWhiteSpace(finalPlan.SubIntent))
                            {
                                var subIntentLower = finalPlan.SubIntent.ToLowerInvariant();
                                normalizedDomainIntent = subIntentLower switch
                                {
                                    "sales" => "reports.sales",
                                    "inventory" => "reports.inventory",
                                    "expense" or "expenses" => "reports.expenses",
                                    _ => "reports.sales"
                                };
                            }
                            else
                            {
                                normalizedDomainIntent = "reports.sales"; // Default fallback
                            }
                        }
                    }
                    
                    _logger.LogInformation("[Orchestrator] Report intent normalized: {Intent}", normalizedDomainIntent);
                    
                    // Determine spec file
                    var reportName = normalizedDomainIntent.Replace("reports.", "").Trim().ToLowerInvariant();
                    specFileName = reportName switch
                    {
                        "expense" or "expenses" => "reports.expense.yaml",
                        "sales" => "reports.sales.yaml",
                        "inventory" => "reports.inventory.yaml",
                        _ => "reports.sales.yaml"
                    };
                }
                else // isForecast
                {
                    // ═══════════════════════════════════════════════════════════════
                    // FORECASTS: Normalize intent to use "forecast." prefix
                    // ═══════════════════════════════════════════════════════════════
                    normalizedDomainIntent = normalizedIntent;
                    var forecastDomain = normalizedDomainIntent.Contains("expense") ? "expenses" : "sales";
                    normalizedDomainIntent = $"forecast.{forecastDomain}";
                    
                    _logger.LogInformation("[Orchestrator] Forecast intent normalized: {Intent}", normalizedDomainIntent);
                    
                    specFileName = forecastDomain == "expenses" 
                        ? "forecast.expenses.yaml" 
                        : "forecast.sales.yaml";
                }
                
                // ═══════════════════════════════════════════════════════════════
                // PHASE 4.5: PRE-EMPTIVE SLOT FILLING (Shared for Reports & Forecasts)
                // ═══════════════════════════════════════════════════════════════
                var domainSpec = DomainPrompt.Parse(_promptLoader.ReadText(specFileName));
                
                if (domainSpec.Phase1?.Slots != null)
                {
                    foreach (var slotDef in domainSpec.Phase1.Slots)
                    {
                        var slotName = slotDef.Key;
                        var slotConfig = slotDef.Value;
                        
                        // If slot is required AND missing, try pre-emptive fill
                        if (slotConfig.Required && 
                            (!finalPlan.Slots.ContainsKey(slotName) || 
                             string.IsNullOrWhiteSpace(finalPlan.Slots[slotName])))
                        {
                            _logger.LogInformation("[Phase 4.5] Slot '{SlotName}' is missing. Attempting pre-emptive parse...", slotName);
                            
                            var extractedValue = await TryPreemptiveSlotFillAsync(slotName, userQuery, cancellationToken);
                            
                            if (extractedValue != null)
                            {
                                finalPlan.Slots[slotName] = extractedValue;
                                _logger.LogInformation("[Phase 4.5] Pre-emptive parse SUCCESS. Slot '{SlotName}' filled: {Value}", slotName, extractedValue);
                            }
                            else
                            {
                                _logger.LogInformation("[Phase 4.5] Pre-emptive parse failed for '{SlotName}'. Asking user for clarification.", slotName);
                                
                                await _chatHistory.SavePendingStateAsync(session.Id, finalPlan.ToJsonDocument(), slotName);
                                
                                result.Response = slotConfig.ClarificationPrompt ?? $"Please provide a value for {slotName}.";
                                result.IsSuccess = true;
                                result.TotalLatencyMs = (int)(DateTime.UtcNow - startTime).TotalMilliseconds;
                                return result;
                            }
                        }
                    }
                }
                
                // Auto-fill period_end if period_start exists but period_end is missing
                if (finalPlan.Slots.ContainsKey("period_start") && 
                    !string.IsNullOrWhiteSpace(finalPlan.Slots["period_start"]) &&
                    (!finalPlan.Slots.ContainsKey("period_end") || string.IsNullOrWhiteSpace(finalPlan.Slots["period_end"])))
                {
                    var extractedEnd = await TryPreemptiveSlotFillAsync("period_end", userQuery, cancellationToken);
                    if (extractedEnd != null)
                    {
                        finalPlan.Slots["period_end"] = extractedEnd;
                        _logger.LogInformation("[Phase 4.5] Auto-filled period_end: {Value}", extractedEnd);
                    }
                }
                
                // Execute based on type
                if (isReport)
                {
                    _logger.LogWarning("🔍 DEBUG: CALLING REPORT RUNNER");
                    _logger.LogWarning("   Service: YamlReportRunner");
                    _logger.LogWarning("   Intent: {Intent}", normalizedDomainIntent);
                    _logger.LogWarning("   Spec File: {SpecFile}", specFileName);
                    _logger.LogWarning("   Slots: {Slots}", JsonSerializer.Serialize(finalPlan.Slots));
                    
                    stepResult = await _reportRunner.RunReportAsync(normalizedDomainIntent, finalPlan, cancellationToken);
                    
                    _logger.LogWarning("🔍 DEBUG: REPORT RUNNER COMPLETED - Success: {Success}", stepResult.IsSuccess);
                }
                else // isForecast
                {
                    _logger.LogWarning("🔍 DEBUG: CALLING FORECAST RUNNER");
                    _logger.LogWarning("   Service: ForecastRunnerService");
                    _logger.LogWarning("   Intent: {Intent}", normalizedDomainIntent);
                    _logger.LogWarning("   Spec File: {SpecFile}", specFileName);
                    _logger.LogWarning("   Slots: {Slots}", JsonSerializer.Serialize(finalPlan.Slots));
                    
                    stepResult = await _forecastRunner.RunForecastAsync(finalPlan, cancellationToken);
                    
                    _logger.LogWarning("🔍 DEBUG: FORECAST RUNNER COMPLETED - Success: {Success}", stepResult.IsSuccess);
                }
            }
            // ═══════════════════════════════════════════════════════════════
            // PATHWAY 2: DYNAMIC SQL (NLQ.QUERY)
            // ═══════════════════════════════════════════════════════════════
            else if (normalizedIntent == "nlq.query" || normalizedIntent == "nlq" || normalizedIntent == "dynamic_sql_query")
            {
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
                _logger.LogWarning("✅ PATHWAY 2: DYNAMIC SQL (NLQ.QUERY)");
                _logger.LogWarning("Intent: {Intent}", normalizedIntent);
                _logger.LogWarning("Service: NlqService");
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
                
                try
                {
                    _logger.LogWarning("🔍 DEBUG: CALLING NLQ SERVICE");
                    _logger.LogWarning("   Query: {Query}", userQuery);
                    
                    // Call NlqService.HandleAsync which returns an object (report UI or markdown answer)
                    var nlqResult = await _nlqService.HandleAsync(userQuery, cancellationToken);
                    
                    _logger.LogWarning("🔍 DEBUG: NLQ SERVICE COMPLETED - Result: {HasResult}", nlqResult != null);
                    
                    if (nlqResult != null)
                    {
                        // NlqService returns either:
                        // 1. Report UI object (JsonObject with report_title, kpis, cards, charts, etc.)
                        // 2. Markdown answer object { mode = "chat", markdown = "..." }
                        
                        var resultJson = JsonSerializer.Serialize(nlqResult);
                        var resultDoc = JsonDocument.Parse(resultJson);
                        
                        // Check if it's a markdown answer
                        if (resultDoc.RootElement.TryGetProperty("mode", out var modeProp) && 
                            modeProp.GetString() == "chat" &&
                            resultDoc.RootElement.TryGetProperty("markdown", out var markdownProp))
                        {
                            // Simple markdown answer
                            stepResult = new OrchestrationStepResult
                            {
                                IsSuccess = true,
                                ReportData = new ReportResult
                                {
                                    Title = "Query Result",
                                    UiSpec = JsonDocument.Parse(JsonSerializer.Serialize(new { text = markdownProp.GetString() }))
                                }
                            };
                        }
                        else
                        {
                            // Report UI object
                            stepResult = new OrchestrationStepResult
                            {
                                IsSuccess = true,
                                ReportData = new ReportResult
                                {
                                    Title = resultDoc.RootElement.TryGetProperty("report_title", out var titleProp) 
                                        ? titleProp.GetString() ?? "Query Result"
                                        : "Query Result",
                                    UiSpec = resultDoc
                                }
                            };
                        }
                        
                        _logger.LogInformation("[Orchestrator] NLQ query executed successfully");
                    }
                    else
                    {
                        stepResult = new OrchestrationStepResult
                        {
                            IsSuccess = false,
                            ErrorMessage = "I couldn't process that natural language query. Please try rephrasing it."
                        };
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Orchestrator] NLQ query failed via NlqService");
                    stepResult = new OrchestrationStepResult
                    {
                        IsSuccess = false,
                        ErrorMessage = "I encountered an error processing your question. Please try again or rephrase your question."
                    };
                }
            }
            // ═══════════════════════════════════════════════════════════════
            // PATHWAY 3: SIMPLE RESPONSES (FAQ, CHITCHAT)
            // ═══════════════════════════════════════════════════════════════
            else if (normalizedIntent == "faq" || normalizedIntent == "chitchat")
            {
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
                _logger.LogWarning("✅ PATHWAY 3: SIMPLE RESPONSES (FAQ, CHITCHAT)");
                _logger.LogWarning("Intent: {Intent}", normalizedIntent);
                _logger.LogWarning("Optimization: Using dedicated response service (no redundant LLM call)");
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
                
                string responseText;
                
                if (normalizedIntent == "chitchat")
                {
                    // OPTIMIZATION: Use static pattern matching for chitchat (NO LLM CALL!)
                    // Simple greetings don't need AI - save tokens and eliminate 429 errors
                    responseText = HandleChitChat(userQuery);
                    _logger.LogInformation("[Phase 1 Optimization] Chitchat handled via static responses - No LLM call");
                }
                else // faq
                {
                    // TODO: Implement dedicated FAQ service using faq.yaml prompt
                    // For now, use fallback response
                    responseText = "I'm here to help! What would you like to know about your business?";
                    _logger.LogInformation("[Phase 1 Optimization] FAQ using fallback - Dedicated service pending");
                }
                
                stepResult = new OrchestrationStepResult
                {
                    IsSuccess = true,
                    ReportData = new ReportResult
                    {
                        Title = normalizedIntent == "faq" ? "FAQ Response" : "Chitchat",
                        UiSpec = JsonDocument.Parse(JsonSerializer.Serialize(new { text = responseText }))
                    }
                };
                
                _logger.LogWarning("🔍 DEBUG: PATHWAY 3 COMPLETED - Response: {Response}", responseText);
            }
            // ═══════════════════════════════════════════════════════════════
            // OUT OF SCOPE / UNKNOWN INTENT
            // ═══════════════════════════════════════════════════════════════
            else if (normalizedIntent == "out_of_scope")
            {
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
                _logger.LogWarning("⚠️  OUT OF SCOPE INTENT");
                _logger.LogWarning("Intent: {Intent}", normalizedIntent);
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
                
                stepResult = new OrchestrationStepResult
                {
                    IsSuccess = true,
                    ReportData = new ReportResult
                    {
                        Title = "Out of Scope",
                        UiSpec = JsonDocument.Parse(JsonSerializer.Serialize(new { text = HandleOutOfScope() }))
                    }
                };
            }
            else
            {
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
                _logger.LogWarning("❌ UNKNOWN INTENT - NO PATHWAY MATCHED");
                _logger.LogWarning("Intent: {Intent}", normalizedIntent);
                _logger.LogWarning("This should NOT happen! Check router.intent.yaml");
                _logger.LogWarning("═══════════════════════════════════════════════════════════════");
                
                stepResult = new OrchestrationStepResult
                {
                    IsSuccess = false,
                    ErrorMessage = $"I'm not sure how to handle that request. Intent: {normalizedIntent}"
                };
            }

            // ═══════════════════════════════════════════════════════════════
            // D. PROCESS THE RESULT
            // ═══════════════════════════════════════════════════════════════
            if (stepResult.RequiresClarification)
            {
                // Stage 2: Parameter clarification needed
                _logger.LogInformation("[Phase 4] Stage 2 clarification needed for parameter: {ParamName}", 
                    stepResult.MissingParameterName);
                
                await _chatHistory.SavePendingStateAsync(
                    session.Id, 
                    stepResult.PendingPlan ?? finalPlan.ToJsonDocument(), 
                    stepResult.MissingParameterName ?? "unknown");
                
                result.Response = stepResult.ClarificationPrompt ?? "Please provide more information.";
                result.IsSuccess = true;
            }
            else if (stepResult.IsSuccess)
            {
                // Success - format the response
                _logger.LogInformation("[Phase 4] Execution successful");
                
                if (stepResult.ReportData != null && stepResult.ReportData.UiSpec != null)
                {
                    // ═══════════════════════════════════════════════════════════════
                    // PHASE 2 FIX: Properly use UiSpec property instead of serializing JSON into Response
                    // ═══════════════════════════════════════════════════════════════
                    
                    // Assign UiSpec to result for frontend consumption
                    result.UiSpec = stepResult.ReportData.UiSpec;
                    
                    // Check if UiSpec contains a "text" property (FAQ/chitchat/out_of_scope)
                    if (stepResult.ReportData.UiSpec.RootElement.TryGetProperty("text", out var textProp))
                    {
                        // Simple text response - set Response to the text value
                        result.Response = textProp.GetString() ?? "Here's what I found.";
                        _logger.LogInformation("[Phase 2] Text response extracted from UiSpec: {Response}", result.Response);
                    }
                    else
                    {
                        // Report/Forecast with structured UI (charts, tables, KPIs, etc.)
                        // Set Response to a friendly title/summary, NOT the entire JSON
                        result.Response = stepResult.ReportData.Title ?? "Here is your report.";
                        _logger.LogInformation("[Phase 2] Report/Forecast response. Title: {Title}", result.Response);
                    }
                    
                    result.IsSuccess = true;
                }
                else
                {
                    // No UiSpec available - fallback to generic success message
                    result.Response = "Operation completed successfully.";
                    result.IsSuccess = true;
                }
            }
            else
            {
                // Failure
                _logger.LogWarning("[Phase 4] Execution failed: {Error}", stepResult.ErrorMessage);
                result.Response = stepResult.ErrorMessage ?? "An error occurred.";
                result.IsSuccess = false;
                result.ErrorMessage = stepResult.ErrorMessage;
            }

            result.TotalLatencyMs = (int)(DateTime.UtcNow - startTime).TotalMilliseconds;
            
            // ═══════════════════════════════════════════════════════════════
            // E. SAVE TO CONVERSATION HISTORY (The "Array")
            // ═══════════════════════════════════════════════════════════════
            try
            {
                // Save user message (no slots)
                await _chatHistory.AddMessageToHistoryAsync(session.Id, "user", userQuery);
                
                // Phase 2: Save assistant message WITH slots for context inheritance
                // Only save slots if execution was successful and we have normalized slots
                Dictionary<string, string>? slotsToSave = null;
                if (stepResult.IsSuccess && finalPlan.Slots != null && finalPlan.Slots.Count > 0)
                {
                    // Only save date/numeric slots that were actually used
                    slotsToSave = new Dictionary<string, string>();
                    foreach (var slot in finalPlan.Slots)
                    {
                        // Save period_start, period_end, forecast_days, period_days
                        if (slot.Key is "period_start" or "period_end" or "forecast_days" or "period_days")
                        {
                            slotsToSave[slot.Key] = slot.Value;
                        }
                    }
                    
                    if (slotsToSave.Count > 0)
                    {
                        _logger.LogInformation("[Phase 2] Saving slots to conversation history: {Slots}", 
                            JsonSerializer.Serialize(slotsToSave));
                    }
                    else
                    {
                        slotsToSave = null; // Don't save empty dictionary
                    }
                }
                
                await _chatHistory.AddMessageToHistoryAsync(session.Id, "assistant", result.Response, slotsToSave);
                _logger.LogInformation("[Phase 4] Saved conversation turn to history");
            }
            catch (Exception historyEx)
            {
                // Don't fail the entire request if history save fails
                _logger.LogWarning(historyEx, "[Phase 4] Failed to save conversation history");
            }
            
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Phase 4] Error processing query: {Query}", userQuery);
            result.IsSuccess = false;
            result.ErrorMessage = ex.Message;
            result.Response = "Sorry, I encountered an error processing your request. Please try again.";
            result.TotalLatencyMs = (int)(DateTime.UtcNow - startTime).TotalMilliseconds;
            return result;
        }
    }

    // Helper: Parse intent classification result from JSON
    private (string Intent, string? Domain, string? SubIntent, double Confidence, Dictionary<string, string> Slots) ParseIntentResult(JsonDocument doc)
    {
        var root = doc.RootElement;
        var intent = root.TryGetProperty("intent", out var i) ? i.GetString() ?? "" : "";
        var domain = root.TryGetProperty("domain", out var d) && d.ValueKind != JsonValueKind.Null ? d.GetString() : null;
        var subIntent = root.TryGetProperty("sub_intent", out var si) ? si.GetString() : null;
        var confidence = root.TryGetProperty("confidence", out var c) ? c.GetDouble() : 0.0;
        
        // PHASE 4.5.1 FIX: Extract period_start, period_days, and other slots from router response
        var slots = new Dictionary<string, string>();
        if (root.TryGetProperty("period_start", out var ps) && ps.ValueKind == JsonValueKind.String)
        {
            var periodStart = ps.GetString();
            if (!string.IsNullOrWhiteSpace(periodStart))
            {
                slots["period_start"] = periodStart;
                _logger.LogInformation("[Phase 4.5.1] Router provided period_start: {PeriodStart}", periodStart);
            }
        }
        if (root.TryGetProperty("period_days", out var pd) && pd.ValueKind == JsonValueKind.Number)
        {
            slots["period_days"] = pd.GetInt32().ToString();
            _logger.LogInformation("[Phase 4.5.1] Router provided period_days: {PeriodDays}", pd.GetInt32());
        }
        if (root.TryGetProperty("forecast_days", out var fd) && fd.ValueKind == JsonValueKind.Number)
        {
            slots["forecast_days"] = fd.GetInt32().ToString();
            _logger.LogInformation("[Phase 4.5.1] Router provided forecast_days: {ForecastDays}", fd.GetInt32());
        }
        
        return (intent, domain, subIntent, confidence, slots);
    }

    // Helper: Get clarification prompt from router.intent.yaml
    private string GetClarificationPromptForIntent(string intent)
    {
        try
        {
            var routerYaml = _promptLoader.ReadText("router.intent.yaml");
            var deserializer = new DeserializerBuilder()
                .WithNamingConvention(UnderscoredNamingConvention.Instance)
                .IgnoreUnmatchedProperties()
                .Build();
            
            var config = deserializer.Deserialize<Dictionary<string, object>>(routerYaml);
            
            if (config.TryGetValue("intents", out var intentsObj) && intentsObj is Dictionary<object, object> intents)
            {
                if (intents.TryGetValue(intent, out var intentDefObj) && intentDefObj is Dictionary<object, object> intentDef)
                {
                    if (intentDef.TryGetValue("clarification_prompt", out var promptObj))
                    {
                        return promptObj?.ToString() ?? $"What type of {intent.ToLower()} would you like?";
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load clarification prompt for intent: {Intent}", intent);
        }

        return $"What type of {intent.ToLower()} would you like?";
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
                    // CRITICAL FIX: Include slots in history so router can inherit them
                    var historyText = string.Join("\n", history.Select(m =>
                    {
                        var slotText = m.Slots != null && m.Slots.Any()
                            ? $" [Slots: {string.Join(", ", m.Slots.Select(s => $"{s.Key}={s.Value}"))}]"
                            : "";
                        return $"{m.Role}: {m.Content}{slotText}";
                    }));
                    arguments["conversation_history"] = historyText;
                    _logger.LogInformation("[Phase 2] Injected {Count} messages with slots into Router context:\n{History}", 
                        history.Count, historyText);
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

    /// <summary>
    /// Phase 4.5: Pre-emptive slot filling - Try to extract slot value from original user query
    /// using specialist parsers BEFORE asking the user for clarification.
    /// </summary>
    /// <param name="slotName">Name of the missing slot (e.g., "period_start", "forecast_days")</param>
    /// <param name="userQuery">Original user query text</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Extracted slot value if successful, null if extraction failed</returns>
    private async Task<string?> TryPreemptiveSlotFillAsync(
        string slotName,
        string userQuery,
        CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("[Phase 4.5] Attempting pre-emptive parse for slot: {SlotName}", slotName);

            // Handle date-related slots using LlmDateParser
            if (slotName is "period_start" or "period_end")
            {
                var (startDate, endDate) = await _llmDateParser.ParseDateRangeAsync(userQuery, cancellationToken);
                
                var formattedValue = slotName == "period_start" 
                    ? startDate.ToString("yyyy-MM-dd")
                    : endDate.ToString("yyyy-MM-dd");
                
                _logger.LogInformation("[Phase 4.5] Pre-emptive parse SUCCESS for {SlotName}: {Value}", 
                    slotName, formattedValue);
                
                return formattedValue;
            }

            // Handle numeric slots (forecast_days) using regex extraction
            if (slotName == "forecast_days")
            {
                // Try to extract number from phrases like:
                // "next 7 days", "30 days", "for 14 days", "3 araw", "5 linggo"
                var patterns = new[]
                {
                    @"(?:next|for|sa|susunod)\s+(\d+)\s+(?:day|days|araw)",
                    @"(\d+)\s+(?:day|days|araw)",
                    @"(\d+)\s+(?:week|weeks|linggo)",  // Convert weeks to days
                    @"(\d+)\s+(?:month|months|buwan)" // Convert months to days (30 days per month)
                };

                foreach (var pattern in patterns)
                {
                    var match = Regex.Match(userQuery, pattern, RegexOptions.IgnoreCase);
                    if (match.Success)
                    {
                        var number = int.Parse(match.Groups[1].Value);
                        
                        // Convert to days based on unit
                        if (pattern.Contains("week") || pattern.Contains("linggo"))
                        {
                            number *= 7; // weeks to days
                        }
                        else if (pattern.Contains("month") || pattern.Contains("buwan"))
                        {
                            number *= 30; // months to days (approximate)
                        }

                        // Validate range (1-60 days as per ForecastRunnerService)
                        if (number >= 1 && number <= 60)
                        {
                            _logger.LogInformation("[Phase 4.5] Pre-emptive parse SUCCESS for forecast_days: {Value}", number);
                            return number.ToString();
                        }
                    }
                }
            }

            _logger.LogInformation("[Phase 4.5] Pre-emptive parse failed for {SlotName} - no match found", slotName);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Phase 4.5] Pre-emptive parse failed for {SlotName}", slotName);
            return null;
        }
    }

    /// <summary>
    /// Phase 1 (Bug Fix): Normalize and validate date slot from router output.
    /// HYBRID DYNAMIC APPROACH - Validates router output format, re-parses if needed.
    /// </summary>
    /// <param name="slotName">Name of the slot (e.g., "period_start", "period_end")</param>
    /// <param name="routerValue">The value provided by the router (may be natural language)</param>
    /// <param name="userQuery">Original user query for re-parsing context</param>
    /// <param name="ct">Cancellation token</param>
    /// <returns>Normalized ISO date string (yyyy-MM-dd) or null if validation/parsing fails</returns>
    private async Task<string?> NormalizeAndValidateDateSlot(
        string slotName,
        string? routerValue,
        string userQuery,
        CancellationToken ct)
    {
        // If router didn't provide a value, return null (will trigger clarification)
        if (string.IsNullOrWhiteSpace(routerValue))
        {
            _logger.LogInformation("[Slot Validation] Router did not provide value for {SlotName}", slotName);
            return null;
        }

        // FAST PATH: Check if router output is already in valid ISO format (yyyy-MM-dd)
        if (DateTime.TryParseExact(routerValue, "yyyy-MM-dd", null, 
            System.Globalization.DateTimeStyles.None, out var _))
        {
            // ✅ Router already provided valid ISO format → Use it directly
            _logger.LogInformation("[Slot Validation] Router provided valid ISO date for {SlotName}: {Value}", 
                slotName, routerValue);
            return routerValue;
        }

        // SAFE PATH: Router provided natural language (e.g., "October", "Oct 1, 2025") → Parse the router value itself
        _logger.LogWarning("[Slot Validation] Router provided non-ISO date for {SlotName}: {Value}. Re-parsing router value through LlmDateParser...", 
            slotName, routerValue);

        try
        {
            // CRITICAL FIX: Parse the ROUTER VALUE, not the user query!
            // The router gave us "Oct 1, 2025" which has date info, but "how about inventory?" doesn't.
            var (startDate, endDate) = await _llmDateParser.ParseDateRangeAsync(routerValue, ct);
            
            var normalized = slotName == "period_start" 
                ? startDate.ToString("yyyy-MM-dd") 
                : endDate.ToString("yyyy-MM-dd");
            
            _logger.LogInformation("[Slot Validation] Successfully normalized '{Original}' to '{Normalized}' for {SlotName}", 
                routerValue, normalized, slotName);
            
            return normalized;
        }
        catch (Exception ex)
        {
            // Parsing failed - try one more time with original user query as fallback
            _logger.LogWarning(ex, "[Slot Validation] Failed to parse router value '{RouterValue}'. Trying original user query as fallback...", routerValue);
            
            try
            {
                var (startDate, endDate) = await _llmDateParser.ParseDateRangeAsync(userQuery, ct);
                
                var normalized = slotName == "period_start" 
                    ? startDate.ToString("yyyy-MM-dd") 
                    : endDate.ToString("yyyy-MM-dd");
                
                _logger.LogInformation("[Slot Validation] Fallback successful. Normalized to '{Normalized}' for {SlotName}", 
                    normalized, slotName);
                
                return normalized;
            }
            catch (Exception fallbackEx)
            {
                // Both attempts failed - log error and return null to trigger clarification
                _logger.LogError(fallbackEx, "[Slot Validation] Failed to normalize date for {SlotName}. Router value: {RouterValue}, User query: {UserQuery}", 
                    slotName, routerValue, userQuery);
                return null;
            }
        }
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
    
    /// <summary>
    /// Structured UI specification (charts, tables, KPIs, etc.) for frontend rendering.
    /// Contains the full report/forecast/query result data.
    /// </summary>
    public JsonDocument? UiSpec { get; set; }
    
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
