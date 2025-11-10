# LLM Orchestration Refactor Plan

**Goal:** Modernize BuiswAIz backend to production-grade LLM orchestration with Semantic Kernel, supporting chat completion, function/tool chaining, streaming responses, and robust guardrails.

**Timeline:** 4 days (production polish sprint)

**Last Updated:** October 19, 2025

---

## 1. Objectives
- Integrate Semantic Kernel (SK) for LLM orchestration (Groq + Hugging Face ready)
- Enable function/tool chaining (intent → query → analysis)
- Support streaming responses for real-time chat
- Refactor backend for production-grade reliability
- Maintain strict SQL guardrails and security
- Log all LLM interactions for future fine-tuning dataset

---

## 2. Key Features to Implement
- **LLM chat completion endpoint** (streamed and batched)
- **Modular SK-native plugins architecture** (Router → Generator → Summarizer pipeline)
- **Intent classification** via Router plugin (using small/fast LLM)
- **SQL query generation** via GenerateSql plugin (schema-driven, dynamic, using large/smart LLM)
- **Natural language summarization** via SummarizeResults plugin (converts JSON to Taglish/Filipino)
- **Multi-LLM strategy** (small LLM for routing, large LLM for SQL/analysis)
- **Clarifier** for ambiguous queries
- **Business rules RAG pipeline** (vector search on business rules documents)
- **User feedback collection** (thumbs up/down for response quality)
- **Session memory/context management** (in-memory, Redis-ready)
- **Error handling and guardrails** (SQL allowlist, DML/DDL blocking)
- **Telemetry logging** (prompts, SQL, latency, user feedback)
- **SK-native prompt templates** (skprompt.txt + config.json per plugin) with startup validation
- **Plugin auto-discovery** (SK loads plugins from directory structure automatically)

---

## 3. Architecture Overview

### **3.1 Request Flow (Router → Generator → Summarizer Pipeline)**
```
User
  → /api/assistant/chat (POST, Server-Sent Events)
    → SessionMemoryService (load context)
    → Semantic Kernel Orchestrator
      
      Step 1: ROUTING (Small/Fast LLM - Llama 3.1 8B)
      → OrchestrationPlugin.Router
         Input: User query
         Output: Intent (GetDataQuery | BusinessRuleQuery | ChitChat | Clarification | OutOfScope)
      
      Step 2a: SQL GENERATION (Large/Smart LLM - Llama 3.3 70B)
      → [If GetDataQuery] DatabaseSchemaService (fetch relevant table schemas)
      → DatabasePlugin.GenerateSql
         Inputs: User query + schema + today's date
         Output: JSON {"query": "SELECT ..."} or {"error": "..."}
      
      Step 2b: BUSINESS RULES RAG (Large/Smart LLM - Llama 3.3 70B)
      → [If BusinessRuleQuery] VectorSearchService (search business rules index)
      → BusinessRulesPlugin.QueryKnowledgeBase
         Inputs: User query + retrieved context
         Output: Natural language answer (Taglish/Filipino)
      
      Step 3: EXECUTION & ANALYSIS
      → [If SQL path] SafeSqlExecutor (validate + execute readonly query)
      → AnalysisPlugin.SummarizeResults (Large/Smart LLM)
         Inputs: User query + JSON results
         Output: Natural language summary (Taglish/Filipino)
      
      → [If Clarification] ClarifierPlugin (handle ambiguous/missing slots)
      → [If ChitChat] Direct friendly response
      → [If OutOfScope] Polite rejection message
    
    → Response streaming (SSE/JSON chunks)
    → TelemetryLogger (log request/response for future training)

User
  → /api/assistant/feedback (POST)
    → TelemetryLogger (update log with user feedback: thumbs_up/thumbs_down)
```

### **3.2 Multi-LLM Strategy**
To optimize cost and performance, the system uses two classes of LLMs:

| Task | LLM Type | Model Example | Reason |
|------|----------|---------------|--------|
| **Router** (Intent Classification) | Small/Fast | Llama 3.1 8B (Groq) | Fast response, low cost, simple task |
| **GenerateSql** (SQL Generation) | Large/Smart | Llama 3.3 70B (Groq) | Complex reasoning, schema understanding |
| **SummarizeResults** (Analysis) | Large/Smart | Llama 3.3 70B (Groq) | Natural language quality |

---

## 4. Prompt Template Architecture (SK-Native Plugins)

This section defines the **modular, scalable prompt template strategy** for the Text-to-SQL system. Instead of creating separate YAML files for each report or table (e.g., `sales.yaml`, `inventory.yaml`), we consolidate prompts into three core plugins that form the `intent → query → analysis` pipeline.

### **4.1 Plugin Directory Structure**

All prompts are organized under `dataAccess.Api/Plugins/` using SK-native file structure (NOT YAML, but `skprompt.txt` + `config.json`):

```
dataAccess.Api/
└── Plugins/
    ├── Orchestration/
    │   └── Router/
    │       ├── config.json         # Execution settings, model config, metadata
    │       └── skprompt.txt        # The actual prompt template
    │
    ├── Database/
    │   └── GenerateSql/
    │       ├── config.json         # Execution settings for SQL generation
    │       └── skprompt.txt        # SQL generation prompt template
    │
    └── Analysis/
        └── SummarizeResults/
            ├── config.json         # Execution settings for summarization
            └── skprompt.txt        # Summarization prompt template
```

**Why `skprompt.txt` + `config.json` instead of single YAML?**
- ✅ **SK-Native Convention:** Semantic Kernel officially uses this structure for prompt functions
- ✅ **Separation of Concerns:** Prompt text (skprompt.txt) is separate from config (config.json)
- ✅ **Better IDE Support:** Text files for prompts, JSON for configs (easier to edit, validate, version)
- ✅ **Plugin Discovery:** SK automatically discovers plugins with this structure
- ✅ **No Custom Parsing:** SK handles loading/parsing natively, no need for YamlDotNet

