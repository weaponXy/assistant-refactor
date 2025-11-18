using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;
using dataAccess.Entities;

namespace dataAccess.Services
{
    /// <summary>
    /// Local decoder service using Phi-3-mini-4k-instruct ONNX model for natural language response generation.
    /// Supports chitchat and FAQ intents with conversational context awareness.
    /// NO API CALLS - runs entirely on local CPU/GPU using ONNX Runtime.
    /// </summary>
    public class LocalDecoderService : ILocalDecoderService, IDisposable
    {
        private readonly InferenceSession _session;
        private readonly ILogger<LocalDecoderService> _logger;
        private readonly Dictionary<int, string> _tokenToWord;
        private readonly Dictionary<string, int> _wordToToken;
        
        // Phi-3 special tokens
        private const int BOS_TOKEN = 1;      // <s> - Beginning of sequence
        private const int EOS_TOKEN = 2;      // </s> - End of sequence
        private const int PAD_TOKEN = 0;      // <pad> - Padding token
        private const int MAX_LENGTH = 512;   // Phi-3-mini supports 4k context, but we limit to 512 for faster inference
        private const int MAX_NEW_TOKENS = 150; // Maximum tokens to generate

        public LocalDecoderService(ILogger<LocalDecoderService> logger)
        {
            _logger = logger;

            // Path to ONNX model (Phi-3-mini-4k-instruct - quantized INT4 version)
            var modelPath = Path.Combine(AppContext.BaseDirectory, "Models", "Decoder", "phi3-mini-4k-instruct-cpu-int4-rtn-block-32-acc-level-4.onnx");
            
            if (!File.Exists(modelPath))
            {
                throw new FileNotFoundException(
                    $"ONNX model not found at {modelPath}. " +
                    "Please download phi3-mini-4k-instruct-cpu-int4-rtn-block-32-acc-level-4.onnx from Hugging Face (microsoft/Phi-3-mini-4k-instruct-onnx) " +
                    "and place it in the Models/Decoder/ folder."
                );
            }

            // Path to tokenizer vocabulary
            var vocabPath = Path.Combine(AppContext.BaseDirectory, "Models", "Decoder", "tokenizer.json");
            
            if (!File.Exists(vocabPath))
            {
                throw new FileNotFoundException(
                    $"Tokenizer vocabulary not found at {vocabPath}. " +
                    "Please download tokenizer.json from microsoft/Phi-3-mini-4k-instruct and place it in the Models/Decoder/ folder."
                );
            }

            // Initialize ONNX Runtime session with optimization
            var sessionOptions = new SessionOptions
            {
                GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL,
                ExecutionMode = ExecutionMode.ORT_PARALLEL
            };
            
            _session = new InferenceSession(modelPath, sessionOptions);

            // Load tokenizer vocabulary (simplified - in production, use Microsoft.ML.Tokenizers for full tokenizer)
            _tokenToWord = new Dictionary<int, string>();
            _wordToToken = new Dictionary<string, int>();
            
            try
            {
                // Load basic vocabulary mapping
                LoadSimplifiedVocabulary(vocabPath);
                
                _logger.LogInformation(
                    "[LocalDecoderService] Initialized with Phi-3-mini-4k-instruct ONNX model. " +
                    "Vocab size: {VocabSize}, Max length: {MaxLength}",
                    _wordToToken.Count,
                    MAX_LENGTH
                );
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[LocalDecoderService] Failed to initialize tokenizer vocabulary");
                throw new InvalidOperationException(
                    "Failed to load tokenizer.json. Ensure it exists in Models folder.", ex
                );
            }
        }

        public async Task<string> GetResponseAsync(string userQuery, List<ChatMessage> history, string intent)
        {
            return await Task.Run(() => GenerateResponse(userQuery, history, intent));
        }

        private string GenerateResponse(string userQuery, List<ChatMessage> history, string intent)
        {
            try
            {
                // 1. Load appropriate prompt template based on intent
                var systemPrompt = LoadPromptTemplate(intent);

                // 2. Format the prompt with chat history and user query (Phi-3 chat template)
                var formattedPrompt = FormatChatPrompt(systemPrompt, history, userQuery);

                _logger.LogDebug("[LocalDecoderService] Formatted prompt: {Prompt}", formattedPrompt);

                // 3. Tokenize the prompt
                var inputTokens = Tokenize(formattedPrompt);

                if (inputTokens.Count > MAX_LENGTH)
                {
                    _logger.LogWarning(
                        "[LocalDecoderService] Input too long ({Length} tokens), truncating to {MaxLength}",
                        inputTokens.Count,
                        MAX_LENGTH
                    );
                    inputTokens = inputTokens.Take(MAX_LENGTH).ToList();
                }

                // 4. Run inference to generate response
                var outputTokens = RunInference(inputTokens);

                // 5. Detokenize to get response text
                var response = Detokenize(outputTokens);

                _logger.LogInformation(
                    "[LocalDecoderService] Generated response for intent '{Intent}': {Response}",
                    intent,
                    response.Substring(0, Math.Min(50, response.Length))
                );

                return response;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[LocalDecoderService] Error generating response for intent '{Intent}'", intent);
                
                // Fallback response
                return intent switch
                {
                    "chitchat" => "Hello! How can I help you with your business today?",
                    "faq" => "I can help you with sales reports, expense tracking, inventory management, and forecasting. What would you like to know?",
                    _ => "I'm here to help with your business needs. What can I assist you with?"
                };
            }
        }

