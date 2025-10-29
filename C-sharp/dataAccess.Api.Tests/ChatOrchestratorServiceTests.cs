using System;
using System.Threading.Tasks;
using Xunit;
using dataAccess.Api.Services;
using dataAccess.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using Microsoft.SemanticKernel;
using Shared.Allowlists;

public class ChatOrchestratorServiceTests
{
    private static SqlValidator CreateValidator()
    {
        var allowlist = new Mock<ISqlAllowlist>(MockBehavior.Strict);
        allowlist.Setup(a => a.IsTableAllowed(It.IsAny<string>())).Returns(true);
        allowlist.Setup(a => a.IsColumnAllowed(It.IsAny<string>(), It.IsAny<string>())).Returns(true);
        allowlist.Setup(a => a.IsOperatorAllowed(It.IsAny<string>())).Returns(true);
        allowlist.SetupGet(a => a.DefaultLimit).Returns(100);
        allowlist.SetupGet(a => a.MaxLimit).Returns(1000);

        var validatorLogger = new Mock<ILogger<SqlValidator>>().Object;
        return new SqlValidator(allowlist.Object, validatorLogger);
    }

    [Fact]
    public void ChatOrchestratorService_ShouldInstantiate()
    {
        // Given - Create a real kernel instead of mocking
        var kernelBuilder = Kernel.CreateBuilder();
        kernelBuilder.AddOpenAIChatCompletion(
            modelId: "llama-3.1-8b-instant",
            apiKey: "test-key",
            serviceId: "fast-llm",
            endpoint: new Uri("https://api.groq.com/openai/v1")
        );
        var kernel = kernelBuilder.Build();
        
        var schemaService = new Mock<IDatabaseSchemaService>().Object;
        
        // Create a real TelemetryLogger with in-memory DbContext for testing
        var options = new DbContextOptionsBuilder<AiDbContext>()
            .UseInMemoryDatabase(databaseName: "TestDb")
            .Options;
        var dbContext = new AiDbContext(options);
        var telemetryLogger = new TelemetryLogger(dbContext);
        
        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var logger = new Mock<ILogger<ChatOrchestratorService>>().Object;
        var safeSqlExecutor = new Mock<ISafeSqlExecutor>().Object;
        var sqlValidator = CreateValidator();
        
        // When
        var orchestrator = new ChatOrchestratorService(kernel, schemaService, telemetryLogger, config, logger, sqlValidator, safeSqlExecutor);
        
        // Then
        Assert.NotNull(orchestrator);
    }
    
    [Fact(Skip = "Requires API keys and full integration environment")]
    public async Task HandleQueryAsync_ShouldRoute_ToDataQuery()
    {
        // This test is skipped because it requires:
        // 1. Valid API keys
        // 2. Plugin files loaded
        // 3. Database connection
        // Use integration tests for full E2E validation
        await Task.CompletedTask;
    }
}