**Benefits of this structure:**
- ✅ **Modular:** Each "skill" is isolated and independently testable
- ✅ **Scalable:** Adding new database tables doesn't require new prompt files
- ✅ **Maintainable:** Non-devs can edit prompts without touching C# code
- ✅ **SK-Native:** Uses Semantic Kernel's official plugin conventions
- ✅ **IDE-Friendly:** JSON schema validation for config, plain text for prompts
- ✅ **Auto-Discovery:** SK automatically loads plugins from this structure
- ✅ **Validated:** Templates are validated at startup to prevent runtime errors

### **4.2 Plugin Definitions**

#### **Plugin 1: OrchestrationPlugin (The Router)**

**Purpose:** Fast intent classification to determine user's primary goal.

**Function:** `Router`

**LLM:** Small/Fast (Llama 3.1 8B via Groq)

**Inputs:**
- `input` (string): User's query

**Output:** Intent name (e.g., `GetDataQuery`, `BusinessRuleQuery`, `ChitChat`, `Clarification`, `OutOfScope`)

**Prompt Template (`Orchestration/Router/skprompt.txt`):**
```
You are an AI routing agent for BuiswAIz. Classify the user's query into one of the following intents. Respond with ONLY the intent name.

Available Intents:
- **GetDataQuery**: User is asking for data, numbers, or reports (e.g., sales, inventory, expenses).
- **BusinessRuleQuery**: User is asking about business policies, rules, or "how-to" questions (e.g., "how do I file for a leave?").
- **ChitChat**: Greetings or non-data related questions.
- **Clarification**: The query is ambiguous or incomplete.
- **OutOfScope**: Cooking, trivia, jokes, or topics unrelated to business.

---
Examples:
User: "Magkano ang benta natin kahapon?"
Intent: GetDataQuery

User: "Paano mag-file ng vacation leave?"
Intent: BusinessRuleQuery

User: "Salamat po!"
Intent: ChitChat

User: "Ipakita mo nga"
Intent: Clarification

User: "How to cook adobo?"
Intent: OutOfScope
---

User Query: "{{$input}}"
Intent:
```

**Config (`Orchestration/Router/config.json`):**
```json
{
  "schema": 1,
  "description": "Classifies the user's request into a high-level intent.",
  "execution_settings": {
    "default": {
      "max_tokens": 32,
      "temperature": 0.0,
      "model_id": "llama-3.1-8b-instant",
      "service_id": "fast-llm"
    }
  }
}
```

---

#### **Plugin 2: DatabasePlugin (The SQL Generator)**

**Purpose:** Generate secure, schema-aware SQL queries dynamically.

**Function:** `GenerateSql`

**LLM:** Large/Smart (Llama 3.3 70B via Groq)

**Inputs:**
- `input` (string): User's query
- `schema` (string): Relevant table DDL (`CREATE TABLE` statements)
- `today` (string): Current date (e.g., `2025-10-18`)

**Output:** JSON object with `{"query": "SELECT ..."}` or `{"error": "..."}`

**Prompt Template (`Database/GenerateSql/skprompt.txt`):**
```
You are an expert PostgreSQL programmer. Your task is to convert a natural language request into a secure, read-only SQL query.
The current date is {{$today}}.

DATABASE SCHEMA:
You can only use the tables and columns provided below.
---
{{$schema}}
---

IMPORTANT RULES:
1. Only generate `SELECT` statements. NEVER generate `DELETE`, `UPDATE`, or `INSERT`.
2. Use proper PostgreSQL syntax for dates, aggregations, and JOINs.
3. If the query cannot be answered with the given schema, respond with: `{"error": "I cannot answer that question with the available data."}`
4. Output a valid JSON object with a "query" or "error" key.
5. For date ranges like "last month", "yesterday", use the {{$today}} value for calculations.
6. Always use table aliases for clarity (e.g., `FROM sales AS s`).

---
Examples:
User Request: "Magkano ang total sales natin today?"
Schema includes: CREATE TABLE sales (id SERIAL, amount NUMERIC, sale_date DATE);
Output: {"query": "SELECT SUM(amount) AS total_sales FROM sales WHERE sale_date = '{{$today}}'"}

User Request: "Ilan ang produkto na walang stock?"
Schema includes: CREATE TABLE products (id SERIAL, name TEXT, stock INTEGER);
Output: {"query": "SELECT COUNT(*) AS out_of_stock_count FROM products WHERE stock = 0"}
---

User Request: "{{$input}}"

Your JSON Response:
```

**Config (`Database/GenerateSql/config.json`):**
```json
{
  "schema": 1,
  "description": "Generates a secure, read-only SQL query from a natural language request.",
  "execution_settings": {
    "default": {
      "max_tokens": 500,
      "temperature": 0.0,
      "model_id": "llama-3.3-70b-versatile",
      "service_id": "smart-llm"
    }
  }
}
```

---

#### **Plugin 3: AnalysisPlugin (The Summarizer)**

**Purpose:** Convert JSON database results into natural, conversational responses.

**Function:** `SummarizeResults`

**LLM:** Large/Smart (Llama 3.3 70B via Groq)

**Inputs:**
- `input` (string): User's original query
- `data` (string): JSON results from database

**Output:** Natural language summary in Taglish/Filipino

**Prompt Template (`Analysis/SummarizeResults/skprompt.txt`):**
```
You are BuiswAIz, a friendly and helpful business assistant.
Take the user's question and the raw JSON data, and provide a clear, concise summary in Filipino/Taglish.

If the data is empty or contains no results, politely inform the user that no data was found.
Always include numbers and currency formatting (₱) when relevant.
Be conversational and friendly, but professional.

---
Examples:
User's Question: "Magkano ang total sales natin today?"
Data: `[{"total_sales": 15750.50}]`
Your Summary: "Ang total sales po natin for today ay ₱15,750.50."

User's Question: "Ilan ang produkto na walang stock?"
Data: `[{"out_of_stock_count": 12}]`
Your Summary: "Mayroon po tayong 12 produkto na wala nang stock."

User's Question: "Top 5 best-selling products?"
Data: `[]`
Your Summary: "Wala po akong nakitang data para sa best-selling products."
---

User's Question: "{{$input}}"
Data: `{{$data}}`

Your Summary:
```