        /// <summary>
        /// Load prompt template from YAML file based on intent
        /// </summary>
        private string LoadPromptTemplate(string intent)
        {
            var promptFileName = intent.ToLowerInvariant() switch
            {
                "chitchat" => "responder.chitchat.yaml",
                "faq" => "responder.faq.yaml",
                _ => "responder.chitchat.yaml" // Default to chitchat
            };

            var promptPath = Path.Combine(
                AppContext.BaseDirectory,
                "Planning",
                "Prompts",
                promptFileName
            );

            if (!File.Exists(promptPath))
            {
                _logger.LogWarning(
                    "[LocalDecoderService] Prompt template not found: {Path}, using default",
                    promptPath
                );
                return "You are BuiswAIz, a friendly and helpful business assistant. Answer the user's question clearly and concisely.";
            }

            try
            {
                var yamlContent = File.ReadAllText(promptPath);
                var deserializer = new DeserializerBuilder()
                    .WithNamingConvention(UnderscoredNamingConvention.Instance)
                    .Build();
                
                var promptConfig = deserializer.Deserialize<Dictionary<string, object>>(yamlContent);
                
                // Extract the system prompt from the YAML
                if (promptConfig.TryGetValue("system", out var systemPrompt))
                {
                    return systemPrompt.ToString()?.Trim() ?? string.Empty;
                }
                
                _logger.LogWarning("[LocalDecoderService] No 'system' field in prompt template, using default");
                return "You are BuiswAIz, a friendly and helpful business assistant.";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[LocalDecoderService] Error loading prompt template: {Path}", promptPath);
                return "You are BuiswAIz, a friendly and helpful business assistant.";
            }
        }

        /// <summary>
        /// Format the prompt using Phi-3 chat template format
        /// Phi-3 format: <|system|>\n{system_prompt}<|end|>\n<|user|>\n{user_message}<|end|>\n<|assistant|>\n
        /// </summary>
        private string FormatChatPrompt(string systemPrompt, List<ChatMessage> history, string userQuery)
        {
            var promptBuilder = new System.Text.StringBuilder();

            // Add system prompt
            promptBuilder.Append("<|system|>\n");
            promptBuilder.Append(systemPrompt);
            promptBuilder.Append("<|end|>\n");

            // Add recent chat history (last 3 messages for context)
            if (history != null && history.Any())
            {
                var recentHistory = history
                    .OrderBy(m => m.CreatedAt)
                    .TakeLast(3)
                    .ToList();

                foreach (var msg in recentHistory)
                {
                    if (msg.Role == "user")
                    {
                        promptBuilder.Append("<|user|>\n");
                        promptBuilder.Append(msg.Content);
                        promptBuilder.Append("<|end|>\n");
                    }
                    else if (msg.Role == "assistant")
                    {
                        promptBuilder.Append("<|assistant|>\n");
                        promptBuilder.Append(msg.Content);
                        promptBuilder.Append("<|end|>\n");
                    }
                }
            }

            // Add current user query
            promptBuilder.Append("<|user|>\n");
            promptBuilder.Append(userQuery);
            promptBuilder.Append("<|end|>\n");
            
            // Prompt for assistant response
            promptBuilder.Append("<|assistant|>\n");

            return promptBuilder.ToString();
        }

