using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace Capcap.Services;

/// <summary>
/// Semantic Kernel-based LLM Chat Service for Groq integration
/// Supports both fast (routing) and smart (SQL/analysis) LLM models
/// </summary>
public sealed class LlmChatService
{
    private readonly Kernel _kernel;
    private readonly IChatCompletionService _fastLlm;
    private readonly IChatCompletionService _smartLlm;

    public LlmChatService(Kernel kernel)
    {
        _kernel = kernel;
        
        // Get the two LLM services registered in the kernel
        _fastLlm = kernel.GetRequiredService<IChatCompletionService>("fast-llm");
        _smartLlm = kernel.GetRequiredService<IChatCompletionService>("smart-llm");
    }

    /// <summary>
    /// Fast chat completion for intent classification and routing
    /// Uses small/fast LLM (Llama 3.1 8B)
    /// </summary>
    public async Task<string> ClassifyAsync(string systemPrompt, string userQuery, CancellationToken ct = default)
    {
        var chatHistory = new ChatHistory();
        chatHistory.AddSystemMessage(systemPrompt);
        chatHistory.AddUserMessage(userQuery);

        var executionSettings = new OpenAIPromptExecutionSettings
        {
            Temperature = 0.0,  // Deterministic for classification
            MaxTokens = 50,     // Short response for intent name
            TopP = 0.1
        };

        try
        {
            var result = await _fastLlm.GetChatMessageContentAsync(
                chatHistory, 
                executionSettings, 
                _kernel,
                ct
            );

            return result.Content?.Trim() ?? "chitchat";
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[LlmChatService] Classification error: {ex.Message}");
            return "chitchat"; // Safe default
        }
    }

    /// <summary>
    /// Smart chat completion for SQL generation and analysis
    /// Uses large/smart LLM (Llama 3.3 70B)
    /// </summary>
    public async Task<string> GenerateAsync(string systemPrompt, string userQuery, CancellationToken ct = default)
    {
        var chatHistory = new ChatHistory();
        chatHistory.AddSystemMessage(systemPrompt);
        chatHistory.AddUserMessage(userQuery);

        var executionSettings = new OpenAIPromptExecutionSettings
        {
            Temperature = 0.2,  // Low but not zero for creativity
            MaxTokens = 2000,   // Enough for complex SQL
            TopP = 0.9
        };

        try
        {
            var result = await _smartLlm.GetChatMessageContentAsync(
                chatHistory,
                executionSettings,
                _kernel,
                ct
            );

            return result.Content ?? "";
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[LlmChatService] Generation error: {ex.Message}");
            throw; // Propagate for proper error handling
        }
    }

    /// <summary>
    /// Streaming chat completion for real-time responses
    /// Uses smart LLM for conversational quality
    /// </summary>
    public async IAsyncEnumerable<string> StreamAsync(
        string systemPrompt, 
        string userQuery, 
        CancellationToken ct = default)
    {
        var chatHistory = new ChatHistory();
        chatHistory.AddSystemMessage(systemPrompt);
        chatHistory.AddUserMessage(userQuery);

        var executionSettings = new OpenAIPromptExecutionSettings
        {
            Temperature = 0.3,
            MaxTokens = 2000,
            TopP = 0.9
        };

        await foreach (var chunk in _smartLlm.GetStreamingChatMessageContentsAsync(
            chatHistory,
            executionSettings,
            _kernel,
            ct))
        {
            if (!string.IsNullOrEmpty(chunk.Content))
            {
                yield return chunk.Content;
            }
        }
    }

    /// <summary>
    /// Multi-turn conversation with context preservation
    /// </summary>
    public async Task<string> ChatAsync(
        ChatHistory conversationHistory,
        string userMessage,
        double temperature = 0.3,
        CancellationToken ct = default)
    {
        conversationHistory.AddUserMessage(userMessage);

        var executionSettings = new OpenAIPromptExecutionSettings
        {
            Temperature = temperature,
            MaxTokens = 2000,
            TopP = 0.9
        };

        try
        {
            var result = await _smartLlm.GetChatMessageContentAsync(
                conversationHistory,
                executionSettings,
                _kernel,
                ct
            );

            var response = result.Content ?? "";
            conversationHistory.AddAssistantMessage(response);
            
            return response;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[LlmChatService] Chat error: {ex.Message}");
            throw;
        }
    }
}