**Config (`Analysis/SummarizeResults/config.json`):**
```json
{
  "schema": 1,
  "description": "Summarizes raw JSON data into a natural language response.",
  "execution_settings": {
    "default": {
      "max_tokens": 256,
      "temperature": 0.7,
      "model_id": "llama-3.3-70b-versatile",
      "service_id": "smart-llm"
    }
  }
}
```

---

### **4.3 C# Orchestration Logic**

The orchestrator service coordinates the three plugins:

```csharp
public async Task<string> HandleQueryAsync(string userQuery, CancellationToken ct)
{
    // Step 1: Route
    var intent = await _kernel.InvokeAsync("Orchestration", "Router", 
        new() { ["input"] = userQuery }, ct);
    
    if (intent.ToString() == "GetDataQuery")
    {
        // Step 2: Fetch relevant schema (C# logic)
        var schema = await _schemaService.GetRelevantSchemaAsync(userQuery);
        var today = DateTime.Now.ToString("yyyy-MM-dd");
        
        // Step 3: Generate SQL
        var sqlResult = await _kernel.InvokeAsync("Database", "GenerateSql",
            new() { 
                ["input"] = userQuery,
                ["schema"] = schema,
                ["today"] = today
            }, ct);
        
        var sqlJson = JsonSerializer.Deserialize<SqlResponse>(sqlResult.ToString());
        
        if (sqlJson.Error != null) return sqlJson.Error;
        
        // Step 4: Execute SQL
        var dbResults = await _executor.ExecuteAsync(sqlJson.Query);
        
        // Step 5: Summarize
        var summary = await _kernel.InvokeAsync("Analysis", "SummarizeResults",
            new() {
                ["input"] = userQuery,
                ["data"] = JsonSerializer.Serialize(dbResults)
            }, ct);
        
        return summary.ToString();
    }
    
    // Handle other intents...
}
```

### **4.4 Dynamic Schema Provider**

The `DatabaseSchemaService` intelligently selects relevant table schemas based on keywords in the user query:

```csharp
public async Task<string> GetRelevantSchemaAsync(string userQuery)
{
    var keywords = ExtractKeywords(userQuery); // e.g., "sales", "products", "expenses"
    var schemas = new List<string>();
    
    if (keywords.Contains("sales") || keywords.Contains("benta"))
        schemas.Add(await GetTableDDL("sales"));
    
    if (keywords.Contains("products") || keywords.Contains("produkto"))
        schemas.Add(await GetTableDDL("products"));
    
    if (keywords.Contains("expenses") || keywords.Contains("gastos"))
        schemas.Add(await GetTableDDL("expenses"));
    
    return string.Join("\n\n", schemas);
}
```

### **4.5 Scalability Benefits**

With this plugin architecture:
- ✅ **Adding new tables:** No new prompt files needed, just update schema provider logic
- ✅ **Changing prompts:** Edit `skprompt.txt` without recompiling C# code
- ✅ **Switching LLMs:** Update `config.json` service_id (e.g., switch to Hugging Face)
- ✅ **A/B testing:** Create variant prompts in separate folders, route traffic accordingly
- ✅ **Version control friendly:** Plain text files, easy to diff and review changes
- ✅ **No custom parsers:** SK handles plugin loading natively, reducing maintenance burden

---

## 5. Implementation Steps (4-Day Sprint)

### **Day 1: Semantic Kernel Integration + Core Services + Database Schema**
**Goal:** Setup SK, migrate existing LLM services, add telemetry logging, create database tables

**Tasks:**
1. Add SK NuGet packages to `dataAccess.Api` and `Capcap`
2. Create database entities and migrations for chat system:
   - `ChatSession.cs` entity (session_id, user_id, started_at, last_activity_at, metadata)
   - `ChatMessage.cs` entity (message_id, session_id, role, content, intent, domain, confidence, sql_generated, sql_executed, result_rows, latency_ms, model_name, created_at)
   - `ChatFeedback.cs` entity (feedback_id, message_id, session_id, user_id, feedback_type, rating, comment, created_at)
   - Generate and run EF Core migration
3. Create `LlmChatService.cs` (SK-based chat completion wrapper)
4. Migrate `GroqChatLlm.cs` to use SK connectors
5. Add `TelemetryLogger.cs` for logging all LLM requests/responses to database
6. Update `.env` files with SK configuration
7. Configure user secrets for local development to store sensitive API keys, separating them from non-sensitive settings in `.env` files
8. Test SK connection with Groq API

**Deliverables:**
- SK integrated and tested
- Database tables created and migrated
- Telemetry logging functional (writes to database)
- Groq connector working via SK
- Secure configuration management setup

---

### **Day 2: SK-Native Plugins + Prompt Templates**
**Goal:** Create modular plugin architecture with Router → Generator → Summarizer pipeline

**Tasks:**
1. Create `Plugins/` directory structure in `dataAccess.Api/`:
   ```
   Plugins/
   ├── Orchestration/Router/
   ├── Database/GenerateSql/
   └── Analysis/SummarizeResults/
   ```
2. Implement the three core plugins with SK-native file structure:
   - **OrchestrationPlugin/Router**: 
     - Create `skprompt.txt`: Intent classification prompt (GetDataQuery, BusinessRuleQuery, ChitChat, Clarification, OutOfScope)
     - Create `config.json`: Model config (llama-3.1-8b-instant, temperature=0.0, max_tokens=32)
   - **DatabasePlugin/GenerateSql**: 
     - Create `skprompt.txt`: Schema-driven SQL generation prompt with safety rules
     - Create `config.json`: Model config (llama-3.3-70b-versatile, temperature=0.0, max_tokens=500)
   - **AnalysisPlugin/SummarizeResults**: 
     - Create `skprompt.txt`: JSON-to-natural-language conversion prompt (Taglish/Filipino)
     - Create `config.json`: Model config (llama-3.3-70b-versatile, temperature=0.7, max_tokens=256)