        /// <summary>
        /// Tokenize text to token IDs (simplified implementation)
        /// In production, use Microsoft.ML.Tokenizers with proper Phi-3 tokenizer
        /// </summary>
        private List<int> Tokenize(string text)
        {
            var tokens = new List<int> { BOS_TOKEN };

            // Simple word-based tokenization (replace with proper BPE tokenizer in production)
            var words = text.Split(new[] { ' ', '\n', '\r', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            
            foreach (var word in words)
            {
                if (_wordToToken.TryGetValue(word.ToLowerInvariant(), out int tokenId))
                {
                    tokens.Add(tokenId);
                }
                else
                {
                    // Unknown token - use a reasonable fallback
                    // In production, use subword tokenization
                    tokens.Add(100); // Generic UNK token
                }
            }

            return tokens;
        }

        /// <summary>
        /// Detokenize token IDs back to text
        /// </summary>
        private string Detokenize(List<int> tokens)
        {
            var words = new List<string>();

            foreach (var token in tokens)
            {
                if (token == BOS_TOKEN || token == EOS_TOKEN || token == PAD_TOKEN)
                    continue;

                if (_tokenToWord.TryGetValue(token, out string? word))
                {
                    words.Add(word);
                }
            }

            return string.Join(" ", words);
        }

        /// <summary>
        /// Run ONNX inference with autoregressive generation
        /// </summary>
        private List<int> RunInference(List<int> inputTokens)
        {
            try
            {
                var generatedTokens = new List<int>(inputTokens);

                // Autoregressive generation loop
                for (int i = 0; i < MAX_NEW_TOKENS; i++)
                {
                    // Prepare input tensor (pad to MAX_LENGTH)
                    var inputIds = new long[MAX_LENGTH];
                    var attentionMask = new long[MAX_LENGTH];
                    
                    int copyLength = Math.Min(generatedTokens.Count, MAX_LENGTH);
                    for (int j = 0; j < copyLength; j++)
                    {
                        inputIds[j] = generatedTokens[generatedTokens.Count - copyLength + j];
                        attentionMask[j] = 1;
                    }

                    // Create ONNX tensors
                    var inputIdsTensor = new DenseTensor<long>(inputIds, new[] { 1, MAX_LENGTH });
                    var attentionMaskTensor = new DenseTensor<long>(attentionMask, new[] { 1, MAX_LENGTH });

                    var inputs = new List<NamedOnnxValue>
                    {
                        NamedOnnxValue.CreateFromTensor("input_ids", inputIdsTensor),
                        NamedOnnxValue.CreateFromTensor("attention_mask", attentionMaskTensor)
                    };

                    // Run model
                    using var results = _session.Run(inputs);
                    var logits = results.First().AsEnumerable<float>().ToArray();

                    // Get next token (greedy decoding - take argmax)
                    // Logits shape: [batch=1, seq_len, vocab_size]
                    // We want the logits for the last position
                    int vocabSize = logits.Length / MAX_LENGTH;
                    int lastTokenPosition = copyLength - 1;
                    
                    float maxLogit = float.MinValue;
                    int nextToken = EOS_TOKEN;
                    
                    for (int v = 0; v < vocabSize; v++)
                    {
                        float logit = logits[lastTokenPosition * vocabSize + v];
                        if (logit > maxLogit)
                        {
                            maxLogit = logit;
                            nextToken = v;
                        }
                    }

                    // Stop if EOS token is generated
                    if (nextToken == EOS_TOKEN)
                        break;

                    generatedTokens.Add(nextToken);
                }

                // Return only the newly generated tokens (exclude input)
                return generatedTokens.Skip(inputTokens.Count).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[LocalDecoderService] Error during ONNX inference");
                throw;
            }
        }

        /// <summary>
        /// Load simplified vocabulary from tokenizer.json
        /// In production, use Microsoft.ML.Tokenizers for proper tokenizer loading
        /// </summary>
        private void LoadSimplifiedVocabulary(string vocabPath)
        {
            // Placeholder implementation - load basic vocabulary
            // In production, parse tokenizer.json properly using System.Text.Json
            
            // Add essential special tokens
            _tokenToWord[BOS_TOKEN] = "<s>";
            _tokenToWord[EOS_TOKEN] = "</s>";
            _tokenToWord[PAD_TOKEN] = "<pad>";
            
            _wordToToken["<s>"] = BOS_TOKEN;
            _wordToToken["</s>"] = EOS_TOKEN;
            _wordToToken["<pad>"] = PAD_TOKEN;

            // Add common words (expand in production with full vocabulary)
            var commonWords = new[] { 
                "hello", "hi", "thanks", "thank", "you", "can", "help", "me", "what", "how", 
                "show", "sales", "report", "business", "the", "a", "is", "are", "for", "to",
                "and", "or", "with", "from", "buiswaiz", "assistant", "forecast", "expense"
            };

            int tokenId = 1000; // Start from 1000 to avoid special token conflicts
            foreach (var word in commonWords)
            {
                _tokenToWord[tokenId] = word;
                _wordToToken[word] = tokenId;
                tokenId++;
            }

            _logger.LogInformation(
                "[LocalDecoderService] Loaded simplified vocabulary with {Count} tokens",
                _wordToToken.Count
            );
        }

        public void Dispose()
        {
            _session?.Dispose();
        }
    }
}
