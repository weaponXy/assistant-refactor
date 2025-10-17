# LLM Orchestration Refactor Plan

**Goal:** Modernize backend to support LLM chat completion, function/tool chaining, and streaming responses (Groq/OpenAI/Semantic Kernel style).

---

## 1. Objectives
- Integrate LLM chat completion (Groq, OpenAI, or Semantic Kernel)
- Enable function/tool chaining (intent → query → analysis)
- Support streaming responses for chat
- Refactor backend controllers/services for new orchestration

---

## 2. Key Features to Implement
- LLM chat completion endpoint (streamed and batched)
- Intent classification via LLM
- SQL query generation (template and Free-SQL)
- KPI calculation from SQL results
- Clarifier for ambiguous queries
- Session memory/context management
- Error handling and guardrails
- YAML-based prompt templates for all LLM tasks (intent, query, clarifier, etc.)

---

## 3. Architecture Overview
```
User
  → /chat (POST, streamed)
    → LLM chat completion (SK/Groq/OpenAI)
      → Intent classification
      → Query generation (template/Free-SQL)
      → SQL execution (readonly)
      → KPI calculation
      → Response streaming (chat/ui_spec)
```

---

## 4. Implementation Steps

### Step 1: Integrate LLM SDK
- Choose provider: Groq, OpenAI, or Semantic Kernel (SK recommended for C#)
- Add SDK and configure API keys in `.env`
- Create service for chat completion (streamed and batched)

### Step 1.5: Integrate YAML Prompt Templates
- Store prompt templates in YAML files (see saklAI example)
- Use YamlDotNet to load and parse templates at startup
- Inject variables/context into templates before sending to LLM
- Make prompt authoring and updates easy for non-devs

### Step 2: Refactor Controller
- Add `/chat` endpoint (POST)
- Accept user message, session/thread ID
- Call LLM chat completion service
- Stream response to frontend

### Step 3: Build Function Chaining
- Intent classification (M1)
- Query generation (M2)
- KPI calculation/analysis (M3)
- Clarifier for missing/ambiguous slots
- Use SK plugins/functions for each step

### Step 4: Add Streaming Support
- Implement streaming in controller (IAsyncEnumerable or similar)
- Stream LLM responses as they arrive
- Handle partial responses, errors

### Step 5: Session Memory
- Store resolved slots, conversation history, last query metadata
- Use in-memory array/dictionary (upgrade to Redis if needed)

### Step 6: Guardrails & Error Handling
- Enforce SQL allowlist, DML/DDL block, SELECT-only
- Handle LLM errors, clarify when needed
- Log telemetry (prompts, SQL, latency)

---

## 5. Sample Code Structure
```
C-sharp/
  dataAccess.Api/
    Services/
      LlmChatService.cs
      IntentPlugin.cs
      QueryPlugin.cs
      KpiPlugin.cs
      ClarifierPlugin.cs
      SessionMemoryService.cs
      PromptTemplates/
        intent.yaml
        query.yaml
        clarifier.yaml
        ...
    Controllers/
      ChatController.cs
    .env
    ...
```

---

## 6. Timeline (5 Days)
| Day | Task |
|-----|------|
| 1   | Integrate LLM SDK, setup .env, create LlmChatService |
| 2   | Integrate YAML prompt templates, refactor ChatController, add streaming endpoint |
| 3   | Implement function chaining plugins (Intent, Query, KPI, Clarifier) |
| 4   | Add session memory, guardrails, error handling |
| 5   | Test end-to-end, optimize streaming, document usage |

---

## 7. Risks & Mitigations
- **LLM API latency:** Use streaming, optimize prompt size
- **Ambiguous queries:** Clarifier plugin, session memory
- **SQL security:** Strict validator, allowlist, runtime checks
- **Session bloat:** TTL, max history per session

---

## 8. Success Criteria
- Chat endpoint streams LLM responses in real time
- Function chaining works (intent → query → analysis)
- Clarifier resolves ambiguous queries
- SQL queries are safe and validated
- KPI results returned for high-level queries

---

## 9. References
- [Semantic Kernel Chat Completion (C#)](https://learn.microsoft.com/en-us/semantic-kernel/concepts/ai-services/chat-completion/?tabs=csharp-other%2Cpython-AzureOpenAI%2Cjava-AzureOpenAI&pivots=programming-language-csharp)
- [Groq API Docs](https://groq.com/docs)
- [OpenAI API Docs](https://platform.openai.com/docs/api-reference)
- [saklAI Prompt Templates (YAML)](https://github.com/Lorieta/saklAI/tree/main/server/Prompts)

---

## 10. Next Steps
- Assign tasks per developer
- Setup LLM API keys and test connection
- Begin refactor following above steps
- Review progress daily, adjust plan as needed

---

## 11. Additional Best Practices & Features (from saklAI repo)

- Use YAML for all prompt templates (intent, query, clarifier, etc.) for easy editing and versioning
- Organize prompts by task/function in a dedicated folder
- Support prompt chaining and context injection (merge session/context into prompt)
- Add metadata to YAML (e.g., tags, version, author, description)
- Log all LLM requests/responses for debugging and telemetry
- Consider adding prompt variants for different models or user roles
- Document prompt structure and update process for non-devs