3. Create `DatabaseSchemaService.cs` to dynamically fetch relevant table DDL based on query keywords
4. Create `ChatOrchestratorService.cs` to manage the 3-step pipeline:
   - Step 1: Call Router plugin to classify intent
   - Step 2: If GetDataQuery, fetch schema → call GenerateSql plugin
   - Step 3: Execute SQL → call SummarizeResults plugin
   - Handle other intents (BusinessRuleQuery, ChitChat, Clarification, OutOfScope)
5. Register SK Kernel in `Program.cs` with two IChatCompletionService instances:
   - `"fast-llm"` service (Llama 3.1 8B for routing) → Groq connector
   - `"smart-llm"` service (Llama 3.3 70B for SQL/analysis) → Groq connector
6. Register plugins with SK Kernel:
   ```csharp
   var pluginsDirectory = Path.Combine(Directory.GetCurrentDirectory(), "Plugins");
   kernel.ImportPluginFromPromptDirectory(pluginsDirectory);
   ```
7. Implement plugin validation at startup:
   - Check for required files (`skprompt.txt`, `config.json`) in each plugin folder
   - Validate JSON schema in config.json files
   - Application fails with clear error if validation fails
8. Test each plugin individually:
   - Unit test Router with sample queries (verify intent classification accuracy)
   - Unit test GenerateSql with mock schema (verify SQL output format)
   - Unit test SummarizeResults with mock JSON data (verify Taglish output quality)
9. Integration test: Full pipeline (user query → intent → SQL → results → summary)

**Deliverables:**
- ✅ SK-native plugin structure created (3 folders with skprompt.txt + config.json each)
- ✅ Three core plugins implemented with concrete prompt content (Router, GenerateSql, SummarizeResults)
- ✅ Multi-LLM strategy configured (fast + smart LLMs registered in SK Kernel)
- ✅ Schema service functional (keyword-based table schema fetcher)
- ✅ Orchestrator service implemented (handles 3-step pipeline + intent branching)
- ✅ Startup validation working (fails fast if plugin files missing/invalid)
- ✅ All plugins unit tested individually
- ✅ Full pipeline integration tested
- ✅ BusinessRuleQuery intent added to Router (prepares for Day 4 RAG implementation)

---

### **Day 3: Controller Refactor + Streaming + Session Memory**
**Goal:** Add streaming chat endpoint, implement session memory, integrate orchestration

**Tasks:**
1. Create `ChatController.cs` in `dataAccess.Api/Controllers/`
   - Implement `/api/assistant/chat` endpoint (POST)
   - Use Server-Sent Events (SSE) for streaming responses
   - Accept: `{ sessionId, message, userId }`
   - Return: Stream of JSON chunks `{ type: "intent"|"sql"|"result"|"summary", content: "..." }`
2. Integrate `ChatOrchestratorService` with streaming:
   - Stream intent classification result first
   - Stream SQL query generated (if applicable)
   - Stream result summary incrementally
   - Handle errors gracefully (stream error messages)
3. Create `SessionMemoryService.cs`:
   - In-memory session store with ConcurrentDictionary
   - TTL: 30 minutes (sliding expiration on activity)
   - Max history: 20 messages per session
   - Store: `{ sessionId, messages[], lastActivity, metadata }`
   - Provide context to orchestrator (last 5 messages for continuity)
4. Implement session management in chat endpoint:
   - Load session from SessionMemoryService
   - Pass context to ChatOrchestratorService
   - Update session with new message + response
   - Log to database via TelemetryLogger
5. Add error handling:
   - LLM API failures → fallback to cached response or generic error message
   - Timeout enforcement (30s per request)
   - SQL validation errors → stream clarification request
   - Rate limiting (10 requests/minute per user)
6. Create response streaming logic:
   ```csharp
   [HttpPost("chat")]
   public async IAsyncEnumerable<string> StreamChat([FromBody] ChatRequest req)
   {
       var session = await _sessionService.LoadSession(req.SessionId);
       
       await foreach (var chunk in _orchestrator.HandleQueryStreamAsync(req.Message, session))
       {
           yield return JsonSerializer.Serialize(chunk);
       }
       
       await _sessionService.UpdateSession(session);
       await _telemetry.LogConversation(session);
   }
   ```
7. Update `ChatOrchestratorService` to support streaming:
   - Yield intent immediately after Router plugin returns
   - Yield SQL query after GenerateSql plugin returns
   - Yield summary chunks as they arrive from SummarizeResults plugin
8. Test streaming with frontend:
   - Verify SSE connection works
   - Verify incremental updates display correctly
   - Test session continuity (follow-up questions use context)
   - Test error scenarios (API down, invalid SQL, timeout)

**Deliverables:**
- ✅ Streaming chat endpoint functional (`/api/assistant/chat`)
- ✅ Server-Sent Events (SSE) implemented correctly
- ✅ Session memory working (context preservation across turns)
- ✅ ChatOrchestratorService integrated with streaming
- ✅ Error handling robust (API failures, timeouts, validation errors)
- ✅ Frontend integration tested (SSE connection, incremental updates)
- ✅ Rate limiting enforced
- ✅ Telemetry logging working (all conversations logged to database)

---

### **Day 4: Guardrails, Testing, Polish, Documentation**
**Goal:** Harden SQL security, implement business rules RAG, end-to-end testing, production readiness

**Tasks:**
1. **SQL Security Hardening:**
   - Review and strengthen `SqlValidator.cs`:
     - Enforce SELECT-only (block INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE)
     - Validate against allowlist (tables, columns, functions)
     - Block dangerous patterns (e.g., `; DROP TABLE`, `--`, `/*`)
   - Test `SafeSqlExecutor.cs`:
     - Query timeout enforcement (30s max)
     - Result set size limits (10,000 rows max)
     - Readonly database user verification
   - Penetration testing: Try SQL injection attacks, verify all blocked
