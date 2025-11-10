using System.Text.Json;
using dataAccess.Entities;
using Microsoft.EntityFrameworkCore;

namespace dataAccess.Services;

/// <summary>
/// Interface for managing chat session state and conversation memory.
/// </summary>
public interface IChatHistoryService
{
    Task<ChatSession> GetOrCreateSessionAsync(string? sessionId);
    Task SavePendingStateAsync(Guid sessionId, JsonDocument plan, string missingSlotName);
    Task ClearPendingStateAsync(Guid sessionId);
    (JsonDocument? Plan, string? SlotName) GetPendingState(ChatSession session);
}

/// <summary>
/// Service for managing chat session state and conversation memory.
/// Handles saving/loading pending plan state for slot-filling clarification flow.
/// </summary>
public sealed class ChatHistoryService : IChatHistoryService
{
    private readonly AiDbContext _aiDb;

    public ChatHistoryService(AiDbContext aiDb)
    {
        _aiDb = aiDb;
    }

    /// <summary>
    /// Retrieves an existing chat session by ID, or creates a new one if not found.
    /// </summary>
    /// <param name="sessionId">Optional session ID. If null or not found, creates a new session.</param>
    /// <returns>The existing or newly created ChatSession entity.</returns>
    public async Task<ChatSession> GetOrCreateSessionAsync(string? sessionId)
    {
        Guid parsedId;
        
        // Try to parse and find existing session
        if (!string.IsNullOrWhiteSpace(sessionId) && Guid.TryParse(sessionId, out parsedId))
        {
            var existing = await _aiDb.ChatSessions
                .FirstOrDefaultAsync(s => s.Id == parsedId);
            
            if (existing != null)
            {
                // Update last activity timestamp
                existing.LastActivityAt = DateTime.UtcNow;
                await _aiDb.SaveChangesAsync();
                return existing;
            }
        }

        // Create new session
        var newSession = new ChatSession
        {
            Id = Guid.NewGuid(),
            UserId = Guid.Empty, // TODO: Get from authenticated user context
            StartedAt = DateTime.UtcNow,
            LastActivityAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddHours(24), // 24-hour session lifetime
            MessageCount = 0,
            Metadata = null,
            PendingPlanJson = null,
            PendingSlotName = null
        };

        _aiDb.ChatSessions.Add(newSession);
        await _aiDb.SaveChangesAsync();

        return newSession;
    }

    /// <summary>
    /// Saves the pending plan and missing slot name to the session for later resumption.
    /// This is called when the system needs clarification from the user.
    /// </summary>
    /// <param name="sessionId">The chat session ID.</param>
    /// <param name="plan">The plan document to serialize and store.</param>
    /// <param name="missingSlotName">The name of the slot/parameter we're waiting for.</param>
    public async Task SavePendingStateAsync(Guid sessionId, JsonDocument plan, string missingSlotName)
    {
        var session = await _aiDb.ChatSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId);

        if (session == null)
        {
            throw new InvalidOperationException($"Chat session {sessionId} not found.");
        }

        // Serialize the plan to JSON string
        session.PendingPlanJson = plan.RootElement.GetRawText();
        session.PendingSlotName = missingSlotName;
        session.LastActivityAt = DateTime.UtcNow;

        await _aiDb.SaveChangesAsync();
    }

    /// <summary>
    /// Clears the pending plan state from the session.
    /// This is called after the plan has been successfully executed or when starting fresh.
    /// </summary>
    /// <param name="sessionId">The chat session ID.</param>
    public async Task ClearPendingStateAsync(Guid sessionId)
    {
        var session = await _aiDb.ChatSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId);

        if (session == null)
        {
            throw new InvalidOperationException($"Chat session {sessionId} not found.");
        }

        session.PendingPlanJson = null;
        session.PendingSlotName = null;
        session.LastActivityAt = DateTime.UtcNow;

        await _aiDb.SaveChangesAsync();
    }

    /// <summary>
    /// Retrieves the pending plan and slot name from the session.
    /// Returns null values if no pending state exists.
    /// </summary>
    /// <param name="session">The chat session entity.</param>
    /// <returns>Tuple of (Plan JsonDocument, SlotName string). Both null if no pending state.</returns>
    public (JsonDocument? Plan, string? SlotName) GetPendingState(ChatSession session)
    {
        if (string.IsNullOrWhiteSpace(session.PendingPlanJson))
        {
            return (null, null);
        }

        try
        {
            var planDoc = JsonDocument.Parse(session.PendingPlanJson);
            return (planDoc, session.PendingSlotName);
        }
        catch (JsonException)
        {
            // If JSON is corrupted, return null
            return (null, null);
        }
    }
}