2. **Business Rules RAG Implementation:**
   - Create separate vector index for business rules documents:
     - Index HR policies, leave policies, expense policies, etc.
     - Use existing `VectorSearchService` with new index name
   - Create `BusinessRulesPlugin`:
     - **Folder:** `Plugins/BusinessRules/QueryKnowledgeBase/`
     - **skprompt.txt:** 
       ```
       You are a helpful business assistant. Answer the user's question using the provided business rules context.
       
       Business Rules Context:
       {{$context}}
       
       User Question: "{{$input}}"
       
       Your Answer (in Filipino/Taglish):
       ```
     - **config.json:**
       ```json
       {
         "schema": 1,
         "description": "Answers business rules queries using RAG context",
         "execution_settings": {
           "default": {
             "max_tokens": 300,
             "temperature": 0.3,
             "model_id": "llama-3.3-70b-versatile",
             "service_id": "smart-llm"
           }
         }
       }
       ```
   - Update `ChatOrchestratorService` to handle BusinessRuleQuery intent:
     ```csharp
     if (intent == "BusinessRuleQuery") {
         var context = await _vectorSearch.SearchBusinessRules(userQuery, topK: 3);
         var answer = await _kernel.InvokeAsync("BusinessRules", "QueryKnowledgeBase",
             new() { ["input"] = userQuery, ["context"] = context });
         return answer.ToString();
     }
     ```
   - Test with sample queries: "Paano mag-file ng leave?", "Ano ang reimbursement policy?"
3. **User Feedback Endpoint:**
   - Implement `/api/assistant/feedback` endpoint in `ChatController.cs`:
     - Accept: `{ messageId, sessionId, feedbackType: "thumbs_up"|"thumbs_down", comment? }`
     - Save to `chat_feedback` table
   - Update `TelemetryLogger.cs` to link feedback to message records
   - Test feedback collection flow (frontend button → API → database)
4. **End-to-End Testing:**
   - Test all intent paths:
     - **GetDataQuery:** "Magkano ang sales today?" → SQL → Results → Summary
     - **BusinessRuleQuery:** "Paano mag-file ng leave?" → RAG → Answer
     - **ChitChat:** "Hello!" → Friendly response
     - **Clarification:** "Ipakita mo nga" → Ask for details
     - **OutOfScope:** "How to cook adobo?" → Polite rejection
   - Test session continuity: Follow-up questions use context
   - Test error scenarios: Invalid SQL, API timeout, empty results
5. **Load Testing:**
   - Use k6 or Apache JMeter
   - Target: 100 concurrent users, 1000 requests over 5 minutes
   - Monitor: Response times, error rates, database load
   - Verify: 95% of requests complete within 5s
6. **Health Check Endpoints:**
   - Create `/api/health` endpoint:
     - Check SK/Groq connectivity (test LLM call)
     - Check database connectivity (test query)
     - Check vector search availability
     - Return: `{ status: "healthy"|"degraded"|"unhealthy", details: {...} }`
7. **API Documentation:**
   - Add Swagger/OpenAPI annotations to ChatController
   - Document request/response schemas
   - Add example requests for each intent type
8. **Deployment Preparation:**
   - Update README with:
     - Setup instructions (secrets, environment variables)
     - Plugin directory structure
     - How to add new prompts/plugins
   - Create logging dashboard queries:
     - Intent distribution over time
     - SQL generation success rate
     - User feedback sentiment (thumbs up/down ratio)
     - Average response latency by intent type
9. **Code Review & Cleanup:**
   - Remove unused YAML parsing code (YamlDotNet, PromptTemplateParser, etc.)
   - Remove references to old FAQ/router logic
   - Ensure all TODOs are resolved or documented
   - Verify error messages are user-friendly (no stack traces exposed)

**Deliverables:**
- ✅ SQL guardrails production-ready (penetration tested)
- ✅ Business rules RAG pipeline functional (plugin + vector index)
- ✅ User feedback collection working (thumbs up/down + comments)
- ✅ All 5 intent types tested and working
- ✅ Load testing passed (100 concurrent users, <5s response time)
- ✅ Health check endpoint implemented
- ✅ API documented (Swagger UI)
- ✅ Deployment README updated
- ✅ Logging dashboard queries created
- ✅ Code cleaned up and reviewed
- ✅ Production deployment ready

---

## 6. File Change Matrix

### **Files to CREATE (New):**
```
dataAccess.Api/
  Controllers/
    ChatController.cs                        ← NEW: Streaming chat endpoint + feedback endpoint
  Services/
    ChatOrchestratorService.cs               ← NEW: Manages Router → Generator → Summarizer pipeline
    DatabaseSchemaService.cs                 ← NEW: Dynamic schema fetcher (keyword-based)
    SessionMemoryService.cs                  ← NEW: Session/context management
    TelemetryLogger.cs                       ← NEW: Log LLM interactions + user feedback
  Plugins/
    Orchestration/
      Router/
        skprompt.txt                         ← NEW: Intent classification prompt
        config.json                          ← NEW: Router execution settings (fast-llm)
    Database/
      GenerateSql/
        skprompt.txt                         ← NEW: SQL generation prompt
        config.json                          ← NEW: SQL generation settings (smart-llm)
    Analysis/
      SummarizeResults/
        skprompt.txt                         ← NEW: Result summarization prompt
        config.json                          ← NEW: Summarization settings (smart-llm)
    (Optional for future)
    Clarifier/
      AskForDetails/
        skprompt.txt                         ← NEW: Clarification prompt
        config.json                          ← NEW: Clarifier settings
    BusinessRules/
      QueryKnowledgeBase/
        skprompt.txt                         ← NEW: RAG-based business rules prompt
        config.json                          ← NEW: Business rules RAG settings

dataAccess/
  Entities/
    ChatSession.cs                           ← NEW: Entity for chat sessions
    ChatMessage.cs                           ← NEW: Entity for chat messages
    ChatFeedback.cs                          ← NEW: Entity for user feedback
  Migrations/
    YYYYMMDDHHMMSS_AddChatTables.cs          ← NEW: Migration for chat tables
```

### **Files to REFACTOR (Major Changes):**
```
Capcap/
  Services/
    IChatLlm.cs                              ← REFACTOR: Expand for streaming + SK
    GroqChatLlm.cs                           ← REFACTOR: Migrate to SK connector
  RouterService.cs                           ← REFACTOR: Use SK plugins, add streaming
  QueryClassifier.cs                         ← REFACTOR: Convert to SK plugin
  Program.cs                                 ← REFACTOR: Register SK services

dataAccess.Api/
  Program.cs                                 ← REFACTOR: Register SK, plugins, telemetry
  Services/
    QueryPipeline.cs                         ← REFACTOR: Integrate SK orchestration
    LlmSqlGenerator.cs                       ← REFACTOR: Use SK QueryPlugin
    YamlIntentRunner.cs                      ← REFACTOR: Use SK IntentPlugin
```

### **Files to UPDATE (Moderate Changes):**
```
dataAccess/
  Services/
    SqlQueryService.cs                       ← UPDATE: Integrate with SK QueryPlugin
    VectorSearchService.cs                   ← UPDATE: Add SK integration points + business rules index search
    HybridQueryService.cs                    ← UPDATE: Add SK integration points
  LLM/
    GroqJsonClient.cs                        ← UPDATE: Keep as fallback, add SK support

dataAccess.Api/
  Services/
    SafeSqlExecutor.cs                       ← UPDATE: Enhance guardrails, logging
    SqlValidator.cs                          ← UPDATE: Strengthen validation rules
    LlmSummarizer.cs                         ← UPDATE: Use SK KpiPlugin

  .env                                       ← UPDATE: Add SK API keys, config
  appsettings.json                           ← UPDATE: Add SK settings

Capcap/
  .env                                       ← UPDATE: Add SK API keys
```

### **Files to KEEP AS-IS (No Changes):**
```
dataAccess/
  AppDbContext.cs                            ← UPDATE: Add DbSets for chat entities
  Entities/                                  ← UPDATE: Add new chat entities
  Migrations/                                ← UPDATE: Add new migration for chat tables
  Forecasts/
    HybridForecastService.cs                 ← AS-IS: Forecasting logic unchanged
    SimpleForecastService.cs                 ← AS-IS: Keep for backward compatibility
  Services/
    EMAService.cs                            ← AS-IS: Forecasting helper unchanged
    SqlCatalog.cs                            ← AS-IS: SQL template catalog unchanged
    SqlBuilder.cs                            ← AS-IS: SQL building helpers unchanged
    OllamaEmbeddingProvider.cs               ← AS-IS: Embedding service unchanged
    VertexAISearchService.cs                 ← AS-IS: Vector search unchanged

dataAccess.Api/
  Controllers/
    ForecastController.cs                    ← AS-IS: Existing controller unchanged
    FaqController.cs                         ← AS-IS: Existing controller unchanged
  Services/
    ResponseFormatter.cs                     ← AS-IS: Keep existing formatters
    ReportSpecLoader.cs                      ← AS-IS: Report config unchanged
    VirtualTableRewriter.cs                  ← AS-IS: SQL rewriting unchanged

Shared/
  Allowlists/                                ← AS-IS: SQL allowlists unchanged (may enhance)
  DTOs/                                      ← AS-IS: Data transfer objects unchanged
  Enums/                                     ← AS-IS: Enums unchanged
```

### **Files to DEPRECATE (Optional):**
```
Capcap/
  QueryClassifier.cs                         ← DEPRECATE: Merged into IntentPlugin
  LightHeuristics                            ← DEPRECATE: Replaced by YAML prompts
```

### **Configuration Files to UPDATE:**
```
dataAccess.Api/
  dataAccess.Api.csproj                      ← UPDATE: Add SK NuGet packages
Capcap/
  Capcap.csproj                              ← UPDATE: Add SK NuGet packages
dataAccess/
  dataAccess.csproj                          ← UPDATE: Add SK NuGet packages (if needed)
```

---

## 7. Technology Stack

### **LLM Orchestration:**
- **Semantic Kernel (SK)** - Primary orchestration framework
- **Groq API** - Fast inference for intent classification (Llama 3.1 8B)
- **Hugging Face** - Ready for future fine-tuned models (SQL generation)

### **Models:**
- **Intent Classification:** Llama 3.1 8B Instant (Groq) - No fine-tuning needed
- **SQL Generation:** Llama 3.1 8B (Groq) → Future: Fine-tuned CodeLlama 7B (Hugging Face)
- **KPI Analysis:** Llama 3.3 70B Versatile (Groq) or Mixtral 8x7B

### **Deployment:**
- **OCI (Oracle Cloud Infrastructure)** - Primary hosting (cost-effective)
- **AWS Elastic Beanstalk** - Fallback/existing deployment

---

## 8. Guardrails & Security

### **SQL Security (Strict Enforcement):**
- ✅ **SELECT-only queries** (no DML/DDL)
- ✅ **Table/column allowlist** (via `SqlAllowlistV2`)
- ✅ **No DROP, DELETE, UPDATE, INSERT, ALTER**
- ✅ **Readonly database user**
- ✅ **Query timeout enforcement** (30s max)
- ✅ **Result set size limits** (10,000 rows max)

### **LLM Safety:**
- ✅ **Out-of-scope detection** (cooking, trivia, jokes → polite rejection)
- ✅ **Prompt injection protection** (validate user input)
- ✅ **Rate limiting** (prevent abuse)
- ✅ **Error message sanitization** (no sensitive data leaks)

### **Session Management:**
- ✅ **TTL (Time-to-Live):** 30 minutes per session
- ✅ **Max history:** 20 messages per session
- ✅ **Session ID validation** (prevent hijacking)

---

## 9. Database Schema for AI Chat System

### **New Tables Required for Production:**

#### **1. chat_sessions**
Stores information about each chat session/conversation.

```sql
CREATE TABLE public.chat_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  last_activity_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL, -- TTL: 30 minutes after last activity
  message_count integer NOT NULL DEFAULT 0,
  metadata jsonb, -- Store context, resolved slots, etc.
  CONSTRAINT chat_sessions_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_expires_at ON public.chat_sessions(expires_at);
```

#### **2. chat_messages**
Stores every message exchanged between user and AI (full telemetry for fine-tuning).

```sql
CREATE TABLE public.chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  intent text, -- faq, forecasting, report, nlq, chitchat, out_of_scope, business_rules_query
  domain text, -- sales, expenses, null
  confidence numeric(3,2), -- 0.00 to 1.00
  sql_generated text, -- The generated SQL query (if applicable)
  sql_validated boolean, -- Whether SQL passed validation
  sql_executed boolean, -- Whether SQL was executed successfully
  result_rows integer, -- Number of rows returned
  result_summary jsonb, -- Summarized result data for analysis
  analysis text, -- AI-generated insights/KPI analysis
  latency_ms integer, -- Total processing time
  model_name text, -- e.g., "llama-3.1-8b-instant"
  error_message text, -- Error details if something failed
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX idx_chat_messages_intent ON public.chat_messages(intent);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);
```

#### **3. chat_feedback**
Stores user feedback (thumbs up/down, ratings, comments) linked to specific messages.

```sql
CREATE TABLE public.chat_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  feedback_type text NOT NULL CHECK (feedback_type IN ('thumbs_up', 'thumbs_down', 'rating', 'comment')),
  rating integer CHECK (rating >= 1 AND rating <= 5), -- Optional 1-5 star rating
  comment text, -- Optional text feedback
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT chat_feedback_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT chat_feedback_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_feedback_message_id ON public.chat_feedback(message_id);
CREATE INDEX idx_chat_feedback_session_id ON public.chat_feedback(session_id);
CREATE INDEX idx_chat_feedback_user_id ON public.chat_feedback(user_id);
CREATE INDEX idx_chat_feedback_feedback_type ON public.chat_feedback(feedback_type);
```

### **Key Design Decisions:**

1. **UUID Primary Keys** - Better for distributed systems, prevents ID guessing
2. **session_id links everything** - Easy to query all messages + feedback for a session
3. **Cascading Deletes** - When a session is deleted, all messages and feedback are removed
4. **Indexes on Foreign Keys** - Fast joins and lookups
5. **JSONB for Metadata** - Flexible storage for evolving context/result data
6. **TTL via expires_at** - Automatic session cleanup (30 min after last activity)
7. **Enums via CHECK Constraints** - Data integrity at database level
8. **Separate Feedback Table** - Not all messages get feedback, normalized design

### **Differences from Existing FAQ Tables:**

| Feature | Existing (FAQ) | New (Chat) |
|---------|----------------|------------|
| **Session Tracking** | ❌ No session concept | ✅ Full session management |
| **Message History** | ❌ Only query logs | ✅ Full conversation history |
| **Intent/Domain** | ✅ Has intent field | ✅ Enhanced with domain + confidence |
| **SQL Telemetry** | ❌ No SQL tracking | ✅ Tracks SQL generation, validation, execution |
| **Feedback Linking** | ⚠️ Links to search_log_id | ✅ Links to specific message_id |
| **Latency Tracking** | ❌ No latency data | ✅ Tracks processing time per message |
| **Error Logging** | ❌ No error field | ✅ Stores error messages for debugging |
| **Model Versioning** | ❌ No model tracking | ✅ Tracks which model generated response |

---

## 10. Telemetry & Logging

### **Log Everything for Future Fine-tuning:**
All data is stored in the `chat_messages` table with this structure:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "abc123-def456",
  "role": "assistant",
  "content": "Sales increased 15% WoW...",
  "intent": "nlq",
  "domain": "sales",
  "confidence": 0.95,
  "sql_generated": "SELECT ...",
  "sql_validated": true,
  "sql_executed": true,
  "result_rows": 42,
  "result_summary": { /* JSONB data */ },
  "analysis": "Sales increased 15% WoW...",
  "latency_ms": 1234,
  "model_name": "llama-3.1-8b-instant",
  "error_message": null,
  "created_at": "2025-10-18T12:34:56Z"
}
```

User feedback is stored separately in `chat_feedback`:

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "abc123-def456",
  "user_id": "user-uuid",
  "feedback_type": "thumbs_up",
  "rating": 5,
  "comment": "Very helpful!",
  "created_at": "2025-10-18T12:35:10Z"
}
```

### **Metrics to Track:**
- Intent classification accuracy (via feedback analysis)
- SQL generation success rate (sql_validated / total attempts)
- Query execution time (latency_ms distribution)
- LLM latency (intent, query, analysis phases)
- User satisfaction (thumbs up/down ratios by intent/domain)
- Error rates by intent type
- Session duration and message count distributions

---

## 11. Success Criteria

### **Functional:**
- ✅ Chat endpoint streams LLM responses in real-time (< 2s first token)
- ✅ Function chaining works (intent → query → analysis)
- ✅ Clarifier resolves ambiguous queries
- ✅ SQL queries are safe, validated, and execute successfully
- ✅ KPI results returned for high-level queries
- ✅ Session memory preserves context across turns
- ✅ Out-of-scope queries handled gracefully
- ✅ Business rules RAG pipeline answers domain-specific questions accurately
- ✅ User feedback collection functional (thumbs up/down)
- ✅ Plugin files validated at startup (no runtime errors from malformed/missing files)

### **Non-Functional:**
- ✅ API responds within 5s for 95% of requests
- ✅ Zero SQL injection vulnerabilities
- ✅ Telemetry captures 100% of LLM interactions
- ✅ Error rate < 5%
- ✅ Graceful degradation on LLM API failures

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **LLM API latency** | High | Use streaming, optimize prompt size, cache common queries |
| **Groq API downtime** | Medium | Fallback to existing `GroqJsonClient`, queue requests |
| **Ambiguous queries** | Medium | Clarifier plugin, session memory, ask for clarification |
| **SQL injection** | Critical | Strict validator, allowlist, runtime checks, readonly user |
| **Session bloat** | Low | TTL (30min), max history (20 msgs), periodic cleanup |
| **Cost overruns (Groq API)** | Low | Monitor usage, set rate limits, optimize prompts |

---

## 13. Fine-tuning Strategy (Post-Refactor)

### **DO NOT Fine-tune Now:**
- ❌ Intent classification (already 95%+ accurate with prompts)
- ❌ Chitchat/FAQ (generic LLMs work great)

### **Collect Data Now, Fine-tune Later:**
- ✅ **SQL Query Generation** - Log all (query, SQL, success/failure)
  - Target: 500-1000 examples
  - Model: CodeLlama 7B or DeepSeek Coder 6.7B
  - Training: LoRA fine-tuning on OCI
  - Timeline: After 2-3 months of production data

### **Fine-tuning Trigger:**
- If SQL generation accuracy < 80% after refactor
- If recurring schema/column mapping errors
- If Taglish business terms not understood

---

## 14. References
- [Semantic Kernel Chat Completion (C#)](https://learn.microsoft.com/en-us/semantic-kernel/concepts/ai-services/chat-completion/?tabs=csharp-other%2Cpython-AzureOpenAI%2Cjava-AzureOpenAI&pivots=programming-language-csharp)
- [Semantic Kernel Plugins](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/)
- [Groq API Docs](https://groq.com/docs)
- [OpenAI API Docs](https://platform.openai.com/docs/api-reference)
- [saklAI Prompt Templates (YAML)](https://github.com/Lorieta/saklAI/tree/main/server/Prompts)
- [Server-Sent Events (SSE) in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-8.0)

---

## 15. Post-Sprint Tasks (Future Work)

### **Week 2 (After Refactor):**
- Monitor telemetry, identify common failure patterns
- Analyze user feedback (thumbs up/down ratios) to identify problematic response types
- Tune prompt templates based on real usage
- Optimize streaming performance
- Add Swagger UI for API documentation
- Expand business rules vector index with more documents

### **Month 1:**
- Migrate from in-memory sessions to Redis (if needed)
- Add detailed user feedback collection (text comments, not just thumbs)
- A/B test prompt variations
- Implement caching for common queries
- Create dashboard for telemetry visualization (success rates, latency, feedback scores)

### **Month 2-3:**
- Collect 500-1000 SQL generation examples
- Fine-tune CodeLlama 7B for SQL generation
- Deploy fine-tuned model to OCI
- A/B test fine-tuned vs baseline

---

## 16. Deployment Checklist

### **Pre-Deployment:**
- [ ] All tests passing (unit + integration)
- [ ] Database migrations applied (chat_sessions, chat_messages, chat_feedback tables created)
- [ ] Indexes created on all foreign keys and frequently queried columns
- [ ] SQL guardrails verified (penetration testing)
- [ ] Groq API keys configured in production `.env` or secrets manager
- [ ] User secrets configured for local development (no keys in source control)
- [ ] Telemetry logging functional (writes to database)
- [ ] User feedback endpoint tested (writes to chat_feedback table)
- [ ] Session cleanup job configured (delete expired sessions)
- [ ] Plugin validation working (app fails to start if skprompt.txt or config.json missing/invalid)
- [ ] Business rules vector index populated with documents
- [ ] Health check endpoints working
- [ ] All plugin files deployed (skprompt.txt + config.json for Router, GenerateSql, SummarizeResults, BusinessRules)
- [ ] Session memory TTL configured (30 minutes)
- [ ] Rate limiting enabled

### **Deployment:**
- [ ] Deploy to OCI staging environment
- [ ] Smoke test all intents (GetDataQuery, BusinessRuleQuery, ChitChat, Clarification, OutOfScope)
- [ ] Test business rules RAG responses
- [ ] Test user feedback collection (thumbs up/down)
- [ ] Load test streaming endpoint (100 concurrent users)
- [ ] Monitor logs for errors
- [ ] Deploy to production
- [ ] Monitor telemetry dashboard

### **Post-Deployment:**
- [ ] User acceptance testing (UAT)
- [ ] Collect feedback from early users (both automated thumbs and manual interviews)
- [ ] Verify business rules RAG accuracy with domain experts
- [ ] Document common issues and resolutions
- [ ] Plan next sprint based on telemetry and user feedback data

---

## 17. Developer Notes

### **Key Design Decisions:**
1. **Semantic Kernel over raw API calls** - Better abstraction, easier to swap LLMs
2. **SK-native prompts (skprompt.txt + config.json) over custom YAML** - No custom parsers, native SK support
3. **Streaming over batched responses** - Better UX, perceived performance
4. **In-memory sessions over Redis (for now)** - Simpler deployment, upgrade path clear
5. **Groq for speed, Hugging Face for custom models** - Best of both worlds
6. **Telemetry-first approach** - Data-driven optimization, fine-tuning readiness
7. **Context-Aware Plugin Design** - Orchestrator provides tailored context to each plugin. Router receives only user query, GenerateSql receives query + schema + date, SummarizeResults receives query + results. This prevents token overflow and keeps prompts highly relevant.
8. **Plugin Validation at Startup** - All plugins are validated for required files (skprompt.txt, config.json) at application startup. This prevents runtime errors caused by missing or malformed plugin files.
9. **Secure Configuration Management** - Sensitive API keys stored in user secrets for local development, separate from `.env` files. Production uses environment variables with proper secret management.
10. **User Feedback Loop** - Direct feedback collection via thumbs up/down buttons enables continuous improvement and helps identify problematic responses for future fine-tuning.
11. **Business Rules RAG** - Separate vector index for business rules/policies allows the assistant to answer domain-specific questions accurately without hardcoding knowledge.
12. **Multi-LLM Strategy** - Fast LLM for routing (cost-effective), smart LLM for complex tasks (SQL generation, summarization). This optimizes both cost and quality.

### **Code Style:**
- Use async/await everywhere
- Prefer record types for DTOs
- Use `IAsyncEnumerable` for streaming
- Log at INFO level for telemetry, DEBUG for troubleshooting
- Add XML comments for all public APIs

### **Testing Strategy:**
- Unit tests for plugins (intent, query, kpi, clarifier)
- Integration tests for chat endpoint
- Mock SK kernel in tests
- Use real Groq API in staging only

---

**End of Refactor Plan**
